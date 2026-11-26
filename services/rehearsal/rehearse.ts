// Local rehearsal against anvil (chain id 9800). Prices are REAL (Binance), signed by the reporter key and relayed on-chain.
// Run: EVM_RPC=... VAULT_ADDRESS=... FEED_ADDRESS=... TIERS_ADDRESS=... npx tsx rehearsal/rehearse.ts
import { spawn } from "node:child_process";
import { parseEther, formatEther, type Hex } from "viem";
import { generateSealKeys, deriveSealKeys, seal, recipientOf } from "@qorechain/qoreseal";
import { hexToBytes, bytesToHex, encodeAbiParameters } from "viem";
import { clients, env, addr } from "../src/config.ts";
import { vaultAbi as baseVaultAbi, feedAbi, tierAbi } from "../src/abi.ts";
import { parseAbi } from "viem";
import { generatePrivateKey } from "viem/accounts";
const vaultAbi = [...baseVaultAbi, ...parseAbi(["error NotOwner()", "error NotKeeper()", "error NotPositionOwner()", "error NoCollateral()", "error NotOpen()", "error CommitmentMismatch()", "error NotLiquidatable()", "error TransferFailed()", "error Reentrancy()"])] as const;
import { computeCommitment, randomNonce, openPosition, toReveal, CHAIN_ID, PURPOSE, type PositionFields } from "../src/position.ts";
import { fetchQuotes } from "../src/reporter.ts";
import { assetId } from "../src/assets.ts";

const LIVE = process.env.LIVE === "1";
const [, REPORTER_KEY, KEEPER_KEY, TRADER_KEY, OUTSIDER_KEY] = LIVE ? [process.env.DEPLOYER_KEY, process.env.REPORTER_KEY, process.env.KEEPER_KEY, process.env.TRADER_KEY, process.env.OUTSIDER_KEY ?? generatePrivateKey()] as Hex[] : [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
] as Hex[];
const MNEMONIC = process.env.KEEPER_MNEMONIC ?? "test test test test test test test test test test test junk";
const COLL_A = process.env.COLL_A ?? "10";
const COLL_B = process.env.COLL_B ?? "5";
const COLL_C = process.env.COLL_C ?? "1";

const vault = addr("VAULT_ADDRESS");
const feed = addr("FEED_ADDRESS");
const tiersAddr = addr("TIERS_ADDRESS");
const reporter = clients(REPORTER_KEY);
const keeper = clients(KEEPER_KEY);
const trader = clients(TRADER_KEY);
const outsider = clients(OUTSIDER_KEY);

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};
const wait = (h: Hex) => trader.pub.waitForTransactionReceipt({ hash: h });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Returns the on-chain price per symbol. Local mode relays a real Finnhub batch; live mode reads what the reporter service posted. */
async function postRealPrices(): Promise<Map<string, bigint>> {
  if (!LIVE) {
    const quotes = await fetchQuotes();
    const assets = quotes.map((q) => assetId(q.symbol));
    const prices = quotes.map((q) => q.price);
    const publishTime = BigInt(Math.floor(Date.now() / 1000) - 1);
    const digest = await reporter.pub.readContract({ address: feed, abi: feedAbi, functionName: "digest", args: [assets, prices, publishTime] });
    const sig = await reporter.account.signMessage({ message: { raw: digest } });
    await wait(await reporter.wallet.writeContract({ address: feed, abi: feedAbi, functionName: "updatePrices", args: [assets, prices, publishTime, sig] }));
  }
  const out = new Map<string, bigint>();
  for (const sym of ["AAPL", "NVDA"]) {
    const [p] = (await trader.pub.readContract({ address: feed, abi: feedAbi, functionName: "latestPrice", args: [assetId(sym)] })) as [bigint, bigint];
    out.set(sym, p);
  }
  return out;
}

async function expectRevert(label: string, fn: () => Promise<unknown>, needle: string) {
  try {
    await fn();
    check(label, false, "did not revert");
  } catch (e) {
    const m = (e as Error).message;
    check(label, m.includes(needle), m.includes(needle) ? `reverted: ${needle}` : m.split("\n")[0]);
  }
}

// trader keys (stand-in for the wallet-signature derivation) and keeper keys (from mnemonic, as the Keeper service does)
const traderKeys = generateSealKeys();
const keeperKeys = deriveSealKeys({ mnemonic: MNEMONIC });
const outsiderKeys = generateSealKeys();

const PARAMS = [{ type: "bytes32" }, { type: "uint256" }, { type: "uint16" }, { type: "bool" }, { type: "uint256" }, { type: "bytes32" }] as const;
/** Same call shape as frontend/lib/qlever.ts sealPosition: mlkem mode, trader + keeper recipients, commitment as AAD. */
function sealLikeFrontend(f: PositionFields) {
  const commitment = computeCommitment(f);
  const envelope = seal({
    chainId: CHAIN_ID,
    purpose: PURPOSE,
    mode: "mlkem",
    recipients: [recipientOf(traderKeys), { mlkemPublicKey: keeperKeys.mlkemPublicKey }],
    plaintext: hexToBytes(encodeAbiParameters(PARAMS, [f.asset, f.entryPrice, f.leverage, f.isLong, f.liqPrice, f.nonce])),
    aad: hexToBytes(commitment),
  });
  return { commitment, envelope: bytesToHex(envelope) as Hex };
}

async function open(f: PositionFields, qor: string) {
  const { commitment, envelope } = sealLikeFrontend(f);
  const hash = await trader.wallet.writeContract({ address: vault, abi: vaultAbi, functionName: "openPosition", args: [commitment, envelope], value: parseEther(qor) });
  const r = await wait(hash);
  const id = BigInt(r.logs[0].topics[1]!);
  return { id, commitment, envelope, gas: r.gasUsed, block: r.blockNumber };
}

async function main() {
  console.log("== Qlever rehearsal (chain 9800, real Finnhub prices) ==");
  const base = (await trader.pub.readContract({ address: vault, abi: vaultAbi, functionName: "poolStats" })) as [bigint, bigint, bigint];
  const px = await postRealPrices();
  const price = px.get("AAPL")!; // healthy long is on AAPL
  const priceN = px.get("NVDA")!; // crossed short is on NVDA
  console.log(`oracle: AAPL $${Number(price) / 1e8}, NVDA $${Number(priceN) / 1e8}`);
  check("oracle serves two independent real prices", price > 0n && priceN > 0n && price !== priceN);

  const cap = (await trader.pub.readContract({ address: tiersAddr, abi: tierAbi, functionName: "maxLeverage", args: [trader.account.address] })) as number;
  check("unverified trader cap is 2x", cap === 2, `cap=${cap}`);

  // Position A: healthy long, liquidation 18% below spot.  Position B: short whose liq price is already below spot (crossed).
  const A: PositionFields = { asset: assetId("AAPL"), entryPrice: price, leverage: 2, isLong: true, liqPrice: (price * 82n) / 100n, nonce: randomNonce() };
  const B: PositionFields = { asset: assetId("NVDA"), entryPrice: priceN, leverage: 2, isLong: false, liqPrice: (priceN * 99n) / 100n, nonce: randomNonce() };
  const a = await open(A, COLL_A);
  const b = await open(B, COLL_B);
  console.log(`opened #${a.id} (healthy AAPL long) and #${b.id} (crossed NVDA short); gas ${a.gas}`);

  // 1. What an observer sees on-chain
  const logs = await trader.pub.getContractEvents({ address: vault, abi: vaultAbi, eventName: "PositionOpened", fromBlock: a.block, toBlock: b.block });
  const leaked = JSON.stringify(logs, (_, v) => (typeof v === "bigint" ? v.toString() : v)).toLowerCase();
  const liqDec = A.liqPrice.toString();
  const liqHex = A.liqPrice.toString(16);
  check("event data does not contain the plaintext liquidation price", !leaked.includes(liqDec) && !leaked.includes(liqHex.padStart(64, "0")));
  check("envelope is ML-KEM-1024 sized (>1.5KB)", (a.envelope.length - 2) / 2 > 1500, `${(a.envelope.length - 2) / 2} bytes`);

  // 2. Who can open the envelope
  const asKeeper = openPosition(a.envelope, a.commitment, keeperKeys);
  const asTrader = openPosition(a.envelope, a.commitment, traderKeys);
  check("Keeper decrypts position #" + a.id, asKeeper.liqPrice === A.liqPrice && asKeeper.leverage === 2);
  check("Trader decrypts own position", asTrader.isLong === true && asTrader.nonce === A.nonce);
  let outsiderOpened = true;
  try { openPosition(a.envelope, a.commitment, outsiderKeys); } catch { outsiderOpened = false; }
  check("outsider cannot decrypt", !outsiderOpened);

  // 3. Fabricated reveals revert
  await expectRevert("fake liquidation of healthy #" + a.id + " (made-up fields) reverts", () => keeper.pub.simulateContract({ account: keeper.account, address: vault, abi: vaultAbi, functionName: "liquidate", args: [a.id, { ...toReveal(A), leverage: 50, isLong: true, liqPrice: price * 2n, nonce: randomNonce() }] }), "CommitmentMismatch");
  await expectRevert("keeper cannot swap in another asset's price (asset is committed)", () => keeper.pub.simulateContract({ account: keeper.account, address: vault, abi: vaultAbi, functionName: "liquidate", args: [a.id, { ...toReveal(A), asset: B.asset }] }), "CommitmentMismatch");
  await expectRevert("true fields but price not crossed reverts", () => keeper.pub.simulateContract({ account: keeper.account, address: vault, abi: vaultAbi, functionName: "liquidate", args: [a.id, toReveal(A)] }), "NotLiquidatable");
  await expectRevert("non-keeper cannot liquidate", () => outsider.pub.simulateContract({ account: outsider.account, address: vault, abi: vaultAbi, functionName: "liquidate", args: [b.id, toReveal(B)] }), "NotKeeper");
  await expectRevert("outsider cannot close someone else's position", () => outsider.pub.simulateContract({ account: outsider.account, address: vault, abi: vaultAbi, functionName: "closePosition", args: [a.id, toReveal(A)] }), "NotPositionOwner");

  // 4. Real Keeper service liquidates #b
  const [, , , , openBefore] = (await trader.pub.readContract({ address: vault, abi: vaultAbi, functionName: "positions", args: [b.id] })) as [Hex, bigint, Hex, bigint, boolean];
  check(`#${b.id} open before keeper runs`, openBefore);
  const proc = spawn("npx", ["tsx", "src/keeper.ts"], {
    shell: true,
    env: { ...process.env, KEEPER_KEY, KEEPER_MNEMONIC: MNEMONIC, FROM_BLOCK: (a.block - 5n).toString(), POLL_MS: "3000" } as NodeJS.ProcessEnv,
  });
  let out = "";
  proc.stdout.on("data", (d) => (out += d));
  proc.stderr.on("data", (d) => (out += d));
  let liquidated = false;
  for (let i = 0; i < 40 && !liquidated; i++) {
    await sleep(1000);
    const [, , , , o] = (await trader.pub.readContract({ address: vault, abi: vaultAbi, functionName: "positions", args: [b.id] })) as [Hex, bigint, Hex, bigint, boolean];
    liquidated = !o;
  }
  proc.kill();
  spawn("taskkill", ["/F", "/T", "/PID", String(proc.pid)], { shell: true });
  check(`keeper service liquidated crossed NVDA #${b.id}`, liquidated, out.trim().split("\n").slice(-3).join(" | "));
  const [, , forfeited] = (await trader.pub.readContract({ address: vault, abi: vaultAbi, functionName: "poolStats" })) as [bigint, bigint, bigint];
  check("forfeited pool holds #" + b.id + " collateral", forfeited - base[2] === parseEther(COLL_B), `${formatEther(forfeited)} QOR`);
  const [, , , , aOpen] = (await trader.pub.readContract({ address: vault, abi: vaultAbi, functionName: "positions", args: [a.id] })) as [Hex, bigint, Hex, bigint, boolean];
  check(`healthy #${a.id} left alone by the keeper`, aOpen);

  // 4b. A sealed entry price the oracle never recorded cannot manufacture profit, even with funds in the forfeited pool
  {
    const C: PositionFields = { asset: assetId("AAPL"), entryPrice: price / 2n, leverage: 2, isLong: true, liqPrice: price / 4n, nonce: randomNonce() };
    const c = await open(C, COLL_C);
    const [, , poolBefore] = (await trader.pub.readContract({ address: vault, abi: vaultAbi, functionName: "poolStats" })) as [bigint, bigint, bigint];
    const bal0 = await trader.pub.getBalance({ address: trader.account.address });
    const rc = await wait(await trader.wallet.writeContract({ address: vault, abi: vaultAbi, functionName: "closePosition", args: [c.id, toReveal(C)] }));
    const bal1 = await trader.pub.getBalance({ address: trader.account.address });
    const net = bal1 - bal0 + rc.gasUsed * rc.effectiveGasPrice;
    check("fake entry price (half the market) earns no profit", poolBefore > 0n && net === parseEther(COLL_C), `pool ${formatEther(poolBefore)} QOR, got back ${formatEther(net)} of ${COLL_C}`);
  }

  // 5. Trader closes the healthy position with the same reveal-and-verify; payout = collateral +/- PnL
  const before = await trader.pub.getBalance({ address: trader.account.address });
  const r = await wait(await trader.wallet.writeContract({ address: vault, abi: vaultAbi, functionName: "closePosition", args: [a.id, toReveal(asTrader)] }));
  const after = await trader.pub.getBalance({ address: trader.account.address });
  const gasCost = r.gasUsed * r.effectiveGasPrice;
  {
    // expected payout = collateral +/- collateral*lev*move/entry, using the oracle price the vault saw in that block
    const [closePx] = (await trader.pub.readContract({ address: feed, abi: feedAbi, functionName: "latestPrice", args: [A.asset], blockNumber: r.blockNumber })) as [bigint, bigint];
    const [, , poolAtClose] = (await trader.pub.readContract({ address: vault, abi: vaultAbi, functionName: "poolStats", blockNumber: r.blockNumber - 1n })) as [bigint, bigint, bigint];
    const col = parseEther(COLL_A);
    const move = closePx >= A.entryPrice ? closePx - A.entryPrice : A.entryPrice - closePx;
    const pnl = (col * BigInt(A.leverage) * move) / A.entryPrice;
    const expected = closePx >= A.entryPrice ? col + (pnl > poolAtClose ? poolAtClose : pnl) : col - (pnl > col ? col : pnl);
    const net = after - before + gasCost;
    check("close settles collateral +/- PnL exactly as the vault formula says", net === expected,
      `entry $${Number(A.entryPrice) / 1e8} -> close $${Number(closePx) / 1e8}, paid ${formatEther(net)} QOR`);
  }
  const [locked, count] = (await trader.pub.readContract({ address: vault, abi: vaultAbi, functionName: "poolStats" })) as [bigint, bigint, bigint];
  check("pool is back to its starting state afterwards", locked === base[0] && count === base[1]);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
