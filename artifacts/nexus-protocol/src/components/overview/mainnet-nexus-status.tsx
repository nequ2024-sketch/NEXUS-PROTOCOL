import { useEffect, useState } from 'react';
import { Contract, formatUnits, isAddress, JsonRpcProvider } from 'ethers';
import { ArrowUpRight, RefreshCw } from 'lucide-react';

const MAINNET_CHAIN_ID = 56n;
const MAINNET_TOKEN_ADDRESS = '0xDcc63967f27B67c7e6bcfc3bA0c23Ba5f69d6705';
const MAINNET_RPC_URL = 'https://bsc-dataseed.binance.org/';
const MAINNET_TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function MAX_SUPPLY() view returns (uint256)',
  'function presaleTokensSold() view returns (uint256)',
  'function presaleActive() view returns (bool)',
];

const mainnetProvider = new JsonRpcProvider(MAINNET_RPC_URL, 56);
const mainnetToken = new Contract(MAINNET_TOKEN_ADDRESS, MAINNET_TOKEN_ABI, mainnetProvider);

type MainnetTokenSnapshot = {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  maxSupply: bigint;
  presaleTokensSold: bigint;
  presaleActive: boolean;
  walletBalance: bigint | null;
};

function formatTokenAmount(amount: bigint, decimals: number) {
  return Number(formatUnits(amount, decimals)).toLocaleString('en-US', {
    maximumFractionDigits: 4,
  });
}

export function MainnetNexusStatus({ walletAddress }: { walletAddress: string | null }) {
  const [snapshot, setSnapshot] = useState<MainnetTokenSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    let running = false;

    async function readMainnetToken() {
      if (running) return;
      running = true;
      setError(null);
      try {
        const network = await mainnetProvider.getNetwork();
        if (network.chainId !== MAINNET_CHAIN_ID) {
          throw new Error('The configured RPC is not connected to BSC Mainnet.');
        }

        const code = await mainnetProvider.getCode(MAINNET_TOKEN_ADDRESS);
        if (code === '0x') {
          throw new Error('No contract code exists at the configured NEXUS address.');
        }

        if (walletAddress && !isAddress(walletAddress)) {
          throw new Error('The connected wallet address is invalid.');
        }
        const walletBalanceQuery = walletAddress
          ? mainnetToken.balanceOf(walletAddress) as Promise<bigint>
          : Promise.resolve(null);
        const [
          name,
          symbol,
          decimals,
          totalSupply,
          maxSupply,
          presaleTokensSold,
          presaleActive,
          walletBalance,
        ] =
          await Promise.all([
            mainnetToken.name() as Promise<string>,
            mainnetToken.symbol() as Promise<string>,
            mainnetToken.decimals() as Promise<bigint>,
            mainnetToken.totalSupply() as Promise<bigint>,
            mainnetToken.MAX_SUPPLY() as Promise<bigint>,
            mainnetToken.presaleTokensSold() as Promise<bigint>,
            mainnetToken.presaleActive() as Promise<boolean>,
            walletBalanceQuery,
          ]);

        if (name !== 'Nexus Protocol' || symbol !== 'NEXUS' || decimals !== 18n) {
          throw new Error('The on-chain token metadata does not match the verified NEXUS token.');
        }
        if (active) {
          setSnapshot({
            name,
            symbol,
            decimals: Number(decimals),
            totalSupply,
            maxSupply,
            presaleTokensSold,
            presaleActive,
            walletBalance,
          });
        }
      } catch {
        if (active) {
          setSnapshot(null);
          setError('Could not read the verified NEXUS contract on BSC Mainnet.');
        }
      } finally {
        if (active) setLoading(false);
        running = false;
      }
    }

    setSnapshot(null);
    setLoading(true);
    void readMainnetToken();
    const refreshTimer = window.setInterval(() => void readMainnetToken(), 60_000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [refreshKey, walletAddress]);

  return (
    <article className="home-live-item" aria-live="polite" aria-busy={loading}>
      <span className="home-index">02 / TOKEN · BSC MAINNET</span>
      <strong>NEXUS on-chain status</strong>
      <b className={`home-state ${error || loading ? 'pending' : ''}`}>
        {loading ? 'READING BSC MAINNET' : error ? 'READ UNAVAILABLE' : 'SOURCE VERIFIED · READ ONLY'}
      </b>
      {error ? (
        <p role="status">{error}</p>
      ) : snapshot ? (
        <>
          <div className="home-token-live-data">
            <div><span>TOTAL SUPPLY</span><strong>{formatTokenAmount(snapshot.totalSupply, snapshot.decimals)} {snapshot.symbol}</strong></div>
            <div><span>MAX SUPPLY</span><strong>{formatTokenAmount(snapshot.maxSupply, snapshot.decimals)} {snapshot.symbol}</strong></div>
            <div><span>PRESALE SOLD</span><strong>{formatTokenAmount(snapshot.presaleTokensSold, snapshot.decimals)} {snapshot.symbol}</strong></div>
            <div><span>CONTRACT SALE FLAG</span><strong>{snapshot.presaleActive ? 'ACTIVE' : 'INACTIVE'}</strong></div>
            {walletAddress && snapshot.walletBalance !== null && (
              <div><span>CONNECTED WALLET BALANCE</span><strong>{formatTokenAmount(snapshot.walletBalance, snapshot.decimals)} {snapshot.symbol}</strong></div>
            )}
          </div>
          <p>Live read-only calls, including the connected wallet balance. This interface does not submit BNB or other Mainnet transactions.</p>
        </>
      ) : (
        <p>Reading the deployed token’s live state from BSC Mainnet.</p>
      )}
      <div className="home-token-controls">
        <a href={`https://bscscan.com/address/${MAINNET_TOKEN_ADDRESS}#code`} target="_blank" rel="noreferrer">
          VERIFIED CONTRACT <ArrowUpRight aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={() => setRefreshKey((key) => key + 1)}
          aria-label="Refresh NEXUS Mainnet contract status"
          disabled={loading}
        >
          <RefreshCw aria-hidden="true" /> REFRESH
        </button>
      </div>
    </article>
  );
}
