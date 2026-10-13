import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserProvider, Contract, formatUnits, getAddress, MaxUint256, parseUnits, type Eip1193Provider } from 'ethers';
import { ArrowUpRight, Check, CircleAlert, Clock3, Coins, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, Wallet, X } from 'lucide-react';
import { TESTNET_CHAIN_ID } from '@/lib/contracts';
import { useTestnetDeployment } from '@/lib/testnet-deployment';
import './subscriptions-page.css';

type WalletProps = {
  address: string | null;
  chainId: number | null;
  connect: () => Promise<void>;
};

type Plan = {
  id: number;
  name: string;
  priceUSDT: bigint;
  priceNEXUS: bigint;
  duration: bigint;
  active: boolean;
};

type Subscription = {
  planId: bigint;
  expiresAt: bigint;
  autoRenew: boolean;
  paymentToken: string;
  active: boolean;
};

type Snapshot = {
  plans: Plan[];
  subscription: Subscription;
  usdtAddress: string;
  nexusAddress: string;
  paymentSymbol: string;
  paymentBalance: bigint;
  nexusBalance: bigint;
  allowance: bigint;
  chainNow: number;
};

type VerificationState = 'idle' | 'checking' | 'verified' | 'pending' | 'unavailable' | 'failed';
type TxState = 'idle' | 'approving' | 'submitting' | 'confirming' | 'verifying' | 'renew-approval' | 'renew-setting';

const SUBSCRIPTION_ABI = [
  'function getPlan(uint256) view returns (tuple(string name,uint256 priceUSDT,uint256 priceNEXUS,uint256 duration,bool active))',
  'function getSubscription(address) view returns (uint256 planId,uint256 expiresAt,bool autoRenew)',
  'function isActive(address) view returns (bool)',
  'function subscriptions(address) view returns (uint256 planId,uint256 expiresAt,uint256 lastCharged,bool autoRenew,address paymentToken)',
  'function usdt() view returns (address)',
  'function nexus() view returns (address)',
  'function subscribe(uint256 planId,address paymentToken)',
  'function upgrade(uint256 newPlanId,address paymentToken)',
  'function setAutoRenew(bool enabled)',
  'function cancel()',
];

const TOKEN_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
];

const TIER_FEATURES: Record<string, string[]> = {
  FREE: ['Protocol access', 'Public interface'],
  STARTER: ['Everything in Free', 'On-chain signals'],
  PRO: ['Everything in Starter', 'Trading bots interface'],
  ENTERPRISE: ['Everything in Pro', 'API access'],
};
const EXPECTED_PLAN_NAMES = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'];

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'The wallet transaction could not be completed.';
  if (/user rejected|user denied|ACTION_REJECTED/i.test(message)) return 'Transaction rejected in your wallet.';
  if (/insufficient funds/i.test(message)) return 'This wallet needs test BNB for BSC Testnet gas.';
  return message.slice(0, 260);
}

function amount(value: bigint) {
  return Number(formatUnits(value, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function dateLabel(timestamp: bigint) {
  if (timestamp === 0n) return 'No expiry';
  return new Date(Number(timestamp) * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function isEthereumProvider(value: unknown): value is Eip1193Provider {
  return Boolean(value && typeof value === 'object' && 'request' in value);
}

export function SubscriptionsPage({ wallet }: { wallet: WalletProps }) {
  const { deployment, loading: deploymentLoading, error: deploymentError, reload: reloadDeployment } = useTestnetDeployment();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<'usdt' | 'nexus'>('usdt');
  const [busy, setBusy] = useState<TxState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationState>('idle');
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [renewWarning, setRenewWarning] = useState(false);
  const [renewAllowanceReady, setRenewAllowanceReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const readSnapshot = useCallback(async () => {
    if (!deployment || !wallet.address || wallet.chainId !== TESTNET_CHAIN_ID) {
      setSnapshot(null);
      setReadError(null);
      return;
    }
    const injected = (window as Window & { ethereum?: unknown }).ethereum;
    if (!isEthereumProvider(injected)) {
      setSnapshot(null);
      setReadError('No compatible browser wallet is available to read BSC Testnet.');
      return;
    }
    setReadLoading(true);
    setReadError(null);
    try {
      const provider = new BrowserProvider(injected);
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(TESTNET_CHAIN_ID)) throw new Error('Switch your wallet to BNB Smart Chain Testnet (chain ID 97).');
      const deploymentAddresses = [deployment.subscriptionManager, deployment.paymentToken, deployment.nexusToken];
      const bytecode = await Promise.all(deploymentAddresses.map((address) => provider.getCode(address)));
      if (bytecode.some((code) => code === '0x')) throw new Error('The Testnet deployment record points to an address without contract code.');

      const manager = new Contract(deployment.subscriptionManager, SUBSCRIPTION_ABI, provider);
      const [usdtAddress, nexusAddress, planRows, rawSub, active, rawMappedSub, block] = await Promise.all([
        manager.usdt() as Promise<string>,
        manager.nexus() as Promise<string>,
        Promise.all([0, 1, 2, 3].map((id) => manager.getPlan(id))),
        manager.getSubscription(wallet.address),
        manager.isActive(wallet.address) as Promise<boolean>,
        manager.subscriptions(wallet.address),
        provider.getBlock('latest'),
      ]);
      if (
        getAddress(usdtAddress) !== getAddress(deployment.paymentToken) ||
        getAddress(nexusAddress) !== getAddress(deployment.nexusToken)
      ) throw new Error('The subscription contract token addresses do not match the verified BSC Testnet deployment record.');

      const tokenAddresses = [usdtAddress, nexusAddress];
      const tokens = tokenAddresses.map((address) => new Contract(address, TOKEN_ABI, provider));
      const [usdtDecimals, nexusDecimals, paymentBalance, nexusBalance] = await Promise.all([
        tokens[0].decimals() as Promise<bigint>,
        tokens[1].decimals() as Promise<bigint>,
        tokens[0].balanceOf(wallet.address) as Promise<bigint>,
        tokens[1].balanceOf(wallet.address) as Promise<bigint>,
      ]);
      if (usdtDecimals !== 18n || nexusDecimals !== 18n) throw new Error('Subscription payment tokens must both use 18 decimals.');

      const subscription = rawMappedSub;
      const planId = BigInt(subscription.planId ?? subscription[0]);
      const expiresAt = BigInt(subscription.expiresAt ?? subscription[1]);
      const autoRenew = Boolean(subscription.autoRenew ?? subscription[3]);
      const paymentToken = String(subscription.paymentToken ?? subscription[4]);
      const allowanceTokenAddress = paymentToken && getAddress(paymentToken) === getAddress(nexusAddress) ? nexusAddress : usdtAddress;
      const currentToken = new Contract(allowanceTokenAddress, TOKEN_ABI, provider);
      const [allowance, paymentSymbol] = await Promise.all([
        currentToken.allowance(wallet.address, deployment.subscriptionManager) as Promise<bigint>,
        tokens[0].symbol().catch(() => deployment.paymentTokenSymbol) as Promise<string>,
      ]);

      // getSubscription is read as a consistency check against the public mapping getter.
      if (BigInt(rawSub.planId ?? rawSub[0]) !== planId || BigInt(rawSub.expiresAt ?? rawSub[1]) !== expiresAt ||
        Boolean(rawSub.autoRenew ?? rawSub[2]) !== autoRenew) {
        throw new Error('Subscription read methods returned inconsistent state. Refresh before continuing.');
      }
      const plans: Plan[] = planRows.map((row: any, id: number) => ({
        id,
        name: String(row.name ?? row[0]),
        priceUSDT: BigInt(row.priceUSDT ?? row[1]),
        priceNEXUS: BigInt(row.priceNEXUS ?? row[2]),
        duration: BigInt(row.duration ?? row[3]),
        active: Boolean(row.active ?? row[4]),
      }));
      if (plans.length !== 4 || plans.some((plan, id) => plan.name.toUpperCase() !== EXPECTED_PLAN_NAMES[id])) {
        throw new Error('The expected FREE through ENTERPRISE plan registry is incomplete on BSC Testnet.');
      }
      setSnapshot({
        plans,
        subscription: { planId, expiresAt, autoRenew, paymentToken, active: Boolean(active) },
        usdtAddress,
        nexusAddress,
        paymentSymbol: String(paymentSymbol || deployment.paymentTokenSymbol),
        paymentBalance,
        nexusBalance,
        allowance,
        chainNow: block?.timestamp ?? 0,
      });
    } catch (cause: unknown) {
      setSnapshot(null);
      setReadError(errorMessage(cause));
    } finally {
      setReadLoading(false);
    }
  }, [deployment, wallet.address, wallet.chainId]);

  useEffect(() => {
    void readSnapshot();
  }, [readSnapshot, refreshKey]);

  const currentPlan = useMemo(() => snapshot?.plans.find((plan) => BigInt(plan.id) === snapshot.subscription.planId), [snapshot]);
  const paymentAddress = selectedToken === 'usdt' ? snapshot?.usdtAddress : snapshot?.nexusAddress;
  const paymentSymbol = selectedToken === 'usdt' ? snapshot?.paymentSymbol ?? 'USDT' : 'NEXUS';
  const selectedBalance = selectedToken === 'usdt' ? snapshot?.paymentBalance ?? 0n : snapshot?.nexusBalance ?? 0n;
  const renewalTokenIsNexus = Boolean(snapshot?.subscription.paymentToken && snapshot.nexusAddress &&
    getAddress(snapshot.subscription.paymentToken) === getAddress(snapshot.nexusAddress));
  const currentRenewalSymbol = renewalTokenIsNexus ? 'NEXUS' : snapshot?.paymentSymbol ?? 'USDT';
  const isBusy = busy !== 'idle';

  function getUpgradeAmount(plan: Plan) {
    if (!snapshot || !currentPlan || currentPlan.duration === 0n || plan.duration === 0n || snapshot.subscription.expiresAt <= BigInt(snapshot.chainNow)) return 0n;
    const remaining = snapshot.subscription.expiresAt - BigInt(snapshot.chainNow);
    const credit = (currentPlan.priceUSDT * remaining) / currentPlan.duration;
    const newCost = (plan.priceUSDT * remaining) / plan.duration;
    const difference = newCost > credit ? newCost - credit : 0n;
    const minimumDue = plan.priceUSDT / 4n + (plan.priceUSDT % 4n === 0n ? 0n : 1n);
    const amountUSDT = difference > minimumDue ? difference : minimumDue;
    return selectedToken === 'usdt' ? amountUSDT : amountUSDT * 80n;
  }

  async function getSigner() {
    const injected = (window as Window & { ethereum?: unknown }).ethereum;
    if (!isEthereumProvider(injected)) throw new Error('No compatible browser wallet was found.');
    if (!wallet.address) throw new Error('Connect your wallet first.');
    if (wallet.chainId !== TESTNET_CHAIN_ID) throw new Error('Switch your wallet to BNB Smart Chain Testnet (chain ID 97).');
    const provider = new BrowserProvider(injected);
    const network = await provider.getNetwork();
    if (network.chainId !== BigInt(TESTNET_CHAIN_ID)) throw new Error('Switch your wallet to BNB Smart Chain Testnet (chain ID 97).');
    return provider.getSigner(wallet.address);
  }

  async function verifyTransaction(hash: string) {
    setVerification('checking');
    setVerificationMessage('Submitting the confirmed Testnet transaction to the subscription verifier.');
    try {
      const response = await fetch('/nexus-api/api/subscriptions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx_hash: hash }),
      });
      if (response.ok) {
        if (response.status === 202) {
          setVerification('pending');
          setVerificationMessage('The verifier accepted the request and is still processing it. The on-chain transaction is confirmed; retry verification to check again.');
          return;
        }
        setVerification('verified');
        setVerificationMessage('The verifier accepted this transaction.');
        return;
      }
      if (response.status === 503) {
        setVerification('unavailable');
        setVerificationMessage('The on-chain transaction succeeded, but the verifier is not available yet (503). Your contract state remains the source of truth.');
        return;
      }
      if (response.status === 409) {
        const body = await response.json().catch(() => ({}));
        if (body.code === 'ALREADY_VERIFIED') {
          setVerification('verified');
          setVerificationMessage('This confirmed subscription transaction was already recorded by the verifier.');
          return;
        }
        setVerification('pending');
        setVerificationMessage('The verifier reports a conflict (409). The on-chain transaction succeeded; check the transaction and retry verification if needed.');
        return;
      }
      setVerification('failed');
      setVerificationMessage(`The on-chain transaction succeeded, but verifier returned HTTP ${response.status}. Retry verification later.`);
    } catch {
      setVerification('unavailable');
      setVerificationMessage('The on-chain transaction succeeded, but the verifier could not be reached. Retry when service is available.');
    }
  }

  async function purchase(plan: Plan) {
    if (!snapshot || !deployment || !paymentAddress || !wallet.address || wallet.chainId !== TESTNET_CHAIN_ID) return;
    setSelectedPlan(plan.id);
    setError(null);
    setNotice(null);
    setTransactionHash(null);
    setVerification('idle');
    setVerificationMessage(null);
    try {
      const signer = await getSigner();
      const token = new Contract(paymentAddress, TOKEN_ABI, signer);
      const manager = new Contract(deployment.subscriptionManager, SUBSCRIPTION_ABI, signer);
      const amountToApprove = snapshot.subscription.active && snapshot.subscription.planId > 0n
        ? getUpgradeAmount(plan)
        : selectedToken === 'usdt' ? plan.priceUSDT : plan.priceNEXUS;
      if (amountToApprove > 0n) {
        setBusy('approving');
        setNotice(`Review exact ${paymentSymbol} approval for ${amount(amountToApprove)} in your wallet.`);
        const approveTx = await token.approve(deployment.subscriptionManager, amountToApprove);
        await approveTx.wait();
      }
      setBusy('submitting');
      setNotice(`${snapshot.subscription.active && snapshot.subscription.planId > 0n ? 'Confirm the upgrade; the greater of the prorated difference and 25% minimum is charged' : 'Confirm the subscription purchase'} in your wallet.`);
      const tx = snapshot.subscription.active && snapshot.subscription.planId > 0n
        ? await manager.upgrade(plan.id, paymentAddress)
        : await manager.subscribe(plan.id, paymentAddress);
      setTransactionHash(tx.hash);
      setBusy('confirming');
      setNotice('Transaction submitted. Waiting for BSC Testnet confirmation.');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('The transaction did not confirm successfully on BSC Testnet.');
      setNotice('Subscription transaction confirmed on BSC Testnet.');
      setBusy('verifying');
      await verifyTransaction(tx.hash);
      setBusy('idle');
      setRefreshKey((key) => key + 1);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
      setBusy('idle');
    }
  }

  async function retryVerification() {
    if (!transactionHash || isBusy) return;
    setError(null);
    setBusy('verifying');
    await verifyTransaction(transactionHash);
    setBusy('idle');
  }

  async function beginAutoRenewApproval() {
    if (!snapshot || !deployment || !wallet.address || wallet.chainId !== TESTNET_CHAIN_ID) return;
    setError(null);
    setNotice(null);
    try {
      const tokenAddress = snapshot.subscription.paymentToken;
      if (!tokenAddress || getAddress(tokenAddress) === getAddress('0x0000000000000000000000000000000000000000')) {
        throw new Error('The active subscription does not have a valid renewal payment token.');
      }
      setBusy('renew-approval');
      setNotice(`Review unlimited ${currentRenewalSymbol} recurring allowance for the NEXUS subscription contract.`);
      const signer = await getSigner();
      const token = new Contract(tokenAddress, TOKEN_ABI, signer);
      const tx = await token.approve(deployment.subscriptionManager, MaxUint256);
      setTransactionHash(tx.hash);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('The unlimited token allowance did not confirm.');
      setRenewAllowanceReady(true);
      setRenewWarning(false);
      setNotice('Unlimited allowance confirmed. Auto-renew is still off; confirm the separate setting transaction below.');
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy('idle');
    }
  }

  async function enableAutoRenew() {
    if (!deployment || !renewAllowanceReady || wallet.chainId !== TESTNET_CHAIN_ID) return;
    setBusy('renew-setting');
    setError(null);
    setNotice('Confirm auto-renew activation in your wallet.');
    try {
      const signer = await getSigner();
      const manager = new Contract(deployment.subscriptionManager, SUBSCRIPTION_ABI, signer);
      const tx = await manager.setAutoRenew(true);
      setTransactionHash(tx.hash);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Auto-renew did not confirm on BSC Testnet.');
      setNotice('Auto-renew is enabled according to the subscription contract.');
      setRenewAllowanceReady(false);
      setRefreshKey((key) => key + 1);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy('idle');
    }
  }

  async function disableAutoRenew() {
    if (!deployment || wallet.chainId !== TESTNET_CHAIN_ID) return;
    setBusy('submitting');
    setError(null);
    setNotice('Confirm cancellation of future renewal in your wallet.');
    try {
      const signer = await getSigner();
      const manager = new Contract(deployment.subscriptionManager, SUBSCRIPTION_ABI, signer);
      const tx = await manager.cancel();
      setTransactionHash(tx.hash);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Cancellation did not confirm on BSC Testnet.');
      setNotice('Future renewal is cancelled. Access remains until the on-chain expiry date.');
      setRenewAllowanceReady(false);
      setRefreshKey((key) => key + 1);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy('idle');
    }
  }

  const deploymentUnavailable = !deploymentLoading && !deployment;
  const currentHasPaidPlan = Boolean(snapshot && snapshot.subscription.planId > 0n);

  return <div className="subscriptions-page">
    <header className="sub-page-head">
      <div>
        <div className="sub-eyebrow"><span className="sub-eyebrow-line" />ACCESS LAYER / 03</div>
        <h1>Access, <span>by protocol.</span></h1>
        <p className="sub-intro">Choose a wallet-held entitlement. Plan terms and membership status are read directly from the deployed BSC Testnet contract.</p>
      </div>
      <div className="sub-head-stamp"><span>NETWORK LOCK</span><strong>BSC TESTNET</strong><small>CHAIN ID 97</small></div>
    </header>

    <section className="sub-hero" aria-label="Subscription model">
      <div className="sub-hero-copy">
        <div className="sub-overline"><span className="sub-led" />NON-CUSTODIAL ACCESS</div>
        <h2>Intelligence for<br /><em>your next decision.</em></h2>
        <p>Membership unlocks protocol features. Every trade remains a separate, explicit choice in your wallet.</p>
      </div>
      <div className="sub-hero-art" aria-hidden="true">
        <img className="sub-hero-art-image" src={`${import.meta.env.BASE_URL}assets/nexus-campaign.webp`} alt="" />
        <div className="sub-orbit sub-orbit-one" /><div className="sub-orbit sub-orbit-two" />
        <div className="sub-art-label">NEXUS / ACCESS<br /><b>CONTROL REMAINS YOURS</b></div>
      </div>
      <div className="sub-hero-foot"><span>01 / CONNECT</span><span>02 / AUTHORIZE</span><span>03 / ACCESS</span></div>
    </section>

    <div className="sub-trust-row">
      <span><ShieldCheck aria-hidden="true" /> No custody</span>
      <span><LockKeyhole aria-hidden="true" /> Exact purchase approval</span>
      <span><Clock3 aria-hidden="true" /> State sourced from chain</span>
    </div>

    {deploymentLoading && <section className="sub-state-panel" role="status" data-testid="status-deployment-loading">
      <div className="sub-skeleton-bar wide" /><div className="sub-skeleton-grid"><i /><i /><i /><i /></div>
      <p>Checking the public BSC Testnet deployment record…</p>
    </section>}
    {deploymentError && <div className="sub-alert is-error" role="alert" data-testid="status-deployment-error"><CircleAlert />{deploymentError}<button type="button" onClick={reloadDeployment} data-testid="button-retry-deployment"><RefreshCw /> Retry</button></div>}
    {deploymentUnavailable && <section className="sub-state-panel sub-unavailable" data-testid="status-deployment-unavailable">
      <div className="sub-state-symbol"><CircleAlert /></div><div className="sub-state-copy"><span>DEPLOYMENT NOT CONFIGURED</span><h2>Plans are not available yet.</h2><p>No plan pricing, duration, or wallet entitlement is displayed without the verified BSC Testnet deployment record. No transaction can be prepared.</p></div>
      <button type="button" className="sub-button secondary" onClick={reloadDeployment} data-testid="button-reload-deployment"><RefreshCw /> CHECK AGAIN</button>
    </section>}

    {deployment && <>
      {!wallet.address ? <section className="sub-connect-strip" data-testid="status-wallet-disconnected">
        <div className="sub-connect-icon"><Wallet /></div><div><span>WALLET REQUIRED</span><strong>Connect to read your entitlement</strong><p>Connect a browser wallet on BSC Testnet. Your keys stay in your wallet.</p></div>
        <button type="button" className="sub-button primary" onClick={() => void wallet.connect()} data-testid="button-connect-wallet"><Wallet /> CONNECT WALLET</button>
      </section> : wallet.chainId !== TESTNET_CHAIN_ID ? <section className="sub-connect-strip is-warn" role="alert" data-testid="status-unsupported-chain">
        <div className="sub-connect-icon"><CircleAlert /></div><div><span>NETWORK NOT SUPPORTED</span><strong>Switch to BNB Smart Chain Testnet</strong><p>Connected chain: {wallet.chainId ?? 'unknown'}. This page only reads and signs on chain ID 97; there is no Mainnet flow.</p></div>
      </section> : <>
        {readLoading && <section className="sub-state-panel compact" role="status" data-testid="status-chain-loading"><div className="sub-loading-pip" /><p>Reading verified contract relationships and wallet state…</p></section>}
        {readError && <div className="sub-alert is-error" role="alert" data-testid="status-chain-error"><CircleAlert /><span>{readError}</span><button type="button" onClick={() => setRefreshKey((key) => key + 1)} disabled={readLoading} data-testid="button-retry-chain"><RefreshCw /> Retry read</button></div>}
        {snapshot && <>
          <section className="sub-current" data-testid="state-current-subscription">
            <div className="sub-current-head"><div><div className="sub-overline">YOUR WALLET ENTITLEMENT</div><h2>{currentPlan?.name ?? 'Unknown plan'}</h2></div>
              <span className={`sub-status-pill ${snapshot.subscription.active ? 'active' : 'inactive'}`} data-testid="status-entitlement">{snapshot.subscription.active ? 'ACTIVE ON-CHAIN' : currentHasPaidPlan ? 'EXPIRED' : 'FREE ACCESS'}</span>
            </div>
            <div className="sub-current-data">
              <div><span>WALLET</span><strong title={wallet.address ?? ''} data-testid="text-wallet-address">{wallet.address ? shortAddress(wallet.address) : '—'}</strong></div>
              <div><span>EXPIRES</span><strong data-testid="text-subscription-expiry">{dateLabel(snapshot.subscription.expiresAt)}</strong></div>
              <div><span>AUTO-RENEW</span><strong data-testid="text-auto-renew">{snapshot.subscription.autoRenew ? 'ON' : 'OFF'}</strong></div>
              <div><span>PAYMENT TOKEN</span><strong data-testid="text-renewal-token">{currentHasPaidPlan ? currentRenewalSymbol : '—'}</strong></div>
            </div>
            <div className="sub-balance-row"><span><Coins /> WALLET BALANCE</span><strong data-testid="text-token-balances">{amount(snapshot.paymentBalance)} {snapshot.paymentSymbol}<i> / </i>{amount(snapshot.nexusBalance)} NEXUS</strong><button type="button" aria-label="Refresh subscription state" onClick={() => setRefreshKey((key) => key + 1)} disabled={readLoading || isBusy} data-testid="button-refresh-subscription"><RefreshCw /></button></div>
          </section>

          <div className="sub-section-heading"><div><span>PLAN REGISTRY</span><h2>Find your level.</h2></div><div className="sub-plan-tools"><p>Available names, prices, duration, and active status below reflect the Testnet contract read.</p><div className="sub-token-choice" role="group" aria-label="Choose subscription payment token" data-testid="control-payment-token">
            <span>PAY WITH</span>
            <button type="button" className={selectedToken === 'usdt' ? 'selected' : ''} aria-pressed={selectedToken === 'usdt'} onClick={() => setSelectedToken('usdt')} data-testid="button-payment-usdt">{snapshot.paymentSymbol}</button>
            <button type="button" className={selectedToken === 'nexus' ? 'selected' : ''} aria-pressed={selectedToken === 'nexus'} onClick={() => setSelectedToken('nexus')} data-testid="button-payment-nexus">NEXUS</button>
          </div></div></div>
          <div className="sub-plan-grid" data-testid="list-subscription-plans">
            {snapshot.plans.map((plan) => {
              const isCurrent = snapshot.subscription.planId === BigInt(plan.id) && snapshot.subscription.active;
              const isUpgrade = snapshot.subscription.active && snapshot.subscription.planId > 0n && BigInt(plan.id) > snapshot.subscription.planId;
              const price = selectedToken === 'usdt' ? plan.priceUSDT : plan.priceNEXUS;
              const charge = isUpgrade ? getUpgradeAmount(plan) : price;
              const hasPaymentBalance = selectedBalance >= charge;
              const actionLabel = plan.id === 0 ? 'CURRENT BASE ACCESS' : isCurrent ? 'CURRENT PLAN' : isUpgrade ? 'UPGRADE' : currentHasPaidPlan && snapshot.subscription.active ? 'NOT AVAILABLE' : 'SELECT PLAN';
              return <article className={`sub-plan-card ${plan.id === 2 ? 'featured' : ''} ${isCurrent ? 'current' : ''}`} key={plan.id} data-testid={`card-plan-${plan.id}`}>
                <div className="sub-plan-top"><span className="sub-tier-code">TIER / 0{plan.id}</span>{isCurrent ? <span className="sub-plan-badge">CURRENT</span> : plan.id === 2 ? <span className="sub-plan-badge magenta">PROTOCOL PICK</span> : null}</div>
                <h3 data-testid={`text-plan-name-${plan.id}`}>{plan.name}</h3>
                <div className="sub-plan-price" data-testid={`text-plan-price-${plan.id}`}><strong>{plan.id === 0 ? '0' : amount(price)}</strong><span>{plan.id === 0 ? 'NO COST' : paymentSymbol}</span></div>
                <p className="sub-plan-duration" data-testid={`text-plan-duration-${plan.id}`}>{plan.duration === 0n ? 'No expiry' : `${Number(plan.duration / 86400n)} day${plan.duration / 86400n === 1n ? '' : 's'} access`}</p>
                <div className="sub-plan-rule" />
                <ul>{(TIER_FEATURES[plan.name.toUpperCase()] ?? []).map((feature) => <li key={feature}><Check aria-hidden="true" />{feature}</li>)}</ul>
                {!plan.active && <div className="sub-plan-inactive" data-testid={`status-plan-inactive-${plan.id}`}>INACTIVE ON-CHAIN</div>}
                {isUpgrade && <div className="sub-proration" data-testid={`text-upgrade-price-${plan.id}`}><span>UPGRADE ESTIMATE</span><strong>{amount(charge)} {paymentSymbol}</strong><small>Greater of the prorated difference or 25% of the new plan price; expiry stays the same.</small></div>}
                <button type="button" className={`sub-button ${plan.id === 2 ? 'primary' : 'secondary'}`} disabled={isBusy || readLoading || !plan.active || plan.id === 0 || isCurrent || (currentHasPaidPlan && snapshot.subscription.active && !isUpgrade) || !hasPaymentBalance || wallet.chainId !== TESTNET_CHAIN_ID} onClick={() => void purchase(plan)} data-testid={`button-plan-action-${plan.id}`}>
                  {isBusy && selectedPlan === plan.id ? <LoaderCircle className="sub-spin" /> : null}{actionLabel}
                </button>
                {!hasPaymentBalance && plan.id > 0 && <span className="sub-plan-footnote" data-testid={`status-plan-balance-${plan.id}`}>Insufficient {paymentSymbol} in this wallet.</span>}
                {!plan.active && <span className="sub-plan-footnote">Contract reports this plan inactive.</span>}
              </article>;
            })}
          </div>

          <section className="sub-controls">
            <div className="sub-controls-copy"><div className="sub-overline">RENEWAL / CONTROL</div><h2>Renewal is never assumed.</h2><p>Auto-renew starts off. Enabling it requires an unlimited recurring token allowance and a separate on-chain confirmation.</p></div>
            <div className="sub-controls-actions">
              {currentHasPaidPlan && snapshot.subscription.active && !snapshot.subscription.autoRenew && !renewAllowanceReady && <button type="button" className="sub-button secondary" disabled={isBusy || readLoading || wallet.chainId !== TESTNET_CHAIN_ID} onClick={() => setRenewWarning((open) => !open)} data-testid="button-start-auto-renew"><Clock3 /> ENABLE AUTO-RENEW</button>}
              {renewWarning && !renewAllowanceReady && <div className="sub-renew-warning" role="group" aria-labelledby="renew-warning-title" data-testid="panel-auto-renew-warning">
                <button type="button" className="sub-close-warning" aria-label="Close auto-renew warning" onClick={() => setRenewWarning(false)} data-testid="button-close-renew-warning"><X /></button>
                <span className="sub-warning-label">RECURRING ALLOWANCE</span><strong id="renew-warning-title">This grants unlimited {currentRenewalSymbol} allowance.</strong>
                <p>Renewal may be executed by an authorized keeper when the subscription expires. Approve only if you understand this; revoke token allowance separately in your wallet if desired. Your access still ends at its on-chain expiry unless renewal succeeds.</p>
                <button type="button" className="sub-button warning" disabled={isBusy} onClick={() => void beginAutoRenewApproval()} data-testid="button-approve-unlimited-renewal">APPROVE UNLIMITED ALLOWANCE</button>
              </div>}
              {renewAllowanceReady && <div className="sub-renew-ready" data-testid="panel-renewal-allowance-ready"><Check /><span>Allowance confirmed. This alone has <b>not</b> enabled renewal.</span><button type="button" className="sub-button primary" disabled={isBusy} onClick={() => void enableAutoRenew()} data-testid="button-confirm-auto-renew">CONFIRM AUTO-RENEW</button></div>}
              {currentHasPaidPlan && snapshot.subscription.active && snapshot.subscription.autoRenew && <div className="sub-renew-active" data-testid="status-renewal-enabled"><span className="sub-led" />AUTO-RENEW ENABLED<button type="button" className="sub-button secondary" disabled={isBusy} onClick={() => void disableAutoRenew()} data-testid="button-cancel-auto-renew">CANCEL FUTURE RENEWAL</button></div>}
              {(!currentHasPaidPlan || !snapshot.subscription.active) && <div className="sub-control-muted" data-testid="status-renewal-unavailable">A live paid entitlement is required to configure renewal.</div>}
            </div>
          </section>
        </>}
      </>}
    </>}

    <section className="sub-disclosures" aria-label="Important subscription details">
      <div><span className="sub-disclosure-index">01</span><div><strong>Upgrade pricing</strong><p>The charge is the greater of the prorated price difference and 25% of the new plan’s full price. Upgrades retain the same expiry and reset auto-renew to off.</p></div></div>
      <div><span className="sub-disclosure-index">02</span><div><strong>Cancel means no renewal</strong><p>Cancellation disables future renewal; access remains until the expiresAt value recorded by the contract.</p></div></div>
      <div><span className="sub-disclosure-index">03</span><div><strong>Revoke allowance separately</strong><p>Cancel does not revoke a token allowance. Manage or revoke approvals in your wallet if you no longer want the contract to have allowance.</p></div></div>
      <div><span className="sub-disclosure-index">04</span><div><strong>Trading stays explicit</strong><p>Any bot or trade interaction still requires your explicit per-order confirmation. Subscription access does not authorize unattended trading.</p></div></div>
    </section>

    {(error || notice || verificationMessage || transactionHash) && <section className="sub-tx-panel" aria-live="polite" data-testid="panel-transaction-state">
      <div className="sub-tx-head"><span>WALLET / TRANSACTION LOG</span>{isBusy && <span className="sub-tx-pending"><LoaderCircle className="sub-spin" />{busy.replace('-', ' ').toUpperCase()}</span>}</div>
      {error && <div className="sub-alert is-error" role="alert" data-testid="status-transaction-error"><CircleAlert />{error}</div>}
      {notice && <div className="sub-tx-notice" role="status" data-testid="status-transaction-notice"><Check />{notice}</div>}
      {verificationMessage && <div className={`sub-verification ${verification}`} role={verification === 'failed' ? 'alert' : 'status'} data-testid="status-verification"><span className="sub-verification-dot" /><div><strong>VERIFIER / {verification.toUpperCase()}</strong><p>{verificationMessage}</p></div>
        {(verification === 'unavailable' || verification === 'pending' || verification === 'failed') && transactionHash && <button type="button" onClick={() => void retryVerification()} disabled={isBusy} data-testid="button-retry-verification"><RefreshCw /> RETRY</button>}
      </div>}
      {transactionHash && <div className="sub-tx-hash"><span>LAST TRANSACTION</span><a href={`https://testnet.bscscan.com/tx/${transactionHash}`} target="_blank" rel="noreferrer" data-testid="link-testnet-transaction">{shortAddress(transactionHash)} <ArrowUpRight /></a><span className="sub-hash-note">BSC TESTNET EXPLORER</span></div>}
    </section>}

    <footer className="sub-footnote"><span>NEXUS PROTOCOL / SUBSCRIPTIONS</span><span>NON-CUSTODIAL · BSC TESTNET ONLY · CHAIN 97</span></footer>
  </div>;
}
