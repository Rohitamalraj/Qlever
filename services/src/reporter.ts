// Price reporter: pulls REAL spot prices, signs them with the reporter key, and relays to PriceFeedAdapter.
// env: REPORTER_KEY, FEED_ADDRESS, optional RELAYER_KEY (tx sender; defaults to REPORTER_KEY),
//      FINNHUB_API_KEY, INTERVAL_MS (default 60000)
import { env, addr, clients } from "./config.ts";
import { feedAbi } from "./abi.ts";
import { ASSETS, assetId } from "./assets.ts";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface Quote { symbol: string; price: bigint; updatedAt: number }

/** Real US-equity quotes from Finnhub (the same source the app uses), scaled to 8 decimals. Outside market hours this is the last close. */
export async function fetchQuotes(): Promise<Quote[]> {
  const key = env("FINNHUB_API_KEY");
  // Finnhub's free endpoint intermittently hangs or 520s: short timeouts, several retries, 3 requests in flight
  const one = async (symbol: string): Promise<Quote | null> => {
    let last = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`, { signal: AbortSignal.timeout(4000) });
        if (!r.ok) throw new Error(`finnhub ${r.status}`);
        const q = (await r.json()) as { c?: number; t?: number };
        if (typeof q.c !== "number" || !(q.c > 0)) throw new Error("no price");
        return { symbol, price: toE8(String(q.c)), updatedAt: q.t ?? 0 };
      } catch (e) {
        last = (e as Error).message;
        await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
      }
    }
    console.warn(`skipping ${symbol}: ${last}`); // never post a guessed price
    return null;
  };
  const out: Quote[] = [];
  const queue = ASSETS.map((a) => a.symbol as string);
  await Promise.all([0, 1, 2].map(async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const q = await one(s);
      if (q) out.push(q);
    }
  }));
  return ASSETS.flatMap((a) => out.filter((q) => q.symbol === a.symbol));
}

export function toE8(s: string): bigint {
  const [i, f = ""] = (s.includes("e") ? Number(s).toFixed(8) : s).split(".");
  return BigInt(i + (f + "00000000").slice(0, 8));
}

async function main() {
  const reporter = privateKeyToAccount(env("REPORTER_KEY") as Hex);
  const feed = addr("FEED_ADDRESS");
  const { pub, wallet } = clients((process.env.RELAYER_KEY ?? env("REPORTER_KEY")) as Hex);
  const interval = Number(process.env.INTERVAL_MS ?? 60000);

  for (;;) {
    try {
      const quotes = await fetchQuotes();
      if (quotes.length === 0) throw new Error("no quotes available; not posting");
      const assets = quotes.map((q) => assetId(q.symbol));
      const prices = quotes.map((q) => q.price);
      // stamp with chain time, not the local clock: a fast local clock makes the update revert as FutureTimestamp
      const publishTime = (await pub.getBlock()).timestamp;
      const digest = await pub.readContract({ address: feed, abi: feedAbi, functionName: "digest", args: [assets, prices, publishTime] });
      const sig = await reporter.signMessage({ message: { raw: digest } });
      const hash = await wallet.writeContract({ address: feed, abi: feedAbi, functionName: "updatePrices", args: [assets, prices, publishTime, sig] });
      console.log(new Date().toISOString(), `${quotes.length} assets`, quotes.map((q) => `${q.symbol}:${Number(q.price) / 1e8}`).join(" "), hash);
    } catch (e) {
      console.error("reporter error:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

if (process.argv[1]?.endsWith("reporter.ts")) main();
