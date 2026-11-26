import type { Abi, Hex, PublicClient } from "viem";

/** QoreChain's public RPC rejects eth_getLogs spans over 10,000 blocks. */
const SPAN = 9_000n;

type Entry = { to: bigint; logs: unknown[]; inflight?: Promise<unknown[]> };
const cache = new Map<string, Entry>();

/**
 * All logs for one event since `fromBlock`, fetched in RPC-sized chunks. Results are cached per query, so later calls
 * only scan the blocks added since the previous call.
 */
export async function getEventsSince<T = unknown>(
  client: PublicClient,
  q: { address: Hex; abi: Abi; eventName: string; args?: Record<string, unknown> },
  fromBlock: bigint
): Promise<T[]> {
  const key = JSON.stringify([q.address.toLowerCase(), q.eventName, q.args ?? null, fromBlock.toString()]);
  const entry: Entry = cache.get(key) ?? { to: fromBlock - 1n, logs: [] };
  cache.set(key, entry);
  if (entry.inflight) return (await entry.inflight) as T[];

  entry.inflight = (async () => {
    const head = await client.getBlockNumber();
    for (let start = entry.to + 1n; start <= head; start += SPAN) {
      const end = start + SPAN - 1n < head ? start + SPAN - 1n : head;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = await (client.getContractEvents as any)({ address: q.address, abi: q.abi, eventName: q.eventName, args: q.args, fromBlock: start, toBlock: end });
      entry.logs.push(...logs);
      entry.to = end;
    }
    return entry.logs;
  })();

  try {
    return (await entry.inflight) as T[];
  } finally {
    entry.inflight = undefined;
  }
}
