import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  CircleSlash2,
  Clock3,
  Command,
  Eye,
  FileCheck2,
  Globe2,
  Layers3,
  LockKeyhole,
  Orbit,
  Radar,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const visual = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#070912] text-[#e8edf9] selection:bg-cyan-300/25">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-36 h-96 w-96 rounded-full bg-cyan-500/[0.045] blur-[120px]" />
        <div className="absolute -right-36 top-[28rem] h-[30rem] w-[30rem] rounded-full bg-fuchsia-600/[0.055] blur-[140px]" />
        <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'linear-gradient(rgba(112,133,181,.13) 1px,transparent 1px),linear-gradient(90deg,rgba(112,133,181,.13) 1px,transparent 1px)', backgroundSize: '52px 52px', maskImage: 'linear-gradient(to bottom,black,transparent 78%)' }} />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/[0.075] bg-[#080b15]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-7 xl:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-cyan-200/15 bg-[#101521]">
              <img src={visual('/visuals/nexus-logo.webp')} alt="NEXUS emblem" className="h-full w-full object-cover object-center" />
            </div>
            <div className="leading-none">
              <div className="font-mono text-[15px] font-bold tracking-[0.22em] text-white">NEXUS</div>
              <div className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.22em] text-slate-500">Protocol console</div>
            </div>
            <div className="ml-3 hidden h-7 w-px bg-white/10 sm:block" />
            <div data-testid="status-preview" className="hidden items-center gap-2 rounded-full border border-fuchsia-300/20 bg-fuchsia-400/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-200 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-300" />
              Visual preview
            </div>
          </div>

          <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
            <a data-testid="link-overview" href="#overview" className="rounded-lg px-3 py-2 text-xs font-medium text-cyan-100 transition hover:bg-white/[0.05]">Overview</a>
            <a data-testid="link-launchpad" href="#launchpad" className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white">Launchpad</a>
            <a data-testid="link-terminal" href="#terminal" className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white">Terminal</a>
            <a data-testid="link-readiness" href="#readiness" className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white">Readiness</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <div data-testid="status-network" className="hidden items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.025] px-3 py-2 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-300/30" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-300" />
              </span>
              <span className="text-[11px] font-medium text-slate-300">Solana Devnet preview</span>
              <ChevronDown aria-hidden="true" size={13} className="text-slate-500" />
            </div>
            <button data-testid="button-connect-wallet" type="button" disabled aria-label="Wallet connection unavailable" className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.09] px-3 py-2 text-[11px] font-semibold text-cyan-100/65 opacity-80 sm:px-4">
              <Wallet size={14} />
              <span className="hidden sm:inline">Wallet not connected</span>
              <span className="sm:hidden">No wallet</span>
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1600px] px-4 pb-12 pt-5 sm:px-7 xl:px-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.045] px-4 py-3" data-testid="status-preview-disclaimer">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-200/15 bg-amber-200/[0.08] text-amber-200"><Eye size={14} /></div>
            <p className="text-xs leading-relaxed text-amber-100/80"><span className="font-semibold text-amber-100">Preview only.</span> No live wallet, market data, token sale, or real-funds activity is available in this experience.</p>
          </div>
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-amber-100/45">Build  /  concept</span>
        </div>

        <section id="overview" aria-labelledby="welcome-heading" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="relative min-h-[300px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f1a] sm:min-h-[340px]">
            <img src={visual('/visuals/nexus-ai-market.webp')} alt="Illustrative NEXUS interface artwork with abstract network and market panels" className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.48]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#090c16] via-[#090c16]/90 to-[#090c16]/25" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#090c16]/85 via-transparent to-[#090c16]/10" />
            <div className="relative flex min-h-[300px] flex-col justify-between p-5 sm:min-h-[340px] sm:p-8">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/[0.08] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-100"><Orbit size={12} /> Solana ecosystem</span>
                <span className="rounded-md border border-white/10 bg-black/20 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-300">Test environment</span>
              </div>
              <div className="max-w-[590px] py-6">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/75"><span className="h-px w-7 bg-cyan-300/60" /> The NEXUS launchpad preview</div>
                <h1 id="welcome-heading" className="max-w-[540px] text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.055em] text-white sm:text-5xl">A new way to navigate <span className="bg-gradient-to-r from-cyan-200 via-cyan-100 to-fuchsia-200 bg-clip-text text-transparent">on-chain launches.</span></h1>
                <p className="mt-4 max-w-[430px] text-sm leading-6 text-slate-300/80">Explore the proposed NEXUS trading cockpit. This interface is a product concept—not a live launchpad or financial service.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button data-testid="button-explore-launchpad" type="button" onClick={() => document.getElementById('launchpad')?.scrollIntoView({ behavior: 'smooth' })} className="group inline-flex items-center gap-2 rounded-lg border border-cyan-200/25 bg-cyan-300/[0.12] px-4 py-2.5 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-300/[0.18]">
                  Explore preview <ArrowDownRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5" />
                </button>
                <span className="text-[10px] text-slate-400">Illustrative interface artwork · not live market data</span>
              </div>
            </div>
            <div className="absolute right-5 top-5 hidden items-center gap-2 rounded-lg border border-white/10 bg-[#080b15]/70 px-3 py-2 backdrop-blur-md sm:flex">
              <div className="h-1.5 w-1.5 rounded-full bg-fuchsia-300" />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-300">Concept 01</span>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/[0.09] bg-[#0c101b]/90 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Connection state</p>
                  <h2 className="mt-2 text-[15px] font-semibold text-slate-100">Wallet disconnected</h2>
                </div>
                <div className="rounded-lg border border-fuchsia-300/15 bg-fuchsia-300/[0.07] p-2 text-fuchsia-200"><LockKeyhole size={15} /></div>
              </div>
              <p data-testid="status-wallet" className="mt-3 flex items-center gap-2 text-[11px] text-slate-400"><CircleSlash2 size={13} className="text-slate-500" /> No wallet is connected to this preview.</p>
              <button type="button" disabled data-testid="button-wallet-unavailable" className="mt-5 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] py-2.5 text-xs font-medium text-slate-500">
                <Wallet size={14} /> Connect wallet <span className="text-[9px] uppercase tracking-wider text-slate-600">Unavailable</span>
              </button>
            </div>
            <div className="relative flex-1 overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#0c111e] p-5">
              <div aria-hidden="true" className="absolute -right-10 -top-12 h-40 w-40 rounded-full border border-cyan-300/[0.06]" />
              <div aria-hidden="true" className="absolute -right-4 -top-6 h-28 w-28 rounded-full border border-fuchsia-300/[0.07]" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-100"><Activity size={15} /><span className="text-xs font-semibold">Network status</span></div>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">Preview state</span>
              </div>
              <div data-testid="status-network-unavailable" className="relative mt-6 flex items-center justify-between border-b border-white/[0.07] pb-4">
                <div>
                  <div className="text-[10px] text-slate-500">Target network</div>
                  <div className="mt-1 text-xs font-medium text-slate-200">Solana Devnet preview</div>
                </div>
                <span className="rounded-md border border-amber-200/15 bg-amber-200/[0.06] px-2 py-1 text-[9px] uppercase tracking-wider text-amber-100/70">Awaiting integration</span>
              </div>
              <div className="relative mt-4 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-slate-500">RPC connection</div>
                  <div className="mt-1.5 font-mono text-[11px] text-slate-400">Unavailable</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Latest slot</div>
                  <div className="mt-1.5 font-mono text-[11px] text-slate-400">—</div>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section aria-label="Preview dashboard metrics" className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { icon: <Layers3 size={15} />, label: 'Active launches', value: '—', note: 'Awaiting launchpad integration', tint: 'text-cyan-200' },
            { icon: <Activity size={15} />, label: 'Market activity', value: 'Unavailable', note: 'No live market feed connected', tint: 'text-fuchsia-200' },
            { icon: <Wallet size={15} />, label: 'Connected wallet', value: 'None', note: 'Wallet connection unavailable', tint: 'text-cyan-200' },
            { icon: <Clock3 size={15} />, label: 'Sale schedule', value: 'Not available', note: 'No sale data configured', tint: 'text-fuchsia-200' },
          ].map((item) => (
            <div key={item.label} data-testid={`metric-${item.label.toLowerCase().replace(/ /g, '-')}`} className="rounded-xl border border-white/[0.075] bg-[#0b0f19]/80 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{item.label}</span>
                <span className={item.tint}>{item.icon}</span>
              </div>
              <div className="mt-4 text-base font-semibold tracking-tight text-slate-200">{item.value}</div>
              <div className="mt-1 text-[10px] text-slate-500">{item.note}</div>
            </div>
          ))}
        </section>

        <section id="launchpad" className="mt-7 grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f19]/95">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-200"><Rocket size={16} /></div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Launchpad</h2>
                  <p className="mt-0.5 text-[10px] text-slate-500">Token opportunities on Solana Devnet preview</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative hidden sm:block">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input data-testid="input-search-launches" type="search" disabled aria-label="Search launches unavailable" placeholder="Search launches" className="h-9 w-44 cursor-not-allowed rounded-lg border border-white/[0.08] bg-black/15 pl-8 pr-3 text-[11px] text-slate-400 placeholder:text-slate-600" />
                </div>
                <button type="button" disabled data-testid="button-create-launch" className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-[10px] font-medium text-slate-500">
                  <Rocket size={13} /> Create launch
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1 border-b border-white/[0.06] px-5 py-2.5 sm:px-6">
              <span className="rounded-md border border-cyan-200/15 bg-cyan-200/[0.07] px-2.5 py-1.5 text-[10px] font-medium text-cyan-100">All launches</span>
              <span className="px-2.5 py-1.5 text-[10px] text-slate-500">Upcoming</span>
              <span className="px-2.5 py-1.5 text-[10px] text-slate-500">Live</span>
            </div>
            <div data-testid="status-launches-empty" className="flex min-h-[240px] flex-col items-center justify-center px-5 py-10 text-center">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] text-cyan-200/70">
                <Radar size={23} />
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border-2 border-[#0b0f19] bg-fuchsia-300" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">Launch data hasn’t arrived</h3>
              <p className="mt-2 max-w-[360px] text-xs leading-5 text-slate-500">Launch listings will appear here after product and network integrations are available. No token-sale information is being displayed.</p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500"><CircleSlash2 size={12} /> Awaiting integration</div>
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-[9px] text-slate-600 sm:px-6">
              <span>Launch data unavailable</span>
              <span className="font-mono uppercase tracking-[0.12em]">Source: none</span>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/[0.09] bg-[#0b0f19]/95 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Zap size={15} className="text-fuchsia-200" /> Trade panel</div>
                <span className="rounded border border-white/[0.08] px-1.5 py-1 font-mono text-[8px] uppercase tracking-wider text-slate-500">Disabled</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" disabled data-testid="button-buy-disabled" className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-emerald-200/10 bg-emerald-300/[0.04] py-2.5 text-[11px] font-semibold text-emerald-100/35"><ArrowUpRight size={14} /> Buy</button>
                <button type="button" disabled data-testid="button-sell-disabled" className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-rose-200/10 bg-rose-300/[0.035] py-2.5 text-[11px] font-semibold text-rose-100/35"><ArrowDownRight size={14} /> Sell</button>
              </div>
              <div className="mt-4 space-y-3 border-t border-white/[0.07] pt-4">
                <div className="flex justify-between text-[10px]"><span className="text-slate-500">Token</span><span className="text-slate-400">Not selected</span></div>
                <div className="flex justify-between text-[10px]"><span className="text-slate-500">Quote</span><span className="font-mono text-slate-400">—</span></div>
                <div className="flex justify-between text-[10px]"><span className="text-slate-500">Order status</span><span className="text-slate-400">Unavailable</span></div>
              </div>
              <p className="mt-4 flex gap-2 rounded-lg bg-white/[0.025] p-3 text-[10px] leading-4 text-slate-500"><LockKeyhole size={13} className="mt-0.5 shrink-0 text-slate-600" /> Trading actions are disabled. This preview cannot place orders or interact with funds.</p>
            </div>
            <div className="rounded-2xl border border-white/[0.09] bg-[#0b0f19]/95 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Command size={15} className="text-cyan-200" /> Quick links</div>
              <div className="mt-4 space-y-2">
                <a href="#terminal" data-testid="link-terminal-preview" className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2.5 text-[11px] text-slate-400 transition hover:border-cyan-200/15 hover:text-slate-200"><span className="flex items-center gap-2"><TerminalSquare size={13} /> Terminal preview</span><ArrowDownRight size={13} /></a>
                <a href="#readiness" data-testid="link-readiness-checklist" className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2.5 text-[11px] text-slate-400 transition hover:border-cyan-200/15 hover:text-slate-200"><span className="flex items-center gap-2"><FileCheck2 size={13} /> Readiness notes</span><ArrowDownRight size={13} /></a>
              </div>
            </div>
          </aside>
        </section>

        <section id="terminal" className="mt-7 scroll-mt-24">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-200/70"><span className="h-px w-5 bg-cyan-300/50" /> Interface study</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-100">Terminal, imagined.</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200/15 bg-amber-200/[0.04] px-2.5 py-1.5 text-[9px] uppercase tracking-[0.12em] text-amber-100/65"><Eye size={12} /> Illustrative, not live market data</span>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0f19]">
            <div className="absolute inset-0 bg-gradient-to-t from-[#080b14]/75 via-transparent to-[#080b14]/10" />
            <img src={visual('/visuals/nexus-terminal-reveal.webp')} alt="Illustrative artwork of a proposed NEXUS trading terminal with abstract charts" className="block aspect-[16/7] w-full object-cover object-center opacity-75 sm:aspect-[2.4/1]" />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] bg-[#080b14]/75 px-4 py-3 backdrop-blur-md sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-fuchsia-200/15 bg-fuchsia-200/[0.07] text-fuchsia-200"><TerminalSquare size={15} /></div>
                <div>
                  <div className="text-[11px] font-medium text-slate-200">Market terminal concept</div>
                  <div className="mt-0.5 text-[9px] text-slate-500">Artwork only · no market feed or price data</div>
                </div>
              </div>
              <span data-testid="status-terminal-illustrative" className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-200/70" /> Not connected</span>
            </div>
          </div>
        </section>

        <section id="readiness" className="mt-7 scroll-mt-24">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-fuchsia-200/70"><span className="h-px w-5 bg-fuchsia-300/50" /> Before any real launch</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-100">Readiness is work in progress.</h2>
            </div>
            <p className="max-w-[380px] text-right text-[10px] leading-4 text-slate-500">No item below is represented as complete or independently verified.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              { icon: <ShieldCheck size={16} />, title: 'Independent security review', text: 'Not represented as complete. Independent review is still required.' },
              { icon: <Activity size={16} />, title: 'Load testing', text: 'Not represented as complete. Realistic capacity testing is required.' },
              { icon: <Globe2 size={16} />, title: 'Legal, KYC & AML', text: 'Requirements have not been established for a public sale.' },
              { icon: <FileCheck2 size={16} />, title: 'Contract verification', text: 'No contract is connected or presented as verified.' },
            ].map((item) => (
              <article key={item.title} data-testid={`readiness-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="rounded-xl border border-white/[0.075] bg-[#0b0f19]/85 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-slate-400">{item.icon}</div>
                  <span className="rounded border border-amber-200/10 bg-amber-200/[0.04] px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-amber-100/60">Required</span>
                </div>
                <h3 className="mt-4 text-xs font-semibold text-slate-200">{item.title}</h3>
                <p className="mt-2 text-[10px] leading-4 text-slate-500">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-7 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-cyan-300/10 bg-gradient-to-br from-cyan-300/[0.055] to-transparent p-5 sm:p-6">
            <div className="flex items-center gap-2 text-cyan-100"><Sparkles size={15} /><span className="text-xs font-semibold">A considered launch experience</span></div>
            <p className="mt-3 max-w-xl text-xs leading-5 text-slate-400">NEXUS is a proposed token launchpad and trading experience. This screen shows the intended interface direction only; no wallet, chain reads, sales, trading, or AI outputs are active.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-md border border-white/[0.08] bg-black/10 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-400">Solana Devnet preview</span>
              <span className="rounded-md border border-white/[0.08] bg-black/10 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-400">No real funds</span>
              <span className="rounded-md border border-white/[0.08] bg-black/10 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-400">Integration pending</span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0b0f19]/85 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-slate-200"><CircleHelp size={15} className="text-fuchsia-200" /><span className="text-xs font-semibold">What is available right now?</span></div>
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3 text-[11px] leading-5 text-slate-400"><Check size={13} className="mt-1 shrink-0 text-cyan-200/70" /> A visual concept of the NEXUS launchpad and terminal.</div>
              <div className="flex items-start gap-3 text-[11px] leading-5 text-slate-400"><Check size={13} className="mt-1 shrink-0 text-cyan-200/70" /> Clear status for disconnected and unavailable integrations.</div>
              <div className="flex items-start gap-3 text-[11px] leading-5 text-slate-400"><CircleSlash2 size={13} className="mt-1 shrink-0 text-slate-600" /> No real wallet actions, trades, token sale, or market feed.</div>
            </div>
          </div>
        </section>

        <footer className="mt-9 flex flex-col gap-4 border-t border-white/[0.07] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 overflow-hidden rounded-md border border-white/[0.08]"><img src={visual('/visuals/nexus-logo.webp')} alt="" className="h-full w-full object-cover" /></div>
            <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-slate-400">NEXUS <span className="font-normal tracking-normal text-slate-600">/ protocol preview</span></span>
          </div>
          <p className="max-w-2xl text-[9px] leading-4 text-slate-600">This is a non-functional product preview. It is not an offer to sell tokens or financial advice. Do not send funds or connect a wallet. No transaction, market, security, or legal status is implied.</p>
          <div className="flex shrink-0 items-center gap-2 rounded-md border border-white/[0.07] px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> Preview only</div>
        </footer>
      </div>
    </main>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
