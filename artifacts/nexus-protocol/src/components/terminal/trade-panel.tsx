import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, CircleAlert, Clock3, LockKeyhole, LoaderCircle, RefreshCw } from 'lucide-react';
import type { TerminalSymbol } from '@/hooks/use-binance-market';

type WalletSession = {
  address: string | null;
  chainId: number | null;
  connected: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
};

type ApiHealth = { status: string; chainId: number; testnetTradingReady: boolean; autoTradingReady: boolean };
type TradeQuote = {
  quoteId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  amount: string;
  amountUnit: string;
  baseAsset: string;
  quoteAsset: string;
  referencePrice: string;
  estimatedBaseQty: string;
  estimatedQuoteQty: string;
  expiresAt: number;
};
type TradeResult = {
  quoteId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  exchangeOrderId: string;
  status: string;
  executedBaseQty: string;
  executedQuoteQty: string;
  testnet: true;
};
type TradeOrder = {
  quote_id: string;
  symbol: string;
  side: string;
  amount: string;
  status: string;
  exchange_order_id: string | null;
  created_at: number;
};
type SignalRequest = { side: 'BUY' | 'SELL'; requestId: number } | null;
type ApiEnvelope = { error?: string };

const API_ROOT = '/nexus-api/api';
const BSC_TESTNET_CHAIN_ID = 97;

async function apiRequest<T>(
  path: string,
  options: { token?: string; body?: Record<string, unknown> } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_ROOT}${path}`, {
    method: options.body ? 'POST' : 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'include',
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({})) as T & ApiEnvelope;
  if (!response.ok) {
    throw new Error(result.error || `NEXUS API returned HTTP ${response.status}.`);
  }
  return result;
}

function formatAmount(value: string, maximumFractionDigits = 8) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(numeric);
}

export function TradePanel({
  symbol,
  wallet,
  signalRequest,
  onSessionTokenChange,
  onOrdersChanged,
}: {
  symbol: TerminalSymbol;
  wallet: WalletSession;
  signalRequest: SignalRequest;
  onSessionTokenChange: (token: string | null) => void;
  onOrdersChanged: () => void;
}) {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [orders, setOrders] = useState<TradeOrder[]>([]);

  useEffect(() => {
    let active = true;
    const loadHealth = async () => {
      try {
        const next = await apiRequest<ApiHealth>('/health');
        if (active) {
          setHealth(next);
          setHealthError(null);
        }
      } catch (error) {
        if (active) setHealthError(error instanceof Error ? error.message : 'Trading service unavailable.');
      }
    };
    void loadHealth();
    const timer = window.setInterval(() => void loadHealth(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setToken(null);
    onSessionTokenChange(null);
    setQuote(null);
    setOrders([]);
    setMessage(null);
  }, [wallet.address, wallet.chainId]);

  useEffect(() => {
    setQuote(null);
  }, [symbol]);

  useEffect(() => {
    if (!signalRequest) return;
    setSide(signalRequest.side);
    setAmount('');
    setQuote(null);
  }, [signalRequest]);

  useEffect(() => {
    if (!quote) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [quote]);

  async function loadOrders(sessionToken: string) {
    try {
      const result = await apiRequest<{ available: boolean; items: TradeOrder[] }>(
        '/trade/orders',
        { token: sessionToken },
      );
      setOrders(result.items);
    } catch {
      setOrders([]);
    }
  }

  async function signIn() {
    if (!wallet.address || wallet.chainId !== BSC_TESTNET_CHAIN_ID) return;
    const provider = (window as Window & {
      ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
    }).ethereum;
    if (!provider) {
      setMessage({ kind: 'error', text: 'No compatible wallet is available to sign in.' });
      return;
    }
    setAuthBusy(true);
    setMessage(null);
    try {
      const challenge = await apiRequest<{ wallet: string; message: string }>('/auth/nonce', {
        body: { wallet: wallet.address },
      });
      if (challenge.wallet.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error('Wallet challenge did not match the connected address.');
      }
      const signature = await provider.request({
        method: 'personal_sign',
        params: [challenge.message, wallet.address],
      });
      if (typeof signature !== 'string') throw new Error('Wallet did not return a signature.');
      const session = await apiRequest<{ authenticated: boolean }>('/auth/verify', {
        body: { wallet: wallet.address, signature },
      });
      if (!session.authenticated) throw new Error('Wallet session could not be established.');
      const cookieSession = 'http-only-cookie-session';
      setToken(cookieSession);
      onSessionTokenChange(cookieSession);
      await loadOrders(cookieSession);
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Wallet sign-in was not completed.',
      });
    } finally {
      setAuthBusy(false);
    }
  }

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !health?.testnetTradingReady || !wallet.address || wallet.chainId !== BSC_TESTNET_CHAIN_ID) return;
    setWorking(true);
    setQuote(null);
    setMessage(null);
    try {
      const result = await apiRequest<TradeQuote>('/trade/quote', {
        token,
        body: { symbol: symbol.replace('/', ''), side, amount },
      });
      setQuote(result);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not preview this order.' });
    } finally {
      setWorking(false);
    }
  }

  async function confirmOrder() {
    if (!quote || !token || Date.now() >= quote.expiresAt * 1000) {
      setQuote(null);
      setMessage({ kind: 'error', text: 'The preview expired. Request a fresh quote before confirming.' });
      return;
    }
    setWorking(true);
    setMessage(null);
    const approvedQuote = quote;
    setQuote(null);
    try {
      const result = await apiRequest<TradeResult>('/trade/execute', {
        token,
        body: { quoteId: approvedQuote.quoteId, confirmed: true },
      });
      setMessage({
        kind: 'success',
        text: `${result.status} · ${result.symbol} ${result.side} · ${formatAmount(result.executedBaseQty)} ${approvedQuote.baseAsset} for ${formatAmount(result.executedQuoteQty)} USDT · Testnet order ${result.exchangeOrderId}`,
      });
      await loadOrders(token);
      onOrdersChanged();
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error
          ? error.message
          : 'Order result is uncertain. Check the shared Testnet account before placing another order.',
      });
      await loadOrders(token);
      onOrdersChanged();
    } finally {
      setWorking(false);
    }
  }

  const previewExpired = Boolean(quote && now >= quote.expiresAt * 1000);
  const secondsLeft = quote ? Math.max(0, Math.ceil(quote.expiresAt - now / 1000)) : 0;
  const serviceReady = health?.testnetTradingReady === true;
  const quoteEnabled = Boolean(
    token && serviceReady && wallet.address && wallet.chainId === BSC_TESTNET_CHAIN_ID && amount,
  );
  const baseAsset = symbol.split('/')[0];

  return <aside className="terminal-panel trade-disabled-panel">
    <div className="terminal-panel-head">
      <div><div className="terminal-panel-label">ORDER ENTRY</div><div className="terminal-symbol-caption">BINANCE SPOT TESTNET · MARKET</div></div>
      <span className={`terminal-tag ${serviceReady ? 'live-tag' : 'dim-tag'}`}>{serviceReady ? 'TESTNET READY' : 'SETUP REQUIRED'}</span>
    </div>

    <div className="terminal-disabled-message">
      {serviceReady ? <CheckCircle2 /> : <LockKeyhole />}
      <strong>Shared Testnet demo account</strong>
      <p>All users share the same simulated exchange balance. Each order needs a fresh quote and your separate confirmation. No real funds, withdrawals, leverage or automatic trading.</p>
    </div>

    {healthError && <div className="terminal-trade-feedback error" role="status"><CircleAlert />{healthError}</div>}
    {!serviceReady && !healthError && <div className="terminal-trade-feedback" role="status">
      <CircleAlert />Server-side Binance Spot Testnet credentials and the explicit Testnet switch are not configured yet.
    </div>}

    {!wallet.connected ? <button className="terminal-execute" type="button" onClick={() => void wallet.connect()} disabled={wallet.connecting}>
      {wallet.connecting ? 'CONNECTING WALLET…' : 'CONNECT WALLET TO CONTINUE'}
    </button> : wallet.chainId !== BSC_TESTNET_CHAIN_ID ? <div className="terminal-trade-feedback error" role="status">
      <CircleAlert />Switch the connected wallet to BSC Testnet (chain 97) before signing.
    </div> : !token ? <button className="terminal-execute" type="button" onClick={() => void signIn()} disabled={authBusy}>
      {authBusy ? 'WAITING FOR WALLET SIGNATURE…' : 'SIGN IN WITH WALLET'}
    </button> : <form className="terminal-trade-form" onSubmit={(event) => void requestQuote(event)}>
      <div className="terminal-side-switch" role="group" aria-label="Order side">
        <button type="button" className={side === 'BUY' ? 'selected buy-selected' : ''} onClick={() => { setSide('BUY'); setQuote(null); }}>BUY {baseAsset}</button>
        <button type="button" className={side === 'SELL' ? 'selected sell-selected' : ''} onClick={() => { setSide('SELL'); setQuote(null); }}>SELL {baseAsset}</button>
      </div>
      <label htmlFor="terminal-amount">{side === 'BUY' ? 'SPEND AMOUNT · USDT' : `SELL QUANTITY · ${baseAsset}`}</label>
      <input
        id="terminal-amount"
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        max={side === 'BUY' ? '50' : undefined}
        value={amount}
        onChange={(event) => { setAmount(event.target.value); setQuote(null); }}
        placeholder={side === 'BUY' ? 'Up to 50 USDT' : `Amount of ${baseAsset}`}
        required
        disabled={!serviceReady || working}
      />
      <button className="terminal-execute" type="submit" disabled={!quoteEnabled || working}>
        {working ? 'PLEASE WAIT…' : 'PREVIEW TESTNET ORDER'}
      </button>
    </form>}

    {quote && <div className="terminal-quote-review" aria-live="polite">
      <div className="quote-review-head"><strong>REVIEW THIS ORDER</strong><span><Clock3 /> {secondsLeft}s</span></div>
      <div className="quote-review-row"><span>TESTNET PAIR</span><b>{quote.symbol}</b></div>
      <div className="quote-review-row"><span>SIDE</span><b className={quote.side === 'BUY' ? 'positive' : 'negative'}>{quote.side}</b></div>
      <div className="quote-review-row"><span>{quote.side === 'BUY' ? 'SPEND' : 'SELL'}</span><b>{formatAmount(quote.amount)} {quote.amountUnit}</b></div>
      <div className="quote-review-row"><span>REFERENCE PRICE</span><b>{formatAmount(quote.referencePrice, 6)} USDT</b></div>
      <div className="quote-review-row"><span>EST. RECEIVED / SOLD</span><b>{formatAmount(quote.estimatedBaseQty)} {quote.baseAsset}</b></div>
      <div className="quote-review-row"><span>EST. VALUE</span><b>{formatAmount(quote.estimatedQuoteQty)} USDT</b></div>
      <p>Market execution may differ from this reference price. Confirmation uses one single-use quote and cannot be undone.</p>
      <button className="terminal-confirm-order" type="button" onClick={() => void confirmOrder()} disabled={working || previewExpired}>
        {working ? <><LoaderCircle /> SUBMITTING…</> : 'CONFIRM & SUBMIT THIS ORDER'}
      </button>
    </div>}

    {previewExpired && <div className="terminal-trade-feedback error" role="status"><Clock3 />Preview expired. Request a fresh one.</div>}
    {message && <div className={`terminal-trade-feedback ${message.kind}`} role="status">
      {message.kind === 'success' ? <CheckCircle2 /> : <CircleAlert />}{message.text}
    </div>}

    <div className="terminal-autotrade">
      <div><strong>AUTO-TRADE</strong><span>OFF · EVERY ORDER REQUIRES APPROVAL</span></div>
      <label className="terminal-toggle"><input type="checkbox" disabled aria-label="Auto-trade disabled" /><span /></label>
    </div>
    <div className="terminal-control-note">
      Testnet-only USDT Spot pairs. Maximum 50 USDT per order, 20 per wallet daily and 100 total daily. Chart data is public Binance Spot; order previews use Testnet prices. NEXUS is not a Binance quote currency.
    </div>

    {token && <div className="terminal-order-history">
      <div className="terminal-panel-label">YOUR CONFIRMED TESTNET ORDERS <button type="button" onClick={() => void loadOrders(token)} aria-label="Refresh order history"><RefreshCw /></button></div>
      {orders.length === 0 ? <div className="terminal-order-empty">No confirmed orders from this wallet yet.</div> : orders.slice(0, 5).map((order) => <div className="terminal-order-row" key={order.quote_id}>
        <span className={order.side === 'BUY' ? 'positive' : 'negative'}>{order.side} {order.symbol}</span>
        <b>{order.status}</b>
      </div>)}
    </div>}
  </aside>;
}
