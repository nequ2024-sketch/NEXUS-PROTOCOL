import { useEffect, useMemo, useState } from 'react';
import { BrowserProvider, Contract, formatUnits, getAddress, parseUnits } from 'ethers';
import { ArrowUpRight, Blocks, Check, CircleAlert, Coins, RefreshCw, Wallet } from 'lucide-react';
import { TESTNET_CHAIN_ID } from '@/lib/contracts';
import { useTestnetDeployment } from '@/lib/testnet-deployment';

type WalletProps = {
  address: string | null;
  chainId: number | null;
  connect: () => Promise<void>;
};

const PRESALE_ABI = [
  'function nexus() view returns (address)',
  'function paymentToken() view returns (address)',
  'function rate() view returns (uint256)',
  'function hardCap() view returns (uint256)',
  'function minPurchase() view returns (uint256)',
  'function startTime() view returns (uint256)',
  'function endTime() view returns (uint256)',
  'function contributions(address) view returns (uint256)',
  'function purchasedTokens(address) view returns (uint256)',
  'function buy(uint256)',
];

const TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
];

const MOCK_TOKEN_ABI = [...TOKEN_ABI, 'function mint(address,uint256)'];

type SaleSnapshot = {
  paymentSymbol: string;
  rateRaw: bigint;
  hardCapRaw: bigint;
  minPurchaseRaw: bigint;
  startTime: number;
  endTime: number;
  chainTime: number;
  contributionRaw: bigint;
  purchasedRaw: bigint;
  inventoryRaw: bigint;
  paymentBalanceRaw: bigint;
  paymentAllowanceRaw: bigint;
  nexusBalanceRaw: bigint;
};

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'The wallet transaction could not be completed.';
  if (/user rejected|user denied|ACTION_REJECTED/i.test(message)) return 'Transaction rejected in your wallet.';
  if (/insufficient funds/i.test(message)) return 'This wallet needs test BNB for BSC Testnet gas.';
  return message.slice(0, 260);
}

function displayAmount(amount: bigint) {
  return Number(formatUnits(amount, 18)).toLocaleString('en-US', {
    maximumFractionDigits: 4,
  });
}

export function PresalePage({ wallet }: { wallet: WalletProps }) {
  const { deployment, loading: deploymentLoading, error: deploymentError, reload: reloadDeployment } = useTestnetDeployment();
  const [snapshot, setSnapshot] = useState<SaleSnapshot | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function readSale() {
      if (!deployment || !wallet.address) {
        setSnapshot(null);
        return;
      }
      if (!window.ethereum) {
        setError('Connect a browser wallet to read the BSC Testnet sale.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const provider = new BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        if (network.chainId !== BigInt(TESTNET_CHAIN_ID)) {
          throw new Error('Switch your wallet to BNB Smart Chain Testnet (chain ID 97).');
        }
        const contractAddresses = [deployment.nexusToken, deployment.presale, deployment.paymentToken];
        const code = await Promise.all(contractAddresses.map((address) => provider.getCode(address)));
        if (code.some((bytecode) => bytecode === '0x')) {
          throw new Error('The deployment record points to an address without contract code on BSC Testnet.');
        }

        const sale = new Contract(deployment.presale, PRESALE_ABI, provider);
        const paymentToken = new Contract(
          deployment.paymentToken,
          deployment.paymentTokenIsMock ? MOCK_TOKEN_ABI : TOKEN_ABI,
          provider,
        );
        const nexusToken = new Contract(deployment.nexusToken, TOKEN_ABI, provider);
        const [
          saleNexus,
          salePayment,
          rateRaw,
          hardCapRaw,
          minPurchaseRaw,
          startTime,
          endTime,
          contributionRaw,
          purchasedRaw,
          inventoryRaw,
          paymentDecimals,
          paymentBalanceRaw,
          paymentAllowanceRaw,
          nexusBalanceRaw,
          latestBlock,
        ] = await Promise.all([
          sale.nexus() as Promise<string>,
          sale.paymentToken() as Promise<string>,
          sale.rate() as Promise<bigint>,
          sale.hardCap() as Promise<bigint>,
          sale.minPurchase() as Promise<bigint>,
          sale.startTime() as Promise<bigint>,
          sale.endTime() as Promise<bigint>,
          sale.contributions(wallet.address) as Promise<bigint>,
          sale.purchasedTokens(wallet.address) as Promise<bigint>,
          nexusToken.balanceOf(deployment.presale) as Promise<bigint>,
          paymentToken.decimals() as Promise<bigint>,
          paymentToken.balanceOf(wallet.address) as Promise<bigint>,
          paymentToken.allowance(wallet.address, deployment.presale) as Promise<bigint>,
          nexusToken.balanceOf(wallet.address) as Promise<bigint>,
          provider.getBlock('latest'),
        ]);
        if (
          getAddress(saleNexus) !== getAddress(deployment.nexusToken) ||
          getAddress(salePayment) !== getAddress(deployment.paymentToken)
        ) {
          throw new Error('The sale contract token addresses do not match the public deployment record.');
        }
        if (paymentDecimals !== 18n) {
          throw new Error('This sale contract requires an 18-decimal payment token.');
        }
        if (!active) return;
        setSnapshot({
          paymentSymbol: await paymentToken.symbol() as string,
          rateRaw,
          hardCapRaw,
          minPurchaseRaw,
          startTime: Number(startTime),
          endTime: Number(endTime),
          chainTime: latestBlock?.timestamp ?? Math.floor(Date.now() / 1000),
          contributionRaw,
          purchasedRaw,
          inventoryRaw,
          paymentBalanceRaw,
          paymentAllowanceRaw,
          nexusBalanceRaw,
        });
      } catch (cause: unknown) {
        if (active) {
          setSnapshot(null);
          setError(errorMessage(cause));
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void readSale();
    return () => {
      active = false;
    };
  }, [deployment, wallet.address, wallet.chainId, refreshKey]);

  const enteredRaw = useMemo(() => {
    if (!amount.trim()) return 0n;
    try {
      return parseUnits(amount, 18);
    } catch {
      return 0n;
    }
  }, [amount]);
  const estimatedNexusRaw = snapshot ? (enteredRaw * snapshot.rateRaw) / 10n ** 18n : 0n;
  const saleActive = Boolean(snapshot && snapshot.chainTime >= snapshot.startTime && snapshot.chainTime < snapshot.endTime);
  const amountValid = Boolean(snapshot && enteredRaw >= snapshot.minPurchaseRaw && enteredRaw > 0n);
  const hasBalance = Boolean(snapshot && enteredRaw <= snapshot.paymentBalanceRaw);
  const hasAllowance = Boolean(snapshot && enteredRaw <= snapshot.paymentAllowanceRaw);
  const remainingTime = snapshot
    ? snapshot.chainTime < snapshot.startTime ? 'Sale has not started' : snapshot.chainTime >= snapshot.endTime ? 'Sale ended' : 'Sale is open'
    : 'Unavailable';

  async function getSigner() {
    if (!window.ethereum) throw new Error('No compatible wallet was found in this browser.');
    if (!wallet.address) throw new Error('Connect your wallet first.');
    const provider = new BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (network.chainId !== BigInt(TESTNET_CHAIN_ID)) {
      throw new Error('Switch your wallet to BNB Smart Chain Testnet (chain ID 97).');
    }
    return provider.getSigner(wallet.address);
  }

  async function mintTestPayment() {
    if (!deployment?.paymentTokenIsMock) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const signer = await getSigner();
      const token = new Contract(deployment.paymentToken, MOCK_TOKEN_ABI, signer);
      const tx = await token.mint(wallet.address, parseUnits('100', 18));
      setNotice('Confirm the mUSDT test-token mint in your wallet.');
      await tx.wait();
      setTransactionHash(tx.hash);
      setNotice('100 mUSDT test tokens were minted. They have no real-world value.');
      setRefreshKey((key) => key + 1);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function approvePayment() {
    if (!deployment || !amountValid || !hasBalance) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const signer = await getSigner();
      const token = new Contract(deployment.paymentToken, TOKEN_ABI, signer);
      setNotice('Review and approve the exact mUSDT allowance in your wallet.');
      const tx = await token.approve(deployment.presale, enteredRaw);
      await tx.wait();
      setNotice('Payment approved for this purchase amount.');
      setTransactionHash(tx.hash);
      setRefreshKey((key) => key + 1);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function buyNexus() {
    if (!deployment || !snapshot || !saleActive || !amountValid || !hasBalance || !hasAllowance) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const signer = await getSigner();
      const sale = new Contract(deployment.presale, PRESALE_ABI, signer);
      setNotice('Review and confirm the NEXUS purchase in your wallet.');
      const tx = await sale.buy(enteredRaw);
      await tx.wait();
      setTransactionHash(tx.hash);
      setNotice('NEXUS purchase confirmed on BSC Testnet.');
      setRefreshKey((key) => key + 1);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return <div className="presale-page">
    <div className="page-head">
      <div><div className="eyebrow">Capital formation / 02</div><h1>NEXUS presale</h1><p className="page-desc">Test-only purchase flow. Your wallet signs each transaction; this interface never receives or stores a private key.</p></div>
      <span className="tag gold">BSC TESTNET · CHAIN 97</span>
    </div>
    <div className="presale-safety-banner"><CircleAlert aria-hidden="true" /><span><strong>Testnet only.</strong> mUSDT and NEXUS on BSC Testnet have no real-world value. Contract deployment and independent review are still pending; never use a mainnet wallet for this preview.</span></div>

    {deploymentLoading && <div className="callout" role="status"><RefreshCw className="presale-spin" /> Checking for the public BSC Testnet deployment record…</div>}
    {deploymentError && <div className="callout warn" role="status"><CircleAlert />{deploymentError}</div>}
    {!deploymentLoading && !deployment && !deploymentError && <section className="panel presale-empty">
      <div className="panel-head"><div className="panel-title">Presale deployment</div><span className="tag">NOT DEPLOYED</span></div>
      <div className="empty-state"><div className="empty-icon"><Blocks /></div><strong>Contracts have not been deployed to BSC Testnet</strong><p>The purchase controls stay disabled until a deployment record exists and the contract code and token addresses are verified on chain. No transaction is simulated.</p><button className="btn-outline" onClick={reloadDeployment}><RefreshCw /> CHECK AGAIN</button></div>
    </section>}

    {deployment && <div className="presale-layout">
      <section className="panel">
        <div className="panel-head"><div className="panel-title">Presale contract</div><span className={`tag ${saleActive ? 'green' : ''}`}>{loading ? 'READING CHAIN' : remainingTime.toUpperCase()}</span></div>
        <div className="presale-facts">
          <div className="stat-row"><span>PAYMENT TOKEN</span><span>{deployment.paymentTokenSymbol} {deployment.paymentTokenIsMock ? '· TEST TOKEN' : ''}</span></div>
          <div className="stat-row"><span>EXCHANGE RATE</span><span>{snapshot ? `${displayAmount(snapshot.rateRaw)} NEXUS / ${snapshot.paymentSymbol}` : '—'}</span></div>
          <div className="stat-row"><span>MINIMUM PURCHASE</span><span>{snapshot ? `${displayAmount(snapshot.minPurchaseRaw)} ${snapshot.paymentSymbol}` : '—'}</span></div>
          <div className="stat-row"><span>PER-WALLET CAP</span><span>{snapshot ? `${displayAmount(snapshot.hardCapRaw)} NEXUS` : '—'}</span></div>
          <div className="stat-row"><span>SALE INVENTORY REMAINING</span><span>{snapshot ? `${displayAmount(snapshot.inventoryRaw)} NEXUS` : '—'}</span></div>
          <div className="stat-row"><span>SALE WINDOW</span><span>{snapshot ? `${new Date(snapshot.startTime * 1000).toLocaleString()} – ${new Date(snapshot.endTime * 1000).toLocaleString()}` : '—'}</span></div>
        </div>
        <div className="presale-contract-links">
          <a href={`https://testnet.bscscan.com/address/${deployment.presale}`} target="_blank" rel="noreferrer">Presale contract <ArrowUpRight aria-hidden="true" /></a>
          <a href={`https://testnet.bscscan.com/address/${deployment.paymentToken}`} target="_blank" rel="noreferrer">Payment token <ArrowUpRight aria-hidden="true" /></a>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div className="panel-title">Your wallet position</div><span className="tag">WALLET-SIGNED</span></div>
        {!wallet.address ? <div className="empty-state"><div className="empty-icon"><Wallet /></div><strong>Connect a wallet to continue</strong><p>Use a browser wallet connected to BNB Smart Chain Testnet. We never request a seed phrase.</p><button className="btn-outline" onClick={() => void wallet.connect()}><Wallet /> CONNECT WALLET</button></div> : <>
          {wallet.chainId !== TESTNET_CHAIN_ID && <div className="callout warn" role="status"><CircleAlert /> Your wallet is on chain {wallet.chainId ?? 'unknown'}; switch it to BSC Testnet (97) before reading or signing.</div>}
          <div className="presale-facts">
            <div className="stat-row"><span>CONNECTED WALLET</span><span className="presale-address">{wallet.address}</span></div>
            <div className="stat-row"><span>PAYMENT BALANCE</span><span>{snapshot ? `${displayAmount(snapshot.paymentBalanceRaw)} ${snapshot.paymentSymbol}` : '—'}</span></div>
            <div className="stat-row"><span>NEXUS BALANCE</span><span>{snapshot ? `${displayAmount(snapshot.nexusBalanceRaw)} NEXUS` : '—'}</span></div>
            <div className="stat-row"><span>YOUR CONTRIBUTION</span><span>{snapshot ? `${displayAmount(snapshot.contributionRaw)} ${snapshot.paymentSymbol}` : '—'}</span></div>
            <div className="stat-row"><span>YOUR NEXUS PURCHASES</span><span>{snapshot ? `${displayAmount(snapshot.purchasedRaw)} NEXUS` : '—'}</span></div>
          </div>
          {deployment.paymentTokenIsMock && <button className="btn-outline presale-faucet" onClick={() => void mintTestPayment()} disabled={busy || wallet.chainId !== TESTNET_CHAIN_ID}><Coins /> MINT 100 TEST mUSDT</button>}
          <div className="presale-buy-box">
            <label htmlFor="presale-amount">PAYMENT AMOUNT · {deployment.paymentTokenSymbol}</label>
            <input id="presale-amount" inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={snapshot ? `Minimum ${displayAmount(snapshot.minPurchaseRaw)}` : 'Connect to read minimum'} />
            <div className="presale-estimate"><span>ESTIMATED NEXUS</span><strong>{snapshot ? `${displayAmount(estimatedNexusRaw)} NEXUS` : '—'}</strong></div>
            <div className="presale-action-row">
              {!hasAllowance
                ? <button className="btn-outline" onClick={() => void approvePayment()} disabled={busy || loading || !snapshot || wallet.chainId !== TESTNET_CHAIN_ID || !saleActive || !amountValid || !hasBalance}>APPROVE EXACT AMOUNT</button>
                : <button className="btn-outline presale-buy-button" onClick={() => void buyNexus()} disabled={busy || loading || !snapshot || wallet.chainId !== TESTNET_CHAIN_ID || !saleActive || !amountValid || !hasBalance}>BUY NEXUS</button>}
              <button className="presale-refresh" aria-label="Refresh wallet and sale data" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading || busy}><RefreshCw /></button>
            </div>
            {snapshot && !hasBalance && amountValid && <p className="presale-inline-warn">Your {snapshot.paymentSymbol} balance is below this amount.</p>}
            {snapshot && amount && !amountValid && <p className="presale-inline-warn">Enter at least {displayAmount(snapshot.minPurchaseRaw)} {snapshot.paymentSymbol}.</p>}
            {!saleActive && snapshot && <p className="presale-inline-warn">{remainingTime}; the contract will reject a purchase outside the sale window.</p>}
          </div>
        </>}
        {loading && <div className="presale-inline-note" role="status">Reading verified contract relationships and wallet balances…</div>}
        {error && <div className="callout warn presale-message" role="alert"><CircleAlert />{error}</div>}
        {notice && <div className="callout presale-message" role="status"><Check />{notice}</div>}
        {transactionHash && <a className="presale-tx-link" href={`https://testnet.bscscan.com/tx/${transactionHash}`} target="_blank" rel="noreferrer">View latest Testnet transaction <ArrowUpRight aria-hidden="true" /></a>}
      </section>
    </div>}

    <div className="presale-disclosure"><strong>Before any real-money sale:</strong> contract verification, independent security review, realistic functional testing, and qualified legal/KYC/AML review remain required. This page has no Mainnet path.</div>
  </div>;
}
