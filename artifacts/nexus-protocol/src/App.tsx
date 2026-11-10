import { lazy, Suspense, type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Activity, ArrowUpRight, Boxes, Check, ChevronRight, CircleAlert, Command, Fingerprint, LockKeyhole, Menu, Network, Radio, ShieldCheck, Wallet, X } from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { TESTNET_CHAIN_ID, type ContractName } from '@/lib/contracts';
import { PresalePage } from '@/components/presale/presale-page';
import { MainnetNexusStatus } from '@/components/overview/mainnet-nexus-status';
import { SubscriptionsPage } from '@/components/subscriptions/subscriptions-page';
import { useTestnetDeployment } from '@/lib/testnet-deployment';

const queryClient = new QueryClient();
const TerminalPage = lazy(async () => {
  const module = await import('@/components/terminal/terminal-page');
  return { default: module.TerminalPage };
});

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
};
declare global { interface Window { ethereum?: EthereumProvider } }

type WalletState = { address: string | null; chainId: number | null; connecting: boolean; error: string | null };
function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({ address: null, chainId: null, connecting: false, error: null });
  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    const read = async () => {
      try {
        const [accounts, chain] = await Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]) as [string[], string];
        setWallet((previous) => ({ ...previous, address: accounts[0] ?? null, chainId: Number.parseInt(chain, 16) }));
      } catch {
        setWallet((previous) => ({ ...previous, error: 'Wallet state could not be read.' }));
      }
    };
    const accountsChanged = (...args: unknown[]) => setWallet((previous) => ({ ...previous, address: (args[0] as string[])[0] ?? null }));
    const chainChanged = (...args: unknown[]) => setWallet((previous) => ({ ...previous, chainId: Number.parseInt(args[0] as string, 16) }));
    void read();
    provider.on?.('accountsChanged', accountsChanged);
    provider.on?.('chainChanged', chainChanged);
    return () => {
      provider.removeListener?.('accountsChanged', accountsChanged);
      provider.removeListener?.('chainChanged', chainChanged);
    };
  }, []);
  const connect = async () => {
    if (!window.ethereum) {
      setWallet((previous) => ({ ...previous, error: 'No injected wallet detected. Install or unlock a compatible wallet to connect.' }));
      return;
    }
    setWallet((previous) => ({ ...previous, connecting: true, error: null }));
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const chain = await window.ethereum.request({ method: 'eth_chainId' }) as string;
      setWallet((previous) => ({ ...previous, address: accounts[0] ?? null, chainId: Number.parseInt(chain, 16), connecting: false }));
    } catch {
      setWallet((previous) => ({ ...previous, connecting: false, error: 'Connection was cancelled or could not be completed.' }));
    }
  };
  return { ...wallet, connected: Boolean(wallet.address), connect };
}

const routeInfo = [
  { href: '/', label: 'Overview' },
  { href: '/presale', label: 'Presale' },
  { href: '/subscriptions', label: 'Subscriptions' },
  { href: '/signals', label: 'Signals' },
  { href: '/terminal', label: 'Terminal' },
];

function WalletButton({ wallet, className = '', testId = 'button-connect-wallet' }: { wallet: ReturnType<typeof useWallet>; className?: string; testId?: string }) {
  const address = wallet.address ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}` : '';
  return <div>
    <button className={`wallet-button ${className}`.trim()} onClick={() => void wallet.connect()} disabled={wallet.connecting} data-testid={testId}>
      {wallet.connected ? <span className={`status-led ${wallet.chainId === TESTNET_CHAIN_ID ? '' : 'off'}`} /> : <Wallet aria-hidden="true" />}
      {wallet.connecting ? 'CONNECTING…' : wallet.connected ? address : 'CONNECT WALLET'}
    </button>
    {wallet.error && <div className="wallet-message" role="status" data-testid="status-wallet-error">{wallet.error}</div>}
  </div>;
}

function Shell({ children, wallet }: { children: ReactNode; wallet: ReturnType<typeof useWallet> }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="cockpit"><div className="shell">
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Nexus Protocol overview" data-testid="link-brand"><span className="brand-mark" aria-hidden="true" /> NEXUS <small>PROTOCOL</small></Link>
      <nav className="nav" aria-label="Main navigation">{routeInfo.map(({ href, label }) => <Link key={href} href={href} className={location === href ? 'active' : ''} data-testid={`link-nav-${label.toLowerCase()}`}>{label}</Link>)}</nav>
      <button className="mobile-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} data-testid="button-mobile-menu">{menuOpen ? <X /> : <Menu />}</button>
      <WalletButton wallet={wallet} />
    </header>
    {menuOpen && <nav className="mobile-nav" aria-label="Mobile navigation">{routeInfo.map(({ href, label }) => <Link key={href} href={href} className={location === href ? 'active' : ''} onClick={() => setMenuOpen(false)}>{label}</Link>)}</nav>}
    <div className="network-strip"><span>Protocol interface <span style={{ color: '#a0aaa5' }}>//</span> v1.0.0</span><span className="net-ok"><span className={`status-led ${wallet.chainId === null || wallet.chainId === TESTNET_CHAIN_ID ? '' : 'off'}`} />{wallet.chainId === null ? 'TESTNET · CHAIN 97' : wallet.chainId === TESTNET_CHAIN_ID ? 'CONNECTED · BSC TESTNET' : `WRONG NETWORK · CHAIN ${wallet.chainId}`}</span></div>
    <main>{children}</main>
    <footer className="footer"><span>NEXUS PROTOCOL <span style={{ color: '#00e5ff' }}>/</span> TESTNET ONLY · CHAIN ID 97</span><span>NON-CUSTODIAL INTERFACE <span style={{ padding: '0 8px' }}>·</span> CONTRACT DATA SUBJECT TO DEPLOYMENT</span></footer>
  </div></div>;
}

function ContractStatus({ name, compact = false }: { name: ContractName; compact?: boolean }) {
  const { deployment, loading, error } = useTestnetDeployment();
  const addresses: Record<ContractName, string | undefined> = {
    token: deployment?.nexusToken,
    presale: deployment?.presale,
    subscriptions: deployment?.subscriptionManager,
    signals: deployment?.signalRegistry,
  };
  const address = addresses[name];
  if (compact) {
    return <span className="tag">{loading ? 'CHECKING DEPLOYMENT' : address ? 'TESTNET RECORD FOUND' : 'NOT DEPLOYED'}</span>;
  }
  return address
    ? <div className="callout" role="status" data-testid={`status-contract-${name}`}><Check aria-hidden="true" /><span><strong>Public Testnet deployment record found.</strong> Contract code and chain relationships are checked before the purchase flow is enabled. <code>{address}</code></span></div>
    : <div className="callout warn" role="status" data-testid={`status-contract-${name}`}><CircleAlert aria-hidden="true" /><span><strong>Contract unavailable.</strong> {error || (loading ? 'Checking for a public BSC Testnet deployment record.' : `No ${name} contract address is available for BNB Smart Chain Testnet.`)} On-chain actions remain disabled.</span></div>;
}

function PageHead({ eyebrow, title, description, badge }: { eyebrow: string; title: string; description: string; badge?: string }) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="page-desc">{description}</p></div>{badge && <span className="tag gold">{badge}</span>}</div>;
}
function Panel({ title, tag, children, edge }: { title: string; tag?: string; children: ReactNode; edge?: string }) {
  return <section className="panel" style={{ '--edge': edge } as CSSProperties}><div className="panel-head"><div className="panel-title">{title}</div>{tag && <span className="tag">{tag}</span>}</div>{children}</section>;
}

function Overview({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const { deployment, loading: deploymentLoading } = useTestnetDeployment();
  return <>
    <PageHead eyebrow="Protocol command center / 01" title="NEXUS PROTOCOL" description="A non-custodial interface for the NEXUS token ecosystem. Inspect Testnet records and wallet state without handing over custody." badge="BSC TESTNET · CHAIN 97" />
    <div className="hero-layout">
      <section className="panel hero-panel" style={{ '--edge': '#00e5ff' } as CSSProperties}><img className="overview-campaign-art" src={`${import.meta.env.BASE_URL}assets/nexus-campaign.webp`} alt="NEXUS campaign artwork showing the protocol logo over a neon city. Illustrative concept art, not market data or performance." /><div className="hero-copy"><div className="eyebrow">NEXUS PROTOCOL / NON-CUSTODIAL</div><h2>THE FUTURE OF<br /><em>TRADING IS HERE.</em></h2><p>One interface for protocol access, public market context, and wallet-authorized Testnet actions. Your keys stay with you.</p><div className="hero-actions"><WalletButton wallet={wallet} className="hero-connect" testId="button-hero-connect-wallet" /><Link href="/presale" className="btn-outline magenta-action" data-testid="link-view-presale">VIEW PRESALE <ArrowUpRight aria-hidden="true" /></Link></div></div><span className="campaign-art-label">ILLUSTRATIVE CAMPAIGN ART · NOT MARKET DATA OR PERFORMANCE</span></section>
      <section className="panel connect-card" style={{ '--edge': '#ffd700' } as CSSProperties}><div><div className="panel-head"><div className="panel-title">Wallet session</div><span className={`tag ${wallet.connected ? 'green' : ''}`}>{wallet.connected ? 'CONNECTED' : 'DISCONNECTED'}</span></div><h3>{wallet.connected ? 'Wallet detected' : 'Connect to inspect'}</h3><p>{wallet.connected ? wallet.chainId === TESTNET_CHAIN_ID ? 'Wallet connected to the configured test network.' : 'Wallet is connected on an unsupported network. No mainnet actions are available.' : 'Connect an injected wallet to read your own on-chain position once deployments are configured.'}</p></div>{!wallet.connected ? <WalletButton wallet={wallet} /> : <div className="subtle-line"><span>ACTIVE NETWORK</span><span>{wallet.chainId === TESTNET_CHAIN_ID ? 'BSC TESTNET' : `CHAIN ${wallet.chainId} · UNSUPPORTED`}</span></div>}</section>
    </div>
    <section className="home-live" aria-labelledby="home-live-title">
      <div className="home-section-head"><div><span className="home-kicker">LIVE DATA / READINESS</span><h2 id="home-live-title">What the interface can verify.</h2></div><span className="tag">NO SEEDED METRICS</span></div>
      <div className="home-live-grid">
        <article className="home-live-item"><span className="home-index">01 / MARKET</span><strong>Public spot feed</strong><b className="home-state">LIVE IN TERMINAL</b><p>Binance market prices and candles are available on the Terminal page. No market quote is asserted here.</p><Link href="/terminal">OPEN MARKET TERMINAL <ArrowUpRight /></Link></article>
        <MainnetNexusStatus walletAddress={wallet.address} />
        <article className="home-live-item"><span className="home-index">03 / REGISTRY</span><strong>Signals and presale</strong><b className="home-state pending">{deploymentLoading ? 'CHECKING RECORD' : deployment ? 'CONTRACT READ REQUIRED' : 'UNAVAILABLE'}</b><p>Registry entries and sale state are not displayed as facts until fetched from verified BSC Testnet contracts.</p></article>
      </div>
    </section>
    <section className="home-features" aria-labelledby="home-features-title">
      <div className="home-section-head"><div><span className="home-kicker">SYSTEM DESIGN / 04 MODULES</span><h2 id="home-features-title">A connected protocol surface.</h2></div><p>Tools remain distinct. Public market context is not an on-chain signal, and no order executes without confirmation.</p></div>
      <div className="home-feature-grid">
        <article><Activity /><span>01 / TERMINAL</span><h3>Public market context</h3><p>Explore Binance Spot prices, candles and depth. Testnet order controls remain separately guarded and explicitly confirmed.</p><Link href="/terminal">Explore terminal <ArrowUpRight /></Link></article>
        <article><Boxes /><span>02 / PRESALE</span><h3>Wallet-signed purchase</h3><p>Review available contract state and authorize each Testnet step in your own wallet. No private keys are collected.</p><Link href="/presale">Review presale <ArrowUpRight /></Link></article>
        <article><LockKeyhole /><span>03 / MEMBERSHIP</span><h3>On-chain access</h3><p>Membership terms and entitlement status are read from the Testnet contract when a verified deployment is available.</p><Link href="/subscriptions">View subscriptions <ArrowUpRight /></Link></article>
        <article><Network /><span>04 / SIGNALS</span><h3>Registry, not prediction</h3><p>Signals are read-only contract records. No seeded trade history, simulated performance, or automatic execution.</p><Link href="/signals">Inspect registry <ArrowUpRight /></Link></article>
      </div>
    </section>
    <section className="home-tokenomics" aria-labelledby="home-tokenomics-title">
      <div className="home-tokenomics-copy"><span className="home-kicker">TOKEN DATA / SOURCE OF TRUTH</span><h2 id="home-tokenomics-title">No numbers without a source.</h2><p>Tokenomics figures are shown only after they can be read from an identified, verified on-chain deployment. No allocation chart or supply total is inferred.</p><Link href="/signals" className="btn-outline">CONTRACT REGISTRY <ChevronRight /></Link></div>
      <div className="home-tokenomics-data">
        <div><span>TOTAL SUPPLY</span><strong>NOT VERIFIED</strong><small>ON-CHAIN READ REQUIRED</small></div>
        <div><span>ALLOCATION</span><strong>NOT VERIFIED</strong><small>NO VERIFIED BREAKDOWN</small></div>
        <div><span>VESTING / LOCKS</span><strong>NOT AVAILABLE</strong><small>CONTRACT DATA REQUIRED</small></div>
      </div>
    </section>
    <section className="home-roadmap" aria-labelledby="home-roadmap-title">
      <div className="home-section-head"><div><span className="home-kicker">PROTOCOL PATH / STATUS ONLY</span><h2 id="home-roadmap-title">A staged path to readiness.</h2></div><span className="tag gold">NO MAINNET ACTIONS</span></div>
      <div className="roadmap-grid">
        <article className="roadmap-step"><span>01</span><b>Testnet interface</b><small className="roadmap-status">AVAILABLE</small><p>Wallet connection, public market view, and Testnet-only protocol surfaces.</p></article>
        <article className="roadmap-step"><span>02</span><b>Verified deployments</b><small className="roadmap-status pending">PENDING</small><p>Contract records and on-chain state must be configured and checked before actions unlock.</p></article>
        <article className="roadmap-step"><span>03</span><b>Independent review</b><small className="roadmap-status pending">REQUIRED BEFORE REAL FUNDS</small><p>Security, operational and legal reviews remain necessary for any real-money release.</p></article>
        <article className="roadmap-step"><span>04</span><b>Mainnet readiness</b><small className="roadmap-status pending">NOT AVAILABLE</small><p>This interface has no Mainnet path. No launch date or readiness claim is made.</p></article>
      </div>
    </section>
    <div className="section-title"><h2>Protocol instruments</h2><span>DATA SOURCE // VERIFIED CONTRACTS ONLY</span></div>
    <div className="grid overview-grid">
      <Panel title="NEXUS token" tag="TOKEN / ERC-20"><div className="token-row"><div className="token-emblem">N</div><div><div className="token-name">NEXUS</div><div className="token-symbol">NEXUS TOKEN · BSC TESTNET</div></div></div><div className="subtle-line"><span>WALLET BALANCE</span><span>{wallet.connected ? 'UNAVAILABLE' : 'CONNECT WALLET'}</span></div><div className="subtle-line" style={{ marginTop: 0, borderTop: 0, paddingTop: 9 }}><span>TOKEN METADATA</span><span>NOT INDEXED</span></div><div style={{ marginTop: 15 }}><ContractStatus name="token" compact /></div></Panel>
      <Panel title="Presale" tag="SALE STATUS" edge="#ffd700"><div className="big-value" style={{ color: '#ffd700' }}>—</div><div className="value-note">PRESALE STATE UNAVAILABLE</div><div className="subtle-line"><span>CONTRIBUTION</span><span>—</span></div><div className="subtle-line" style={{ marginTop: 0, borderTop: 0, paddingTop: 9 }}><span>ALLOCATION</span><span>—</span></div><Link href="/presale" className="btn-outline" style={{ marginTop: 12 }}>VIEW PRESALE <ChevronRight aria-hidden="true" /></Link></Panel>
      <Panel title="Signals" tag="ON-CHAIN FEED" edge="#ff3de8"><div className="big-value" style={{ color: '#ff4de6' }}>—</div><div className="value-note">PUBLISHED SIGNALS INDEXED</div><div className="subtle-line"><span>FEED STATUS</span><span>UNAVAILABLE</span></div><Link href="/signals" className="btn-outline" style={{ marginTop: 12, color: '#ff4de6', borderColor: 'rgba(255,61,232,.36)' }}>OPEN SIGNALS <ChevronRight aria-hidden="true" /></Link></Panel>
    </div>
    <div className="section-title"><h2>Access layer</h2><span>SUBSCRIPTION / ENTITLEMENTS</span></div>
    <div className="grid two-col"><Panel title="Membership state" tag="WALLET-SCOPED"><div className="stat-row"><span>ACTIVE PLAN</span><span>{wallet.connected ? 'UNAVAILABLE' : 'NO WALLET CONNECTED'}</span></div><div className="stat-row"><span>EXPIRES AT</span><span>—</span></div><div className="stat-row"><span>AUTO-RENEW</span><span>—</span></div></Panel><Panel title="Network guard" tag="CHAIN ID 97" edge="#ffd700"><div className="feature-line"><div className="metric-icon"><ShieldCheck /></div><div><strong>Testnet only</strong>Interface actions remain unavailable until verified deployment addresses are set.</div></div><div className="feature-line"><div className="metric-icon"><Fingerprint /></div><div><strong>Non-custodial</strong>Your wallet retains control. This interface never requests a seed phrase.</div></div></Panel></div>
  </>;
}

function Signals() {
  return <>
    <PageHead eyebrow="Signal intelligence / 04" title="On-chain signals" description="Published signals are immutable records read from the Nexus signal registry. This feed contains no seeded, illustrative or simulated trade data." badge="LIVE CONTRACT REQUIRED" />
    <div className="grid two-col"><Panel title="Signal registry" tag="ON-CHAIN FEED" edge="#ff3de8"><div className="empty-state"><div className="empty-icon"><Radio /></div><strong>Signal feed unavailable</strong><p>No verified registry contract is configured. Signal count, hashes and published entries cannot be fetched.</p></div><ContractStatus name="signals" /></Panel><Panel title="Integrity model" tag="HASH-VERIFIED"><div className="feature-line"><div className="metric-icon"><Fingerprint /></div><div><strong>Signal hash</strong>Each published record can be matched against its on-chain commitment.</div></div><div className="feature-line"><div className="metric-icon"><Check /></div><div><strong>Execution status</strong>Execution state is read from contract data, never inferred from price movement.</div></div><div className="feature-line"><div className="metric-icon"><Command /></div><div><strong>No trade execution</strong>This interface is for viewing only. It does not route orders or custody assets.</div></div></Panel></div>
    <div className="section-title"><h2>Published records</h2><span>NO INDEXED DATA AVAILABLE</span></div>
    <Panel title="Signal ledger" tag="EMPTY · SOURCE NOT CONFIGURED"><div className="table-wrap"><table className="data-table"><thead><tr><th>Signal ID</th><th>Asset</th><th>Action</th><th>Entry</th><th>Timestamp</th><th>Publisher</th><th>Executed</th><th>P&amp;L</th></tr></thead><tbody><tr><td colSpan={8} style={{ textAlign: 'center', padding: '34px 10px', color: '#697671' }}>No records — signal registry not configured</td></tr></tbody></table></div><div className="callout purple-note" style={{ marginTop: 14 }}><CircleAlert /><span>Empty state reflects an unavailable contract source, not a verified zero-signal history.</span></div></Panel>
  </>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Router() {
  const wallet = useWallet();
  return <Shell wallet={wallet}><RoutedErrorBoundary><Switch>
    <Route path="/" component={() => <Overview wallet={wallet} />} />
    <Route path="/presale" component={() => <PresalePage wallet={wallet} />} />
    <Route path="/subscriptions" component={() => <SubscriptionsPage wallet={wallet} />} />
    <Route path="/signals" component={Signals} />
    <Route path="/terminal" component={() => <Suspense fallback={<div className="empty-state" role="status">Loading public market terminal…</div>}><TerminalPage wallet={wallet} /></Suspense>} />
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary></Shell>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;
