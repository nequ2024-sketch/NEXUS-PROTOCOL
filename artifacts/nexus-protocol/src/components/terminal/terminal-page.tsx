import { useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Activity, ArrowDownRight, ArrowUpRight, CircleAlert, ExternalLink, RefreshCw, Search, Wifi, WifiOff } from 'lucide-react';
import { ChartPanel } from '@/components/terminal/chart-panel';
import { TradePanel } from '@/components/terminal/trade-panel';
import { DEFAULT_TERMINAL_SYMBOL, TERMINAL_TIMEFRAMES, useBinanceMarket, useBinanceMarkets, type BookLevel, type Candle, type SpotMarket, type TerminalSymbol, type TerminalTimeframe } from '@/hooks/use-binance-market';
import { TESTNET_CHAIN_ID } from '@/lib/contracts';

type BottomTab = 'positions' | 'history' | 'performance';

const formatPrice = (price: number, _symbol: TerminalSymbol) => {
  const digits = price >= 1000 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 6 : 8;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.min(digits, 2),
    maximumFractionDigits: digits,
  }).format(price);
};

const formatVolume = (volume: number) => new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(volume);

function depthRows(levels: BookLevel[], side: 'bid' | 'ask') {
  const maxTotal = levels.reduce((sum, item) => sum + item.quantity, 0);
  return levels.map((level, index) => {
    const total = levels.slice(0, index + 1).reduce((sum, item) => sum + item.quantity, 0);
    return { ...level, total, depthPct: maxTotal > 0 ? total / maxTotal * 100 : 0, side };
  });
}

function OrderBook({ symbol, price, bids, asks, streamStatus }: { symbol: TerminalSymbol; price: number | null; bids: BookLevel[]; asks: BookLevel[]; streamStatus: string }) {
  const bidRows = useMemo(() => depthRows(bids.slice(0, 10), 'bid'), [bids]);
  const askRows = useMemo(() => depthRows(asks.slice(0, 10), 'ask').reverse(), [asks]);
  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  const spread = bestBid !== undefined && bestAsk !== undefined ? bestAsk - bestBid : null;
  const spreadBps = spread !== null && bestBid !== undefined ? spread / bestBid * 10000 : null;
  const noDepth = bids.length === 0 && asks.length === 0;
  const levelRows = (rows: ReturnType<typeof depthRows>) => rows.map((row, index) => <div className={`book-row ${row.side}`} key={`${row.side}-${row.price}-${index}`} data-testid={`row-book-${row.side}-${index}`}>
    <div className="book-depth-bar" style={{ width: `${row.depthPct}%` }} />
    <span>{formatPrice(row.price, symbol)}</span><span>{row.quantity.toFixed(5)}</span><span>{row.total.toFixed(5)}</span>
  </div>);
  return <section className="terminal-panel orderbook-panel">
    <div className="terminal-panel-head"><div><div className="terminal-panel-label">ORDER BOOK</div><div className="terminal-symbol-caption">{symbol} <span>/ SPOT</span></div></div><span className={`terminal-live-dot ${streamStatus === 'live' ? 'online' : ''}`}><i /> {streamStatus === 'live' ? 'LIVE DEPTH' : streamStatus.toUpperCase()}</span></div>
    <div className="book-columns"><span>PRICE</span><span>SIZE</span><span>TOTAL</span></div>
    <div className="book-levels asks" aria-label="Sell asks">{noDepth ? <div className="book-empty">{streamStatus === 'live' ? 'NO DEPTH LEVELS RECEIVED' : 'WAITING FOR DEPTH STREAM'}</div> : levelRows(askRows)}</div>
    <div className="book-spread">
      <div className="book-mark-price">{price === null ? '—' : formatPrice(price, symbol)}</div>
      <div className="book-spread-label">LAST TRADED PRICE</div>
      <div className="book-spread-detail">
        <span>SPREAD <b>{spread === null ? '—' : formatPrice(spread, symbol)}</b></span>
        <span>{spreadBps === null ? '—' : `${spreadBps.toFixed(2)} bps`}</span>
      </div>
    </div>
    <div className="book-levels bids" aria-label="Buy bids">{noDepth ? null : levelRows(bidRows)}</div>
    <div className="book-best"><span>BEST BID <b>{bestBid === undefined ? '—' : formatPrice(bestBid, symbol)}</b></span><span>BEST ASK <b>{bestAsk === undefined ? '—' : formatPrice(bestAsk, symbol)}</b></span></div>
    <div className="terminal-panel-foot">PUBLIC BINANCE DEPTH · 10 LEVELS · LIVE STREAM</div>
  </section>;
}

function MarketOverview({
  markets,
  loading,
  error,
  updatedAt,
  selectedSymbol,
  onSelect,
  onRefresh,
}: {
  markets: SpotMarket[];
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const filtered = useMemo(() => {
    const query = search.trim().toUpperCase().replace('/', '');
    return query
      ? markets.filter((market) => market.apiSymbol.includes(query) || market.baseAsset.includes(query) || market.quoteAsset.includes(query))
      : markets;
  }, [markets, search]);

  return <section className="terminal-panel terminal-markets-panel">
    <div className="terminal-panel-head">
      <div><div className="terminal-panel-label">ALL BINANCE SPOT MARKETS</div><div className="terminal-symbol-caption">PUBLIC 24H TICKERS · {markets.length.toLocaleString()} PAIRS</div></div>
      <div className="market-list-status">{loading ? 'LOADING' : updatedAt ? `UPDATED ${new Date(updatedAt).toLocaleTimeString()}` : 'UNAVAILABLE'}<button type="button" onClick={onRefresh} aria-label="Refresh Binance spot market prices"><RefreshCw /></button></div>
    </div>
    <div className="market-list-toolbar">
      <label className="market-search" htmlFor="market-search"><Search aria-hidden="true" /><input id="market-search" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(20); }} placeholder="Search all pairs or assets" /></label>
      <span>{filtered.length.toLocaleString()} markets</span>
    </div>
    {error && <div className="market-list-error" role="status"><CircleAlert />{error}{markets.length > 0 ? ' Showing the last successful snapshot.' : ''}</div>}
    {loading && markets.length === 0 ? <div className="terminal-no-records">Loading Binance spot market list and prices…</div> :
      markets.length === 0 ? <div className="terminal-no-records">Binance spot market data is unavailable. No prices are shown as live.</div> :
        filtered.length === 0 ? <div className="terminal-no-records">No listed pair matches “{search}”.</div> :
          <div className="market-list-rows" role="list" aria-label="All Binance Spot markets">
            {filtered.slice(0, visibleCount).map((market) => <button
              className={`market-row ${selectedSymbol === market.symbol ? 'selected' : ''}`}
              type="button"
              role="listitem"
              key={market.apiSymbol}
              onClick={() => onSelect(market.symbol)}
              aria-pressed={selectedSymbol === market.symbol}
            >
              <span className="market-pair"><b>{market.baseAsset}</b><small>/{market.quoteAsset}</small></span>
              <b className="market-last-price">{formatPrice(market.lastPrice, market.symbol)}</b>
              <span className={`market-change ${market.changePercent >= 0 ? 'positive' : 'negative'}`}>{market.changePercent >= 0 ? '+' : ''}{market.changePercent.toFixed(2)}%</span>
              <span className="market-volume">{formatVolume(market.quoteVolume)} <small>{market.quoteAsset}</small></span>
            </button>)}
          </div>}
    {filtered.length > visibleCount && <button type="button" className="market-show-more" onClick={() => setVisibleCount((count) => count + 20)}>SHOW 20 MORE · {filtered.length - visibleCount} REMAINING</button>}
    <div className="market-list-footnote">Public Binance Spot snapshot refreshes every 30 seconds. The selected chart and order book use the live stream. Testnet orders can only use symbols listed by Binance Spot Testnet.</div>
  </section>;
}

type SignalSide = 'BUY' | 'SELL';
type SignalRequest = { side: SignalSide; requestId: number };

function SignalFeed({
  candles,
  symbol,
  timeframe,
  loading,
  error,
  onUseSide,
}: {
  candles: Candle[];
  symbol: TerminalSymbol;
  timeframe: TerminalTimeframe;
  loading: boolean;
  error: string | null;
  onUseSide: (side: SignalSide) => void;
}) {
  const snapshot = useMemo(() => {
    if (loading || error) return null;
    const timeframeSeconds: Record<TerminalTimeframe, number> = {
      '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
    };
    const nowSeconds = Date.now() / 1000;
    const closed = candles.filter((candle) =>
      candle.time + timeframeSeconds[timeframe] <= nowSeconds &&
      Number.isFinite(candle.close) &&
      candle.close > 0,
    );
    if (closed.length < 35) return null;

    const closes = closed.map((candle) => candle.close);
    const period = 14;
    let averageGain = 0;
    let averageLoss = 0;
    for (let index = 1; index <= period; index += 1) {
      const change = closes[index] - closes[index - 1];
      if (change > 0) averageGain += change;
      else averageLoss -= change;
    }
    averageGain /= period;
    averageLoss /= period;
    for (let index = period + 1; index < closes.length; index += 1) {
      const change = closes[index] - closes[index - 1];
      averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
      averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    }
    const rsi = averageLoss === 0
      ? (averageGain === 0 ? 50 : 100)
      : 100 - 100 / (1 + averageGain / averageLoss);

    const emaPeriod = 20;
    const alpha = 2 / (emaPeriod + 1);
    let ema = closes.slice(0, emaPeriod).reduce((sum, value) => sum + value, 0) / emaPeriod;
    for (let index = emaPeriod; index < closes.length; index += 1) {
      ema = closes[index] * alpha + ema * (1 - alpha);
    }
    const close = closes[closes.length - 1];
    const side: SignalSide | 'HOLD' = rsi < 30 && close > ema
      ? 'BUY'
      : rsi > 70 && close < ema
        ? 'SELL'
        : 'HOLD';
    return { side, rsi, ema, close, candleTime: closed[closed.length - 1].time };
  }, [candles, error, loading, timeframe]);

  const state = loading ? 'loading' : error ? 'unavailable' : snapshot ? snapshot.side.toLowerCase() : 'waiting';
  const label = loading
    ? 'LOADING PUBLIC CANDLES'
    : error
      ? 'MARKET DATA UNAVAILABLE'
      : snapshot
        ? `${snapshot.side} · RSI 14 / EMA 20`
        : 'WAITING FOR 35 CLOSED CANDLES';
  return <section className="terminal-panel signal-panel">
    <div className="terminal-panel-head"><div><div className="terminal-panel-label">TECHNICAL SIGNAL PREVIEW</div><div className="terminal-symbol-caption">{symbol} · {timeframe.toUpperCase()} · RSI 14 + EMA 20</div></div><span className="terminal-tag purple-tag">RULE-BASED · TEST ONLY</span></div>
    <div className={`technical-signal-card ${state}`}>
      <div className="technical-signal-main">
        <div className="terminal-empty-mark"><Activity /></div>
        <div><span className="technical-signal-label">CURRENT RULE OUTPUT</span><strong>{label}</strong></div>
      </div>
      {snapshot && <div className="technical-signal-metrics">
        <div><span>RSI · 14</span><b>{snapshot.rsi.toFixed(1)}</b></div>
        <div><span>EMA · 20</span><b>{formatPrice(snapshot.ema, symbol)}</b></div>
        <div><span>CLOSED PRICE</span><b>{formatPrice(snapshot.close, symbol)}</b></div>
        <div><span>BAR TIME</span><b>{new Date(snapshot.candleTime * 1000).toLocaleTimeString()}</b></div>
      </div>}
      {snapshot && (snapshot.side === 'BUY' || snapshot.side === 'SELL') && <button className="signal-use-side" type="button" onClick={() => onUseSide(snapshot.side as SignalSide)}>
        SET {snapshot.side} IN ORDER PANEL
      </button>}
    </div>
    <div className="signal-footnote"><CircleAlert /> This is a simple RSI/EMA rule on public Binance data, not an AI prediction or a tested-profit claim. It never submits an order; selecting BUY/SELL only sets the side in the order panel. Every order still needs a fresh quote and your confirmation.</div>
  </section>;
}

function NoRecords({ title, detail }: { title: string; detail: string }) {
  return <div className="terminal-no-records"><div className="terminal-empty-mark"><CircleAlert /></div><strong>{title}</strong><p>{detail}</p></div>;
}

function BottomDock({ active, onChange }: { active: BottomTab; onChange: (tab: BottomTab) => void }) {
  const tabs: { id: BottomTab; label: string }[] = [{ id: 'positions', label: 'POSITIONS' }, { id: 'history', label: 'HISTORY' }, { id: 'performance', label: 'PERFORMANCE' }];
  return <section className="terminal-panel bottom-dock">
    <div className="bottom-dock-head">
      <div className="terminal-bottom-tabs" role="tablist" aria-label="Trading records">
        {tabs.map(({ id, label }) => <button key={id} className={active === id ? 'selected' : ''} role="tab" aria-selected={active === id} aria-controls={`terminal-tab-${id}`} onClick={() => onChange(id)} data-testid={`tab-terminal-${id}`}>{label}</button>)}
      </div>
      <span className="terminal-market-note">ACCOUNT DATA NOT CONNECTED</span>
    </div>
    <div id={`terminal-tab-${active}`} role="tabpanel" className="terminal-tab-panel">
      {active === 'positions' && <NoRecords title="No connected position source" detail="This app has no persisted trading positions or server-side testnet execution service. No open positions are assumed." />}
      {active === 'history' && <NoRecords title="Trade history unavailable" detail="No persisted trade history exists. Export is unavailable until a real history source is configured." />}
      {active === 'performance' && <NoRecords title="Performance data unavailable" detail="Win rate, P&L, drawdown and equity history require real persisted trading records; none are available." />}
    </div>
  </section>;
}

function ConnectionFooter({ streamStatus, updatedAt, reconnect }: { streamStatus: string; updatedAt: number | null; reconnect: () => void }) {
  const streamLabel = streamStatus === 'live' ? 'LIVE' : streamStatus === 'connecting' ? 'CONNECTING' : streamStatus === 'reconnecting' ? 'RECONNECTING' : 'OFFLINE';
  const live = streamStatus === 'live';
  return <footer className="terminal-statusbar">
    <div className="terminal-status-cluster"><span className={`terminal-status-item ${live ? 'good' : 'muted'}`}><i /> BINANCE WS <b>{streamLabel}</b></span><span className="terminal-status-item muted"><i /> BSC <b>UNCONFIGURED · CHAIN {TESTNET_CHAIN_ID}</b></span></div>
    <div className="terminal-status-cluster"><span className="terminal-status-item muted">{updatedAt ? `LAST MARKET EVENT ${new Date(updatedAt).toLocaleTimeString()}` : 'AWAITING MARKET EVENT'}</span><button onClick={reconnect} className="terminal-reconnect" aria-label="Reconnect public Binance market stream"><RefreshCw /> RECONNECT</button></div>
  </footer>;
}

type TerminalWallet = {
  address: string | null;
  chainId: number | null;
  connected: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
};

export function TerminalPage({ wallet }: { wallet: TerminalWallet }) {
  const [symbol, setSymbol] = useState<TerminalSymbol>(DEFAULT_TERMINAL_SYMBOL);
  const [timeframe, setTimeframe] = useState<TerminalTimeframe>('1h');
  const [activeTab, setActiveTab] = useState<BottomTab>('positions');
  const [signalRequest, setSignalRequest] = useState<SignalRequest | null>(null);
  const signalRequestId = useRef(0);
  const allMarkets = useBinanceMarkets();
  const market = useBinanceMarket(symbol, timeframe);
  const marketStatus = market.streamStatus === 'live' ? 'LIVE MARKET' : market.streamStatus.toUpperCase();
  const changeUp = market.priceChange !== null && market.priceChange >= 0;
  const useSignalSide = (side: SignalSide) => {
    signalRequestId.current += 1;
    setSignalRequest({ side, requestId: signalRequestId.current });
  };
  return <div className="terminal-page">
    <header className="terminal-head">
      <div className="terminal-brand"><span className="terminal-mark">N</span><div><strong>NEXUS TERMINAL</strong><small>PUBLIC DATA / TESTNET ORDERS</small></div></div>
      <div className="terminal-symbol-wrap"><label htmlFor="market-symbol">MARKET</label><select id="market-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} data-testid="select-market-symbol">{[...new Set([symbol, ...allMarkets.markets.map((item) => item.symbol)])].map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      <div className="terminal-head-metrics"><div><span>SHARED TESTNET BALANCE</span><b>NOT SHOWN</b></div><div><span>NEXUS BALANCE</span><b>NOT DEPLOYED</b></div><div><span>SUBSCRIPTION</span><b className="terminal-tag dim-tag">UNAVAILABLE</b></div></div>
      <Link href="/" className="terminal-dashboard-link" data-testid="link-terminal-dashboard">DASHBOARD <ArrowUpRight /></Link>
      <span className={`terminal-quote-status ${market.streamStatus}`}><i />{marketStatus}</span>
    </header>
    <div className="terminal-instrument-row">
      <div className="terminal-instrument"><span className="terminal-coin-mark">{symbol.split('/')[0].slice(0, 1)}</span><div><strong>{symbol}</strong><small>BINANCE SPOT MARKET</small></div></div>
      <div className="terminal-quote"><span>LAST</span><b>{market.lastPrice === null ? '—' : `$${formatPrice(market.lastPrice, symbol)}`}</b></div>
      <div className={`terminal-change ${changeUp ? 'positive' : 'negative'}`}><span>24H CHANGE</span><b>{market.priceChange === null ? '—' : `${changeUp ? '+' : ''}${market.priceChange.toFixed(2)}%`}</b></div>
      <div className="terminal-instrument-right"><span className="terminal-live-indicator"><i /> {market.streamStatus === 'live' ? 'STREAMING' : market.streamStatus.toUpperCase()}</span><span>PUBLIC MARKET DATA · TESTNET ORDERS ONLY</span></div>
    </div>
    <div className="terminal-timeframe-row">
      <div className="terminal-timeframes" role="group" aria-label="Chart timeframe">{TERMINAL_TIMEFRAMES.map((item) => <button key={item} className={timeframe === item ? 'active' : ''} onClick={() => setTimeframe(item)} aria-pressed={timeframe === item} data-testid={`button-timeframe-${item}`}>{item.toUpperCase()}</button>)}</div>
      <div className="terminal-chart-loading-state">{market.candleLoading ? 'FETCHING PUBLIC KLINES' : market.candleError ? 'KLINE REQUEST FAILED' : `${market.candles.length} PUBLIC CANDLES`}</div>
    </div>
    <MarketOverview markets={allMarkets.markets} loading={allMarkets.loading} error={allMarkets.error} updatedAt={allMarkets.updatedAt} selectedSymbol={symbol} onSelect={setSymbol} onRefresh={() => void allMarkets.refresh()} />
    <div className="terminal-workspace">
      <OrderBook symbol={symbol} price={market.lastPrice} bids={market.bids} asks={market.asks} streamStatus={market.streamStatus} />
      <div className="terminal-center-column">
        <ChartPanel candles={market.candles} symbol={symbol} timeframe={timeframe} loading={market.candleLoading} error={market.candleError} onRetry={market.retryCandles} />
        <SignalFeed candles={market.candles} symbol={symbol} timeframe={timeframe} loading={market.candleLoading} error={market.candleError} onUseSide={useSignalSide} />
      </div>
      <TradePanel symbol={symbol} wallet={wallet} signalRequest={signalRequest} />
    </div>
    <BottomDock active={activeTab} onChange={setActiveTab} />
    <ConnectionFooter streamStatus={market.streamStatus} updatedAt={market.updatedAt} reconnect={market.reconnect} />
    <div className="terminal-disclosure"><Wifi /><span>Binance market feed is public exchange data. NEXUS on-chain signals, wallet balances and subscription state remain unavailable until verified testnet contracts are deployed.</span><Link href="/signals">SIGNALS REGISTRY <ArrowDownRight /></Link><Link href="/presale">PROTOCOL STATUS <ExternalLink /></Link><span className="terminal-bsc-boundary"><WifiOff /> BSC TESTNET ONLY · NO MAINNET ACTIONS</span></div>
  </div>;
}
