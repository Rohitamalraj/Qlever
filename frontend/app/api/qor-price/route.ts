export const dynamic = "force-dynamic";

const TTL_MS = 60_000;
let cache: { at: number; usd: number } | null = null;

/** QOR/USD from CoinGecko (mainnet QOR market price), cached 60s. Testnet QOR itself has no value. */
export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return Response.json({ usd: cache.usd, source: "coingecko" });
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=qorechain&vs_currencies=usd", {
      headers: { "user-agent": "qlever-app" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error(`coingecko ${r.status}`);
    const usd = (await r.json())?.qorechain?.usd;
    if (!(usd > 0)) throw new Error("no price");
    cache = { at: Date.now(), usd };
    return Response.json({ usd, source: "coingecko" });
  } catch (e) {
    if (cache) return Response.json({ usd: cache.usd, source: "coingecko", stale: true });
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
