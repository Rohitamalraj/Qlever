import { ASSETS } from "@/lib/assets";

export const dynamic = "force-dynamic";

const BASE = process.env.COINGECKO_URL ?? "https://api.coingecko.com/api/v3";
const DAYS: Record<string, number> = { "1D": 1, "7D": 7, "30D": 30, "1Y": 365 };
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; body: unknown }>();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const asset = ASSETS.find((a) => a.symbol === searchParams.get("symbol"));
  const days = DAYS[searchParams.get("tf") ?? "1D"];
  if (!asset || !days) return Response.json({ error: "bad symbol or timeframe" }, { status: 400 });

  const key = `${asset.cg}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Response.json(hit.body);
  try {
    const headers: Record<string, string> = { "user-agent": "qlever-app" };
    if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
    const r = await fetch(`${BASE}/coins/${asset.cg}/ohlc?vs_currency=usd&days=${days}`, { headers, cache: "no-store" });
    if (!r.ok) throw new Error(`coingecko ${r.status}`);
    const candles = (await r.json()) as number[][];
    const body = { candles };
    cache.set(key, { at: Date.now(), body });
    return Response.json(body);
  } catch (e) {
    if (hit) return Response.json(hit.body);
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
