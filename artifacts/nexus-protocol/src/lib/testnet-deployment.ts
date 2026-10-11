import { useEffect, useState } from 'react';

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export type TestnetDeployment = {
  network: 'bscTestnet';
  chainId: 97;
  deployedAt: string;
  nexusToken: string;
  presale: string;
  paymentToken: string;
  paymentTokenSymbol: string;
  paymentTokenDecimals: 18;
  paymentTokenIsMock: boolean;
  mockPaymentToken: string | null;
  signalRegistry: string;
  subscriptionManager: string;
  presaleSettings: {
    rate: string;
    hardCap: string;
    minPurchase: string;
    start: string;
    duration: string;
  };
};

function parseDeployment(value: unknown): TestnetDeployment {
  if (!value || typeof value !== 'object') {
    throw new Error('The BSC Testnet deployment record is invalid.');
  }
  const record = value as Record<string, unknown>;
  const settings = record.presaleSettings as Record<string, unknown> | undefined;
  const addresses = [
    record.nexusToken,
    record.presale,
    record.paymentToken,
    record.signalRegistry,
    record.subscriptionManager,
  ];
  if (
    record.network !== 'bscTestnet' ||
    record.chainId !== 97 ||
    addresses.some((address) => typeof address !== 'string' || !ADDRESS_PATTERN.test(address)) ||
    typeof record.paymentTokenSymbol !== 'string' ||
    record.paymentTokenDecimals !== 18 ||
    typeof record.paymentTokenIsMock !== 'boolean' ||
    !settings ||
    ['rate', 'hardCap', 'minPurchase', 'start', 'duration'].some(
      (key) => typeof settings[key] !== 'string',
    )
  ) {
    throw new Error('The BSC Testnet deployment record is incomplete or for an unsupported network.');
  }
  if (
    record.mockPaymentToken !== null &&
    (typeof record.mockPaymentToken !== 'string' || !ADDRESS_PATTERN.test(record.mockPaymentToken))
  ) {
    throw new Error('The mock payment-token address is invalid.');
  }
  if (record.paymentTokenIsMock && record.mockPaymentToken !== record.paymentToken) {
    throw new Error('The mock payment-token address does not match the configured payment token.');
  }
  return value as TestnetDeployment;
}

export async function loadTestnetDeployment(signal?: AbortSignal): Promise<TestnetDeployment | null> {
  const response = await fetch(`${import.meta.env.BASE_URL}deployments/bsc-testnet.json`, {
    cache: 'no-store',
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not load the public Testnet deployment record (HTTP ${response.status}).`);
  }
  if (!response.headers.get('content-type')?.includes('application/json')) return null;
  return parseDeployment(await response.json());
}

export function useTestnetDeployment() {
  const [deployment, setDeployment] = useState<TestnetDeployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadTestnetDeployment(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDeployment(result);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setDeployment(null);
        setError(cause instanceof Error ? cause.message : 'Could not read the deployment record.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  return {
    deployment,
    loading,
    error,
    reload: () => setReloadKey((key) => key + 1),
  };
}
