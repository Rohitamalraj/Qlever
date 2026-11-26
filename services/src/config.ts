import { defineChain, createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const qoreTestnet = defineChain({
  id: 9800,
  name: "QoreChain Diana",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [process.env.EVM_RPC ?? "https://evm-testnet.qore.host"] } },
});

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export const addr = (name: string) => env(name) as Hex;

export function clients(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  const transport = http(qoreTestnet.rpcUrls.default.http[0]);
  return {
    account,
    pub: createPublicClient({ chain: qoreTestnet, transport }),
    wallet: createWalletClient({ account, chain: qoreTestnet, transport }),
  };
}
