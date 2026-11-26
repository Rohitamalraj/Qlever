"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { deriveSealKeys } from "@qorechain/qoreseal";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { AppNav } from "@/components/app/app-nav";
import { useAssetQuotes } from "@/hooks/use-asset-quotes";
import { useChainState, useKeeperPositions } from "@/hooks/use-qlever";
import { CONTRACTS, fromE8 } from "@/lib/qlever";
import { symbolOf } from "@/lib/assets";

export default function KeeperPage() {
  const { address } = useAccount();
  const prices = useAssetQuotes();
  const { oracles, pool } = useChainState();
  const [mnemonic, setMnemonic] = useState("");
  const [keys, setKeys] = useState<ReturnType<typeof deriveSealKeys> | null>(null);
  const keeper = useKeeperPositions(keys, oracles);

  const isKeeperWallet = !!address && !!CONTRACTS.keeper && address.toLowerCase() === CONTRACTS.keeper.toLowerCase();
  const rows = useMemo(() => keeper.positions.filter((p) => p.open), [keeper.positions]);

  const unlock = () => {
    try {
      // derived and held in browser memory only; never sent anywhere
      setKeys(deriveSealKeys({ mnemonic: mnemonic.trim() }));
      setMnemonic("");
    } catch (e) {
      toast.error((e as Error).message.slice(0, 120));
    }
  };

  return (
    <div className="min-h-screen bg-background pt-16">
      <AppNav />
      <div className="max-w-[1200px] mx-auto p-6 space-y-6">
        <div>
          <h1 className="font-display text-3xl">Keeper dashboard</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Decrypts the envelopes addressed to the Keeper in this browser, watches the on-chain oracle, and liquidates with a hash-verified reveal.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10">
          {[
            ["Markets with a fresh oracle price", `${Object.values(oracles).filter(Boolean).length} / ${Object.keys(oracles).length}`],
            ["Live quotes (CoinGecko)", prices.sAAPL.price ? "online" : "—"],
            ["Open positions", pool ? pool.openCount.toString() : "—"],
            ["Wallet role", isKeeperWallet ? "Keeper ✓" : address ? "Not the Keeper wallet" : "Not connected"],
          ].map(([k, v]) => (
            <div key={k} className="bg-background p-4">
              <div className="font-mono text-[10px] text-muted-foreground">{k}</div>
              <div className="font-mono text-sm mt-1">{v}</div>
            </div>
          ))}
        </div>

        {!keys ? (
          <div className="border border-foreground/10 p-4 space-y-3 max-w-xl">
            <div className="font-mono text-xs">Unlock Keeper keys</div>
            <p className="font-mono text-[10px] text-muted-foreground">
              Enter the Keeper&apos;s recovery phrase. It derives the ML-KEM-1024 key registered for the Keeper and stays in this tab&apos;s memory.
            </p>
            <input
              type="password"
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              placeholder="recovery phrase"
              autoComplete="off"
              className="w-full font-mono text-xs bg-transparent border border-foreground/10 px-3 py-2 outline-none focus:border-foreground/40"
            />
            <button onClick={unlock} disabled={!mnemonic.trim()} className="px-4 py-2 bg-foreground text-background font-mono text-xs disabled:opacity-50">
              Decrypt positions
            </button>
          </div>
        ) : (
          <div className="border border-foreground/10">
            <div className="grid grid-cols-[0.5fr_0.9fr_0.8fr_0.7fr_0.6fr_1fr_1fr_1.6fr] gap-2 px-4 py-2 font-mono text-[10px] text-muted-foreground border-b border-foreground/10">
              <div>ID</div><div>TRADER</div><div>ASSET</div><div className="text-right">SIDE</div><div className="text-right">LEV</div>
              <div className="text-right">LIQ. PRICE</div><div className="text-right">COLLATERAL</div><div className="text-right">ACTION</div>
            </div>
            {rows.length === 0 && <div className="p-8 text-center font-mono text-xs text-muted-foreground">No open positions addressed to this Keeper.</div>}
            {rows.map((p) => {
              const hit = keeper.liquidatable(p);
              return (
                <div key={p.id.toString()} className={`grid grid-cols-[0.5fr_0.9fr_0.8fr_0.7fr_0.6fr_1fr_1fr_1.6fr] gap-2 px-4 py-3 border-b border-foreground/10 items-center font-mono text-xs ${hit ? "bg-red-600/5" : ""}`}>
                  <div>#{p.id.toString()}</div>
                  <div className="truncate" title={p.trader}>{p.trader.slice(0, 6)}…{p.trader.slice(-4)}</div>
                  {p.fields ? (
                    <>
                      <div>{symbolOf(p.fields.asset).slice(1)}</div>
                      <div className={`text-right ${p.fields.isLong ? "text-green-700" : "text-red-600"}`}>{p.fields.isLong ? "LONG" : "SHORT"}</div>
                      <div className="text-right">{p.fields.leverage}x</div>
                      <div className="text-right text-red-600">${fromE8(p.fields.liqPrice).toLocaleString()}</div>
                    </>
                  ) : (
                    <div className="col-span-4 text-right text-muted-foreground flex items-center justify-end gap-1"><ShieldAlert className="w-3 h-3" />not decryptable</div>
                  )}
                  <div className="text-right">{Number(formatEther(p.collateral)).toLocaleString(undefined, { maximumFractionDigits: 4 })} QOR</div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => keeper.attemptFabricated(p)}
                      disabled={!isKeeperWallet}
                      title="Submit made-up numbers; the vault rejects them because the hash does not match"
                      className="px-2 py-1 text-[10px] border border-foreground/20 hover:bg-foreground/5 disabled:opacity-50"
                    >
                      Try fake
                    </button>
                    <button
                      onClick={() => keeper.liquidate(p)}
                      disabled={!isKeeperWallet || !hit || keeper.busy !== null}
                      className="px-3 py-1 text-[10px] bg-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {keeper.busy === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : hit ? "Liquidate" : "Healthy"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
