import { useCallback, useEffect, useRef, useState } from 'react';

export const TERMINAL_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'] as const;
export const TERMINAL_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type TerminalSymbol = (typeof TERMINAL_SYMBOLS)[number];
export type TerminalTimeframe = (typeof TERMINAL_TIMEFRAMES)[number];
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type BookLevel = { price: number; quantity: number };
export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

const API_BASE = 'https://api.binance.com/api/v3';
const STREAM_BASE = 'wss://stream.binance.com:9443/stream?streams=';

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

