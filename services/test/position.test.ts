import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSealKeys, recipientOf } from "@qorechain/qoreseal";
import { assetId } from "../src/assets.ts";
import { computeCommitment, openPosition, randomNonce, sealPosition } from "../src/position.ts";

const fields = () => ({ asset: assetId("NVDA"), entryPrice: 150n * 10n ** 8n, leverage: 10, isLong: true, liqPrice: 90_000n * 10n ** 8n, nonce: randomNonce() });

test("trader and keeper can both open; outsider cannot", () => {
  const trader = generateSealKeys(), keeper = generateSealKeys(), eve = generateSealKeys();
  const f = fields();
  const { commitment, envelope } = sealPosition(f, trader, recipientOf(keeper));
  assert.equal(commitment, computeCommitment(f));
  assert.deepEqual(openPosition(envelope, commitment, keeper), f);
  assert.deepEqual(openPosition(envelope, commitment, trader), f);
  assert.throws(() => openPosition(envelope, commitment, eve));
});

test("envelope is bound to its commitment (AAD)", () => {
  const trader = generateSealKeys(), keeper = generateSealKeys();
  const { envelope } = sealPosition(fields(), trader, recipientOf(keeper));
  assert.throws(() => openPosition(envelope, computeCommitment(fields()), keeper));
});
