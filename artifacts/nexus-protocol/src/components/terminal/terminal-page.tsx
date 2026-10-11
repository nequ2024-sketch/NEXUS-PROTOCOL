import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Activity, ArrowDownRight, ArrowUpRight, CircleAlert, ExternalLink, LockKeyhole, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { ChartPanel } from '@/components/terminal/chart-panel';
import { TERMINAL_SYMBOLS, TERMINAL_TIMEFRAMES, useBinanceMarket, type BookLevel, type TerminalSymbol, type TerminalTimeframe } from '@/hooks/use-binance-market';
import { TESTNET_CHAIN_ID } from '@/lib/contracts';

type BottomTab = 'positions' | 'history' | 'performance';

const formatPrice = (price: number, symbol: TerminalSymbol) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: symbol.startsWith('BTC') || symbol.startsWith('ETH') ? 2 : 3,
  maximumFractionDigits: symbol.startsWith('BTC') || symbol.startsWith('ETH') ? 2 : 4,
}).format(price);

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

function SignalFeed() {
  return <section className="terminal-panel signal-panel">
    <div className="terminal-panel-head"><div><div className="terminal-panel-label">ON-CHAIN SIGNALS</div><div className="terminal-symbol-caption">PUBLISHED FEED</div></div><span className="terminal-tag purple-tag">BSC TESTNET</span></div>
    <div className="terminal-empty-inline"><div className="terminal-empty-mark"><Activity /></div><div><strong>Signal registry unavailable</strong><p>No verified signal contract address is configured. No signal history or market event is being fabricated.</p></div></div>
    <div className="signal-footnote"><CircleAlert /> A BscScan link will appear only for a real transaction hash, on BSC Testnet.</div>
  </section>;
}

function DisabledTradePanel() {
  return <aside className="terminal-panel trade-disabled-panel">
    <div className="terminal-panel-head"><div><div className="terminal-panel-label">ORDER ENTRY</div><div className="terminal-symbol-caption">EXECUTION DISABLED</div></div><span className="terminal-tag dim-tag">READ ONLY</span></div>
    <div className="terminal-side-switch"><button disabled>BUY</button><button disabled>SELL</button></div>
    <div className="terminal-disabled-message"><LockKeyhole /><strong>Trading is not configured</strong><p>Secure server-side testnet trading is not available. This terminal reads public Binance spot market data only; it does not send exchange orders.</p></div>
    <fieldset disabled className="terminal-trade-form">
      <label htmlFor="terminal-amount">AMOUNT · USDT</label><input id="terminal-amount" type="number" placeholder="Unavailable" />
      <div className="terminal-percent-row">{['25%', '50%', '75%', '100%'].map((pct) => <button type="button" key={pct} disabled>{pct}</button>)}</div>
      <label htmlFor="terminal-order-type">ORDER TYPE</label><select id="terminal-order-type" defaultValue="market"><option value="market">Market</option><option value="limit">Limit</option></select>
      <label htmlFor="terminal-limit-price">LIMIT PRICE</label><input id="terminal-limit-price" type="number" placeholder="—" />
      <button className="terminal-execute" disabled>EXECUTE ORDER</button>
    </fieldset>
    <div className="terminal-autotrade">
      <div><strong>AUTO-TRADE</strong><span>Execution service unavailable</span></div>
      <label className="terminal-toggle"><input type="checkbox" disabled aria-label="Auto-trade disabled" /><span /></label>
    </div>
    <div className="terminal-control-note">No API credentials, local tokens or exchange responses are used by this page.</div>
  </aside>;
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

export function TerminalPage() {
  const [symbol, setSymbol] = useState<TerminalSymbol>('BTC/USDT');
  const [timeframe, setTimeframe] = useState<TerminalTimeframe>('1h');
  const [activeTab, setActiveTab] = useState<BottomTab>('positions');
  const market = useBinanceMarket(symbol, timeframe);
  const marketStatus = market.streamStatus === 'live' ? 'LIVE MARKET' : market.streamStatus.toUpperCase();
  const changeUp = market.priceChange !== null && market.priceChange >= 0;
  return <div className="terminal-page">
    <header className="terminal-head">
      <div className="terminal-brand"><span className="terminal-mark">N</span><div><strong>NEXUS TERMINAL</strong><small>MARKET INTELLIGENCE / READ ONLY</small></div></div>
      <div className="terminal-symbol-wrap"><label htmlFor="market-symbol">MARKET</label><select id="market-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value as TerminalSymbol)} data-testid="select-market-symbol">{TERMINAL_SYMBOLS.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="terminal-head-metrics"><div><span>USDT BALANCE</span><b>UNAVAILABLE</b></div><div><span>NEXUS BALANCE</span><b>UNAVAILABLE</b></div><div><span>SUBSCRIPTION</span><b className="terminal-tag dim-tag">UNAVAILABLE</b></div></div>
      <Link href="/" className="terminal-dashboard-link" data-testid="link-terminal-dashboard">DASHBOARD <ArrowUpRight /></Link>
      <span className={`terminal-quote-status ${market.streamStatus}`}><i />{marketStatus}</span>
    </header>
    <div className="terminal-instrument-row">
      <div className="terminal-instrument"><span className="terminal-coin-mark">{symbol.split('/')[0].slice(0, 1)}</span><div><strong>{symbol}</strong><small>BINANCE SPOT MARKET</small></div></div>
      <div className="terminal-quote"><span>LAST</span><b>{market.lastPrice === null ? '—' : `$${formatPrice(market.lastPrice, symbol)}`}</b></div>
      <div className={`terminal-change ${changeUp ? 'positive' : 'negative'}`}><span>24H CHANGE</span><b>{market.priceChange === null ? '—' : `${changeUp ? '+' : ''}${market.priceChange.toFixed(2)}%`}</b></div>
      <div className="terminal-instrument-right"><span className="terminal-live-indicator"><i /> {market.streamStatus === 'live' ? 'STREAMING' : market.streamStatus.toUpperCase()}</span><span>PUBLIC MARKET DATA · NO ORDERS</span></div>
    </div>
    <div className="terminal-timeframe-row">
      <div className="terminal-timeframes" role="group" aria-label="Chart timeframe">{TERMINAL_TIMEFRAMES.map((item) => <button key={item} className={timeframe === item ? 'active' : ''} onClick={() => setTimeframe(item)} aria-pressed={timeframe === item} data-testid={`button-timeframe-${item}`}>{item.toUpperCase()}</button>)}</div>
      <div className="terminal-chart-loading-state">{market.candleLoading ? 'FETCHING PUBLIC KLINES' : market.candleError ? 'KLINE REQUEST FAILED' : `${market.candles.length} PUBLIC CANDLES`}</div>
    </div>
    <div className="terminal-workspace">
      <OrderBook symbol={symbol} price={market.lastPrice} bids={market.bids} asks={market.asks} streamStatus={market.streamStatus} />
      <div className="terminal-center-column">
        <ChartPanel candles={market.candles} symbol={symbol} timeframe={timeframe} loading={market.candleLoading} error={market.candleError} onRetry={market.retryCandles} />
        <SignalFeed />
      </div>
      <DisabledTradePanel />
    </div>
    <BottomDock active={activeTab} onChange={setActiveTab} />
    <ConnectionFooter streamStatus={market.streamStatus} updatedAt={market.updatedAt} reconnect={market.reconnect} />
    <div className="terminal-disclosure"><Wifi /><span>Binance market feed is public exchange data. NEXUS on-chain signals, wallet balances and subscription state remain unavailable until verified testnet contracts are deployed.</span><Link href="/signals">SIGNALS REGISTRY <ArrowDownRight /></Link><Link href="/presale">PROTOCOL STATUS <ExternalLink /></Link><span className="terminal-bsc-boundary"><WifiOff /> BSC TESTNET ONLY · NO MAINNET ACTIONS</span></div>
  </div>;
}
