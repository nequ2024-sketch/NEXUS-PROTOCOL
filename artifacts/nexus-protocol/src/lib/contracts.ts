export type ContractName = 'token' | 'presale' | 'subscriptions' | 'signals';

export type ContractConfig = {
  address: `0x${string}` | null;
  abi: readonly unknown[];
};

export const TESTNET_CHAIN_ID = 97;
export const TESTNET_LABEL = 'BNB Smart Chain Testnet';

// Addresses intentionally remain unset until verified deployment metadata exists.
export const CONTRACTS: Record<ContractName, ContractConfig> = {
  token: { address: null, abi: [] },
  presale: { address: null, abi: [] },
  subscriptions: { address: null, abi: [] },
  signals: { address: null, abi: [] },
};

export function contractsAvailable(): boolean {
  return Object.values(CONTRACTS).some((contract) => contract.address !== null);
}
