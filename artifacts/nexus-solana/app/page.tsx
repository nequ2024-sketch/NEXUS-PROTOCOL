import Link from "next/link";

function NexusMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      viewBox="0 0 42 42"
      fill="none"
    >
      <path d="M21 2.8 38.8 13v16L21 39.2 3.2 29V13L21 2.8Z" />
      <path d="m21 10.5 10.6 6.1v8.8L21 31.5l-10.6-6.1v-8.8L21 10.5Z" />
      <path d="m15.4 26.3 5.5-11 5.7 11M17.5 22h7" />
      <circle cx="21" cy="4.8" r="1.5" />
      <circle cx="37" cy="13.7" r="1.5" />
      <circle cx="5" cy="13.7" r="1.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h11M10 5l5 5-5 5" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M3 12h4l2.2-6 4.2 12 2.1-6H21" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

export default function LaunchpadPage() {
  return (
    <main className="nexus-shell">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="topbar">
        <Link className="brand" href="/" aria-label="NEXUS launchpad home" data-testid="link-launchpad-home">
          <NexusMark />
          <span className="brand-word">NEXUS<span> / PROTOCOL</span></span>
        </Link>

        <nav className="primary-nav" aria-label="Main navigation">
          <span className="nav-item nav-current" aria-current="page">Launchpad</span>
          <span className="nav-item nav-future">My tokens <small>SOON</small></span>
        </nav>

        <div className="header-right">
          <div className="network-pill" data-testid="network-status">
            <span className="network-dot" />
            <span>Solana Devnet</span>
          </div>
          <button className="wallet-button" type="button" disabled aria-label="Wallet connection not available yet" data-testid="button-wallet-unavailable">
            <span className="wallet-symbol" aria-hidden="true">◈</span>
            <span>Wallet soon</span>
          </button>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-art" aria-hidden="true" />
        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-line" /> SOLANA DEVNET · LAUNCHPAD</div>
          <h1 id="hero-title">
            The next wave
            <br />
            starts <span>here.</span>
          </h1>
          <p className="hero-copy">
            A new frontier for token launches on Solana.
            <br className="desktop-break" />
            Explore the network as it takes shape.
          </p>
          <div className="hero-actions">
            <button className="primary-action" type="button" disabled data-testid="create-token-unavailable">
              <span>Create a token</span>
              <ArrowIcon />
              <span className="soon-label">SOON</span>
            </button>
            <span className="action-note">Creation flow is not live yet</span>
          </div>
          <div className="hero-footnote">
            <span className="tiny-cross">+</span>
            DEVNET ONLY <span className="footnote-divider">/</span> NO MAINNET ASSETS
          </div>
        </div>

        <aside className="launch-panel" aria-label="Launchpad status">
          <div className="panel-topline">
            <span className="panel-kicker">NETWORK ACTIVITY</span>
            <span className="live-indicator"><i /> STANDBY</span>
          </div>
          <div className="panel-title-row">
            <h2>Launch stream</h2>
            <span className="stream-mark" aria-hidden="true"><PulseIcon /></span>
          </div>
          <p className="panel-intro">Launch data will appear here once direct Devnet reading is connected.</p>
          <div className="empty-stream" data-testid="launch-stream-empty">
            <div className="empty-orbit" aria-hidden="true">
              <span className="orbit-ring orbit-one" />
              <span className="orbit-ring orbit-two" />
              <span className="orbit-core"><NexusMark /></span>
              <span className="orbit-node node-a" />
              <span className="orbit-node node-b" />
              <span className="orbit-node node-c" />
            </div>
            <p className="empty-title">Chain reader offline</p>
            <p className="empty-copy">No launch data is being read yet.</p>
          </div>
          <div className="panel-foot">
            <span className="foot-label">INDEXER</span>
            <span className="indexer-state"><b /> READER OFFLINE</span>
          </div>
        </aside>

        <div className="hero-coordinate" aria-hidden="true">DEVNET SOURCE <span>/</span> NOT CONNECTED</div>
      </section>

      <section className="signal-row" aria-label="Platform status">
        <div className="signal-heading">
          <span className="section-index">01 /</span>
          <span>THE TEST NETWORK</span>
        </div>
        <div className="signal-copy">
          <h2>Built for the <em>first move.</em></h2>
          <p>This interface is a preview. Token creation and on-chain transactions remain disabled until the Solana program is connected.</p>
        </div>
        <div className="signal-status">
          <span className="status-glyph" aria-hidden="true"><span /><span /><span /></span>
          <div>
            <strong>Devnet environment</strong>
            <small>Transactions are not enabled</small>
          </div>
          <span className="status-tag">PREVIEW</span>
        </div>
      </section>

      <section className="how-section" aria-labelledby="how-title">
        <div className="how-heading">
          <span className="section-index">02 / GETTING STARTED</span>
          <h2 id="how-title">A launchpad, <span>in progress.</span></h2>
          <p>Three parts of the experience are taking shape. No wallet connection or on-chain actions are available yet.</p>
        </div>
        <ol className="steps">
          <li className="step">
            <span className="step-number">01</span>
            <span className="step-rule" />
            <h3>Connect the network</h3>
            <p>Solana Devnet is the only environment in scope for this preview.</p>
            <span className="step-state"><i /> SCOPE SET</span>
          </li>
          <li className="step">
            <span className="step-number">02</span>
            <span className="step-rule" />
            <h3>Publish a token</h3>
            <p>Token creation will open after program integration is complete.</p>
            <span className="step-state step-pending"><i /> IN PROGRESS</span>
          </li>
          <li className="step">
            <span className="step-number">03</span>
            <span className="step-rule" />
            <h3>Explore launches</h3>
              <p>Verified token details will populate the launch stream when direct Devnet reading is live.</p>
            <span className="step-state step-pending"><i /> IN PROGRESS</span>
          </li>
        </ol>
      </section>

      <footer className="site-footer">
        <div className="footer-brand"><NexusMark /><span>NEXUS <b>PROTOCOL</b></span></div>
        <p>EARLY ACCESS PREVIEW <span>·</span> SOLANA DEVNET</p>
        <span className="footer-build">BUILD 0.1 <i /></span>
      </footer>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
        :root {
          color-scheme: dark;
          --ink: #e9f2f7;
          --muted: #7b8a9b;
          --dim: #536171;
          --line: rgba(153, 185, 208, .13);
          --cyan: #59ecfa;
          --pink: #ed5ce7;
          --night: #070b13;
        }
        * { box-sizing: border-box; }
        html { background: var(--night); scroll-behavior: smooth; }
        body {
          margin: 0;
          background: #070b13;
          color: var(--ink);
          font-family: 'Manrope', sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        button { font: inherit; }
        button:focus-visible, a:focus-visible { outline: 2px solid var(--cyan); outline-offset: 4px; }
        .nexus-shell { min-height: 100vh; overflow: hidden; position: relative; isolation: isolate; }
        .ambient-grid {
          position: absolute; inset: 0 0 auto; height: 920px; z-index: -1; pointer-events: none;
          background-image: linear-gradient(rgba(80, 139, 168, .035) 1px, transparent 1px), linear-gradient(90deg, rgba(80, 139, 168, .035) 1px, transparent 1px);
          background-size: 60px 60px; mask-image: linear-gradient(to bottom, black, transparent 88%);
        }
        .topbar {
          width: min(1352px, calc(100% - 88px)); height: 86px; margin: 0 auto;
          display: flex; align-items: center; border-bottom: 1px solid var(--line); position: relative; z-index: 5;
        }
        .brand { text-decoration: none; color: var(--ink); display: flex; gap: 11px; align-items: center; min-width: 245px; }
        .brand-mark { width: 34px; height: 34px; stroke: var(--cyan); stroke-width: 1.15; }
        .brand-mark path:first-child { stroke: var(--pink); }
        .brand-word { font-size: 13px; font-weight: 800; letter-spacing: .18em; }
        .brand-word span { color: #82919f; font-size: 10px; font-weight: 600; letter-spacing: .11em; }
        .primary-nav { display: flex; align-items: center; gap: 39px; height: 100%; }
        .nav-item { position: relative; color: #82919f; font-size: 12px; letter-spacing: .025em; }
        .nav-current { color: #eef8fb; height: 100%; display: flex; align-items: center; }
        .nav-current:after { content: ''; position: absolute; height: 2px; bottom: -1px; left: 0; right: 0; background: linear-gradient(90deg, var(--cyan), var(--pink)); }
        .nav-future { color: #607080; }
        .nav-future small { margin-left: 7px; font: 9px 'DM Mono', monospace; color: #667587; border: 1px solid #36404d; padding: 3px 5px; border-radius: 2px; }
        .header-right { margin-left: auto; display: flex; align-items: center; gap: 18px; }
        .network-pill { border: 1px solid rgba(89,236,250,.22); background: rgba(34, 161, 176, .065); border-radius: 30px; padding: 8px 11px; display: flex; gap: 8px; align-items: center; color: #a3c2c9; font: 10px 'DM Mono', monospace; letter-spacing: .025em; }
        .network-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 10px rgba(89,236,250,.75); }
        .wallet-button { border: 1px solid rgba(89,236,250,.35); background: transparent; color: #95a5b4; height: 36px; padding: 0 13px; border-radius: 3px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 8px; cursor: not-allowed; opacity: .72; }
        .wallet-symbol { color: var(--cyan); font-size: 17px; }
        .hero { width: min(1352px, calc(100% - 88px)); margin: 0 auto; min-height: 588px; position: relative; display: grid; grid-template-columns: 1.1fr .9fr; align-items: center; }
        .hero-art { position: absolute; z-index: -1; width: 100%; height: 560px; left: 0; top: 4px; background-image: linear-gradient(90deg, #070b13 0%, rgba(7,11,19,.95) 20%, rgba(7,11,19,.61) 54%, #070b13 100%), linear-gradient(0deg, #070b13 0%, transparent 41%, rgba(7,11,19,.25) 100%), url('/nexus-solana/visuals/nexus-energy-boot.png'); background-size: cover; background-position: center 47%; opacity: .45; mix-blend-mode: screen; mask-image: linear-gradient(to bottom, black 0%, black 52%, transparent 100%); }
        .hero-content { padding: 44px 0 52px 4.5%; align-self: center; margin-top: -8px; }
        .eyebrow, .section-index, .panel-kicker, .hero-footnote, .panel-foot, .step-number, .step-state, .footer-build, .site-footer > p { font-family: 'DM Mono', monospace; }
        .eyebrow { color: #98a9b6; font-size: 10px; letter-spacing: .2em; display: flex; align-items: center; gap: 11px; }
        .eyebrow-line { width: 27px; height: 1px; background: var(--pink); box-shadow: 0 0 9px rgba(237,92,231,.8); }
        h1 { margin: 25px 0 19px; font-size: clamp(55px, 6.3vw, 86px); line-height: .99; letter-spacing: -.075em; font-weight: 700; color: #f2f5f9; }
        h1 span { color: transparent; -webkit-text-stroke: 1px #a7bac8; position: relative; }
        h1 span:after { content: ''; position: absolute; width: 66%; height: 2px; left: 7%; bottom: -7px; background: linear-gradient(90deg, var(--cyan), var(--pink)); box-shadow: 0 0 14px rgba(89,236,250,.5); }
        .hero-copy { font-size: 14px; line-height: 1.9; color: #9aa9b8; margin: 0; letter-spacing: .005em; }
        .hero-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 11px; margin-top: 28px; }
        .primary-action { border: 1px solid rgba(89,236,250,.5); height: 47px; padding: 0 15px 0 18px; background: linear-gradient(105deg, rgba(44,211,228,.14), rgba(144,76,188,.11)); display: flex; align-items: center; gap: 19px; color: #d7eff3; font-weight: 700; font-size: 12px; border-radius: 3px; position: relative; cursor: not-allowed; opacity: .86; }
        .primary-action svg { width: 18px; stroke: var(--cyan); stroke-width: 1.5; transition: transform .2s ease; }
        .soon-label { font: 9px 'DM Mono', monospace; color: #b48cbb; letter-spacing: .12em; border-left: 1px solid rgba(200,154,213,.35); padding-left: 12px; }
        .action-note { color: #637382; font-size: 10px; }
        .hero-footnote { color: #718191; font-size: 9px; letter-spacing: .14em; margin-top: 48px; }
        .tiny-cross { color: var(--cyan); font-size: 15px; vertical-align: -1px; margin-right: 5px; }
        .footnote-divider { color: var(--pink); padding: 0 7px; }
        .launch-panel { width: min(100%, 433px); justify-self: end; margin: 2px 4.5% 0 0; border: 1px solid rgba(123,155,180,.2); background: linear-gradient(145deg, rgba(14,22,34,.91), rgba(9,14,23,.94)); box-shadow: 0 24px 70px rgba(0,0,0,.34), inset 0 1px rgba(255,255,255,.025); position: relative; }
        .launch-panel:before, .launch-panel:after { content: ''; position: absolute; width: 23px; height: 23px; pointer-events: none; }
        .launch-panel:before { top: -1px; left: -1px; border-top: 1px solid var(--cyan); border-left: 1px solid var(--cyan); }
        .launch-panel:after { bottom: -1px; right: -1px; border-bottom: 1px solid var(--pink); border-right: 1px solid var(--pink); }
        .panel-topline { display: flex; align-items: center; justify-content: space-between; padding: 19px 22px 0; }
        .panel-kicker { font-size: 9px; color: #7e8fa0; letter-spacing: .17em; }
        .live-indicator { font: 9px 'DM Mono', monospace; color: #aa9eb4; display: flex; align-items: center; gap: 7px; letter-spacing: .08em; }
        .live-indicator i { width: 5px; height: 5px; border-radius: 50%; background: #d47cdf; box-shadow: 0 0 7px rgba(212,124,223,.65); }
        .panel-title-row { display: flex; align-items: center; justify-content: space-between; margin: 15px 22px 0; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
        .panel-title-row h2 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -.035em; }
        .stream-mark { width: 30px; height: 30px; color: var(--cyan); display: grid; place-items: center; border: 1px solid rgba(89,236,250,.2); border-radius: 50%; }
        .stream-mark svg { width: 17px; stroke: currentColor; stroke-width: 1.2; }
        .panel-intro { font-size: 10px; line-height: 1.65; color: #788898; margin: 14px 22px 0; }
        .empty-stream { min-height: 209px; margin: 0 22px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-bottom: 1px solid var(--line); }
        .empty-orbit { position: relative; width: 86px; height: 75px; display: flex; justify-content: center; align-items: center; }
        .orbit-ring { position: absolute; display: block; border: 1px solid rgba(80,207,221,.17); border-radius: 50%; transform: rotate(-24deg); }
        .orbit-one { width: 84px; height: 31px; }
        .orbit-two { width: 54px; height: 69px; border-color: rgba(217,92,218,.19); transform: rotate(38deg); }
        .orbit-core { width: 42px; height: 42px; display: grid; place-items: center; background: radial-gradient(circle, rgba(76,191,220,.16), rgba(11,19,29,.8) 72%); border-radius: 50%; }
        .orbit-core .brand-mark { width: 24px; height: 24px; }
        .orbit-node { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 8px var(--cyan); }
        .node-a { top: 9px; left: 22px; }
        .node-b { right: 7px; top: 41px; background: var(--pink); box-shadow: 0 0 8px var(--pink); }
        .node-c { left: 9px; bottom: 11px; }
        .empty-title { color: #ced8df; font-size: 11px; font-weight: 700; margin: 13px 0 4px; }
        .empty-copy { color: #738393; font-size: 10px; margin: 0; }
        .panel-foot { height: 43px; display: flex; align-items: center; justify-content: space-between; margin: 0 22px; font-size: 8px; letter-spacing: .12em; }
        .foot-label { color: #718191; }
        .indexer-state { color: #858391; display: flex; align-items: center; gap: 7px; }
        .indexer-state b { width: 5px; height: 5px; border-radius: 50%; background: #b880ce; }
        .hero-coordinate { position: absolute; right: 4.5%; bottom: 21px; font: 8px 'DM Mono', monospace; letter-spacing: .09em; color: #495969; }
        .signal-row { width: min(1352px, calc(100% - 88px)); min-height: 144px; margin: 0 auto; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); display: grid; grid-template-columns: .92fr 1.22fr 1fr; align-items: center; gap: 30px; }
        .signal-heading { color: #9daab5; font: 9px 'DM Mono', monospace; letter-spacing: .15em; align-self: start; padding-top: 28px; }
        .section-index { color: #59cbd9; margin-right: 11px; font-size: 9px; letter-spacing: .08em; }
        .signal-copy h2 { font-size: 19px; letter-spacing: -.045em; margin: 0 0 7px; font-weight: 600; }
        .signal-copy h2 em { font-style: normal; color: var(--cyan); }
        .signal-copy p { margin: 0; max-width: 440px; color: #81909f; font-size: 10px; line-height: 1.8; }
        .signal-status { border-left: 1px solid var(--line); padding-left: 23px; display: flex; gap: 12px; align-items: center; }
        .status-glyph { width: 31px; height: 31px; border: 1px solid rgba(89,236,250,.25); display: flex; justify-content: center; align-items: center; gap: 3px; }
        .status-glyph span { display: block; width: 2px; background: var(--cyan); opacity: .8; }
        .status-glyph span:nth-child(1) { height: 7px; }
        .status-glyph span:nth-child(2) { height: 13px; }
        .status-glyph span:nth-child(3) { height: 9px; background: var(--pink); }
        .signal-status strong, .signal-status small { display: block; }
        .signal-status strong { font-size: 10px; font-weight: 600; color: #cbd5dd; }
        .signal-status small { font-size: 9px; color: #788896; margin-top: 4px; }
        .status-tag { margin-left: auto; color: #7faab2; border: 1px solid rgba(89,236,250,.2); padding: 5px 7px; font: 8px 'DM Mono', monospace; letter-spacing: .1em; }
        .how-section { width: min(1352px, calc(100% - 88px)); margin: 0 auto; padding: 69px 4.5% 75px; display: grid; grid-template-columns: .82fr 1.18fr; gap: 7%; }
        .how-heading .section-index { display: block; margin: 0 0 22px; }
        .how-heading h2 { margin: 0; max-width: 370px; font-size: 31px; line-height: 1.12; letter-spacing: -.065em; font-weight: 600; }
        .how-heading h2 span { color: #8595a4; }
        .how-heading p { max-width: 340px; color: #7f8d9b; font-size: 10px; line-height: 1.9; margin: 15px 0 0; }
        .steps { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
        .step { position: relative; padding-top: 2px; min-height: 155px; }
        .step-number { color: #6e7e8e; font-size: 9px; }
        .step-rule { display: block; height: 1px; margin: 13px 0 17px; background: linear-gradient(90deg, rgba(89,236,250,.58), rgba(149,118,195,.12)); }
        .step h3 { margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #d7e0e6; letter-spacing: -.02em; }
        .step p { margin: 0; color: #7b8a98; font-size: 9px; line-height: 1.8; min-height: 48px; }
        .step-state { color: #9dd4d7; font-size: 8px; letter-spacing: .12em; display: flex; align-items: center; gap: 6px; margin-top: 14px; }
        .step-state i { width: 5px; height: 5px; background: var(--cyan); display: inline-block; border-radius: 50%; box-shadow: 0 0 6px rgba(89,236,250,.6); }
        .step-pending { color: #92809b; }
        .step-pending i { background: #bb6abe; box-shadow: 0 0 6px rgba(187,106,190,.5); }
        .site-footer { border-top: 1px solid var(--line); width: min(1352px, calc(100% - 88px)); min-height: 70px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
        .footer-brand { display: flex; align-items: center; gap: 8px; font-size: 9px; font-weight: 800; letter-spacing: .14em; color: #c1cbd3; }
        .footer-brand .brand-mark { width: 23px; height: 23px; }
        .footer-brand b { color: #788796; font-weight: 600; }
        .site-footer > p { font-size: 8px; color: #637281; letter-spacing: .13em; }
        .site-footer > p span { color: var(--pink); padding: 0 5px; }
        .footer-build { color: #647382; font-size: 8px; letter-spacing: .1em; display: flex; align-items: center; gap: 8px; }
        .footer-build i { width: 5px; height: 5px; border-radius: 50%; background: var(--cyan); }

        @media (min-width: 1500px) {
          .hero { min-height: 636px; }
          .hero-art { height: 612px; }
        }
        @media (max-width: 900px) {
          .topbar, .hero, .signal-row, .how-section, .site-footer { width: calc(100% - 48px); }
          .brand { min-width: auto; }
          .primary-nav { margin-left: 34px; gap: 24px; }
          .hero { min-height: 570px; grid-template-columns: 1fr .93fr; }
          .hero-content { padding-left: 2%; }
          .launch-panel { margin-right: 0; }
          h1 { font-size: clamp(53px, 7vw, 72px); }
          .signal-row { grid-template-columns: .72fr 1.2fr 1fr; gap: 18px; }
          .how-section { padding-left: 2%; padding-right: 2%; gap: 4%; }
          .steps { gap: 14px; }
        }
        @media (max-width: 650px) {
          .topbar, .hero, .signal-row, .how-section, .site-footer { width: calc(100% - 36px); }
          .topbar { height: 70px; }
          .brand-mark { width: 29px; height: 29px; }
          .brand-word { font-size: 11px; letter-spacing: .13em; }
          .brand-word span { font-size: 8px; }
          .primary-nav { display: none; }
          .header-right { gap: 8px; }
          .network-pill { padding: 7px 8px; font-size: 8px; }
          .wallet-button { height: 32px; padding: 0 8px; font-size: 9px; }
          .wallet-symbol { font-size: 14px; }
          .hero { display: flex; flex-direction: column; align-items: stretch; padding: 54px 0 32px; }
          .hero-art { height: 510px; width: calc(100% + 36px); left: -18px; top: 0; background-position: 51% center; opacity: .38; }
          .hero-content { padding: 0 2px 37px; margin: 0; }
          .eyebrow { font-size: 9px; }
          h1 { font-size: clamp(56px, 14vw, 78px); margin-top: 22px; }
          .hero-copy { font-size: 12px; }
          .hero-actions { margin-top: 23px; }
          .hero-footnote { margin-top: 27px; font-size: 8px; }
          .launch-panel { width: 100%; margin: 0; }
          .panel-topline { padding: 16px 17px 0; }
          .panel-title-row { margin: 12px 17px 0; }
          .panel-intro { margin: 12px 17px 0; }
          .empty-stream { margin: 0 17px; min-height: 191px; }
          .panel-foot { margin: 0 17px; }
          .hero-coordinate { display: none; }
          .signal-row { padding: 23px 0; grid-template-columns: 1fr; gap: 16px; }
          .signal-heading { padding: 0; }
          .signal-copy h2 { font-size: 18px; }
          .signal-status { border-left: 0; border-top: 1px solid var(--line); padding: 17px 0 0; }
          .how-section { display: block; padding: 53px 2% 48px; }
          .how-heading h2 { font-size: 29px; }
          .steps { margin-top: 32px; grid-template-columns: 1fr; gap: 22px; }
          .step { min-height: auto; display: grid; grid-template-columns: 36px 1fr; column-gap: 10px; }
          .step-number { grid-row: 1 / span 4; }
          .step-rule { grid-column: 2; margin: 6px 0 12px; }
          .step h3, .step p, .step-state { grid-column: 2; }
          .step p { min-height: 0; max-width: 280px; }
          .step-state { margin-top: 11px; }
          .site-footer { min-height: 68px; }
          .site-footer > p { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
        }
      `}</style>
    </main>
  );
}
