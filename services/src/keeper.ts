// Keeper: decrypts position envelopes off-chain and liquidates when the real price crosses the sealed threshold.
// env: KEEPER_KEY (EVM tx key), KEEPER_MNEMONIC (QoreSeal keys), VAULT_ADDRESS, FEED_ADDRESS,
//      FROM_BLOCK (default: latest-5000), POLL_MS (default 10000)
import type { Hex } from "viem";
import { deriveSealKeys } from "@qorechain/qoreseal";
import { env, addr, clients } from "./config.ts";
import { feedAbi, tierAbi, vaultAbi } from "./abi.ts";
import { symbolOf } from "./assets.ts";
import { openPosition, toReveal, type PositionFields } from "./position.ts";

interface Tracked { id: bigint; trader: Hex; fields: PositionFields }

/** Mirrors QleverVault._crossed. */
export const crossed = (isLong: boolean, liqPrice: bigint, price: bigint) => (isLong ? price <= liqPrice : price >= liqPrice);

async function main() {
  const keys = deriveSealKeys({ mnemonic: env("KEEPER_MNEMONIC") });
  const vault = addr("VAULT_ADDRESS");
  const feed = addr("FEED_ADDRESS");
  const { pub, wallet } = clients(env("KEEPER_KEY") as Hex);
  const tiers = (await pub.readContract({ address: vault, abi: vaultAbi, functionName: "tiers" })) as Hex;
  const poll = Number(process.env.POLL_MS ?? 10000);
  const tracked = new Map<bigint, Tracked>();
  let cursor = process.env.FROM_BLOCK ? BigInt(process.env.FROM_BLOCK) : (await pub.getBlockNumber()) - 5000n;

  for (;;) {
    try {
      // 1. ingest new positions; decrypt only those we are a recipient of
      const head = await pub.getBlockNumber();
      if (head >= cursor) {
        // the public RPC caps eth_getLogs at 10,000 blocks: catch up in chunks
        const to = cursor + 8_999n < head ? cursor + 8_999n : head;
        const logs = await pub.getContractEvents({ address: vault, abi: vaultAbi, eventName: "PositionOpened", fromBlock: cursor, toBlock: to });
        for (const l of logs) {
          const { id, trader, commitment, envelope } = l.args as { id: bigint; trader: Hex; commitment: Hex; envelope: Hex };
          if (tracked.has(id)) continue;
          try {
            tracked.set(id, { id, trader, fields: openPosition(envelope, commitment, keys) });
            console.log(`tracking position #${id}`);
          } catch (e) {
            console.warn(`position #${id}: cannot decrypt/verify (${(e as Error).message})`);
          }
        }
        cursor = to + 1n;
      }

      // 2. evaluate against the live on-chain price
      const prices = new Map<string, bigint>();
      for (const t of [...tracked.values()]) {
        if (!prices.has(t.fields.asset)) {
          try {
            const [p] = (await pub.readContract({ address: feed, abi: feedAbi, functionName: "latestPrice", args: [t.fields.asset] })) as [bigint, bigint];
            prices.set(t.fields.asset, p);
          } catch { continue; } // stale or missing price for this asset: never act on it
        }
        const price = prices.get(t.fields.asset)!;
        const [, , , , open] = (await pub.readContract({ address: vault, abi: vaultAbi, functionName: "positions", args: [t.id] })) as [Hex, bigint, Hex, bigint, boolean];
        if (!open) { tracked.delete(t.id); continue; }
        const cap = (await pub.readContract({ address: tiers, abi: tierAbi, functionName: "maxLeverage", args: [t.trader] })) as number;
        if (!crossed(t.fields.isLong, t.fields.liqPrice, price) && t.fields.leverage <= cap) continue;
        const { asset } = t.fields;
        const hash = await wallet.writeContract({ address: vault, abi: vaultAbi, functionName: "liquidate", args: [t.id, toReveal(t.fields)] });
        console.log(`liquidating #${t.id} ${symbolOf(asset)} @ ${Number(price) / 1e8}: ${hash}`);
        tracked.delete(t.id);
      }
    } catch (e) {
      console.error("keeper error:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, poll));
  }
}

if (process.argv[1]?.endsWith("keeper.ts")) main();
