import { useCallback, useEffect, useRef, useState } from 'react';

export const DEFAULT_TERMINAL_SYMBOL = 'BTC/USDT';
export const TERMINAL_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type TerminalSymbol = string;
export type TerminalTimeframe = (typeof TERMINAL_TIMEFRAMES)[number];
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type BookLevel = { price: number; quantity: number };
export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';
export type SpotMarket = {
  symbol: string;
  apiSymbol: string;
  baseAsset: string;
  quoteAsset: string;
  lastPrice: number;
  changePercent: number;
  quoteVolume: number;
};

const API_BASE = 'https://api.binance.com/api/v3';
const STREAM_BASE = 'wss://stream.binance.com:9443/stream?streams=';

export function useBinanceMarkets() {
  const [markets, setMarkets] = useState<SpotMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!loadedRef.current) setLoading(true);
    setError(null);
    try {
      const [infoResponse, tickerResponse] = await Promise.all([
        fetch(`${API_BASE}/exchangeInfo`, { signal: controller.signal, cache: 'force-cache' }),
        fetch(`${API_BASE}/ticker/24hr`, { signal: controller.signal, cache: 'no-store' }),
      ]);
      if (!infoResponse.ok) throw new Error(`Binance market list returned HTTP ${infoResponse.status}.`);
      if (!tickerResponse.ok) throw new Error(`Binance market prices returned HTTP ${tickerResponse.status}.`);
      const info = await infoResponse.json() as { symbols?: Array<Record<string, unknown>> };
      const tickerRows = await tickerResponse.json() as Array<Record<string, unknown>>;
      if (!Array.isArray(info.symbols) || !Array.isArray(tickerRows)) {
        throw new Error('Binance returned an unexpected spot-market response.');
      }
      const tickerBySymbol = new Map(tickerRows.map((row) => [String(row.symbol ?? ''), row]));
      const nextMarkets = info.symbols
        .filter((row) => row.status === 'TRADING' && row.isSpotTradingAllowed === true)
        .map((row) => {
          const apiSymbol = String(row.symbol ?? '');
          const ticker = tickerBySymbol.get(apiSymbol);
          const lastPrice = Number(ticker?.lastPrice);
          const changePercent = Number(ticker?.priceChangePercent);
          const quoteVolume = Number(ticker?.quoteVolume);
          const baseAsset = String(row.baseAsset ?? '');
          const quoteAsset = String(row.quoteAsset ?? '');
          return {
            symbol: `${baseAsset}/${quoteAsset}`,
            apiSymbol,
            baseAsset,
            quoteAsset,
            lastPrice,
            changePercent,
            quoteVolume,
          };
        })
        .filter((market) =>
          market.apiSymbol.length > 0 &&
          market.baseAsset.length > 0 &&
          market.quoteAsset.length > 0 &&
          Number.isFinite(market.lastPrice) &&
          market.lastPrice > 0 &&
          Number.isFinite(market.changePercent) &&
          Number.isFinite(market.quoteVolume),
        )
        .sort((a, b) => b.quoteVolume - a.quoteVolume);
      if (controller.signal.aborted) return;
      if (!nextMarkets.length) throw new Error('Binance did not return any active spot markets.');
      loadedRef.current = true;
      setMarkets(nextMarkets);
      setUpdatedAt(Date.now());
    } catch (cause: unknown) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Unable to load Binance spot markets.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => {
      clearInterval(interval);
      requestRef.current?.abort();
    };
  }, [refresh]);

  return { markets, loading, error, updatedAt, refresh };
}

function toPair(symbol: TerminalSymbol) {
  return symbol.replace('/', '').toLowerCase();
}

export function useBinanceMarket(symbol: TerminalSymbol, timeframe: TerminalTimeframe) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleLoading, setCandleLoading] = useState(true);
  const [candleError, setCandleError] = useState<string | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const [bids, setBids] = useState<BookLevel[]>([]);
  const [asks, setAsks] = useState<BookLevel[]>([]);
  const [streamStatus, setStreamStatus] = useState<ConnectionState>('connecting');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const pair = toPair(symbol);

  const loadCandles = useCallback(async (signal?: AbortSignal) => {
    setCandleLoading(true);
    setCandleError(null);
    setCandles([]);
    try {
      const response = await fetch(`${API_BASE}/klines?symbol=${pair.toUpperCase()}&interval=${timeframe}&limit=500`, { signal });
      if (!response.ok) throw new Error(`Binance returned HTTP ${response.status}`);
      const rows = await response.json() as unknown[][];
      if (!Array.isArray(rows)) throw new Error('Unexpected market-data response.');
      const parsed = rows.map((row) => ({
        time: Math.floor(Number(row[0]) / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      })).filter((row) => Object.values(row).every(Number.isFinite)).sort((a, b) => a.time - b.time);
      if (!parsed.length) throw new Error('Binance returned no candles for this interval.');
      setCandles(parsed);
      setUpdatedAt(Date.now());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setCandleError(error instanceof Error ? error.message : 'Unable to load Binance candles.');
    } finally {
      if (!signal?.aborted) setCandleLoading(false);
    }
  }, [pair, timeframe]);

  useEffect(() => {
    const controller = new AbortController();
    void loadCandles(controller.signal);
    return () => controller.abort();
  }, [loadCandles]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;
    let activePair = pair;
    setLastPrice(null);
    setPriceChange(null);
    setBids([]);
    setAsks([]);
    setStreamStatus('connecting');
    const streams = `${activePair}@ticker/${activePair}@depth10@100ms/${activePair}@kline_${timeframe}`;
    const connect = () => {
      if (stopped) return;
      setStreamStatus(retryDelay > 1000 ? 'reconnecting' : 'connecting');
      try {
        socket = new WebSocket(`${STREAM_BASE}${streams}`);
      } catch {
        scheduleReconnect();
        return;
      }
      socket.onopen = () => {
        if (stopped) return;
        retryDelay = 1000;
        setStreamStatus('live');
      };
      socket.onmessage = (event) => {
        if (stopped) return;
        try {
          const envelope = JSON.parse(event.data as string) as { stream: string; data: Record<string, unknown> };
          const { stream, data } = envelope;
          if (stream.endsWith('@ticker')) {
            const price = Number(data.c);
            const change = Number(data.P);
            if (Number.isFinite(price)) setLastPrice(price);
            if (Number.isFinite(change)) setPriceChange(change);
            setUpdatedAt(Date.now());
          } else if (stream.includes('@depth')) {
            const rawBids = (data.bids ?? data.b) as string[][] | undefined;
            const rawAsks = (data.asks ?? data.a) as string[][] | undefined;
            const nextBids = rawBids?.map(([price, quantity]) => ({ price: Number(price), quantity: Number(quantity) })) ?? [];
            const nextAsks = rawAsks?.map(([price, quantity]) => ({ price: Number(price), quantity: Number(quantity) })) ?? [];
            setBids(nextBids.filter((level) => Number.isFinite(level.price) && Number.isFinite(level.quantity)));
            setAsks(nextAsks.filter((level) => Number.isFinite(level.price) && Number.isFinite(level.quantity)));
            setUpdatedAt(Date.now());
          } else if (stream.includes('@kline_')) {
            const kline = data.k as Record<string, unknown> | undefined;
            if (!kline) return;
            const updated: Candle = {
              time: Math.floor(Number(kline.t) / 1000),
              open: Number(kline.o),
              high: Number(kline.h),
              low: Number(kline.l),
              close: Number(kline.c),
              volume: Number(kline.v),
            };
            if (!Object.values(updated).every(Number.isFinite)) return;
            setCandles((current) => {
              const copy = [...current];
              const last = copy[copy.length - 1];
              if (last?.time === updated.time) copy[copy.length - 1] = updated;
              else if (!last || updated.time > last.time) copy.push(updated);
              return copy.slice(-500);
            });
            setLastPrice(updated.close);
            setUpdatedAt(Date.now());
          }
        } catch {
          // Ignore malformed public stream frames; the socket status remains observable.
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (!stopped) scheduleReconnect();
      };
    };
    const scheduleReconnect = () => {
      if (stopped) return;
      setStreamStatus('reconnecting');
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, 30000);
        connect();
      }, retryDelay);
    };
    retryRef.current = () => {
      if (stopped) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryDelay = 1000;
      socket?.close();
      if (!socket || socket.readyState === WebSocket.CLOSED) connect();
    };
    connect();
    return () => {
      stopped = true;
      retryRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [pair, timeframe]);

  const retryCandles = useCallback(() => { void loadCandles(); }, [loadCandles]);
  const reconnect = useCallback(() => { retryRef.current?.(); }, []);
  return { candles, candleLoading, candleError, lastPrice, priceChange, bids, asks, streamStatus, updatedAt, retryCandles, reconnect };
}

