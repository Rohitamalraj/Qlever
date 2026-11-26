"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { qoreTestnet, EVM_RPC } from "@/lib/qlever";

export { qoreTestnet };

export const wagmiConfig = getDefaultConfig({
  appName: "Qlever",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "qlever-demo",
  chains: [qoreTestnet],
  transports: { [qoreTestnet.id]: http(EVM_RPC) },
  ssr: true,
});
