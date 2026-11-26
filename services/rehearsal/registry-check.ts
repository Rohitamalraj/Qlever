// Live check of the frontend's Keeper lookup: fetch the Keeper's ML-KEM key from QoreChain's registry,
// seal to it, and open with keys derived from the Keeper's mnemonic (read from stdin as `keys add` JSON; never printed).
import { seal, open, deriveSealKeys, generateSealKeys, recipientOf } from "@qorechain/qoreseal";
import { fetchMlkemPublicKey } from "@qorechain/qoreseal/network";

let raw = "";
for await (const c of process.stdin) raw += c;
let mnemonic: string;
try {
  ({ mnemonic } = JSON.parse(raw.replace(/^﻿/, "")) as { mnemonic: string });
} catch {
  console.error("could not parse key JSON");
  process.exit(1);
}
const KEEPER = process.argv[2]!;
const REST = "https://api-testnet.qore.host";

const regKey = await fetchMlkemPublicKey({ rest: REST, address: KEEPER });
console.log("registry key bytes:", regKey.length);
const trader = generateSealKeys();
const pt = new TextEncoder().encode("qlever registry roundtrip");
const aad = new Uint8Array([1, 2, 3]);
const env = seal({ chainId: "qorechain-diana", purpose: "qlever-position", mode: "mlkem", recipients: [recipientOf(trader), { mlkemPublicKey: regKey }], plaintext: pt, aad });
const out = open({ chainId: "qorechain-diana", purpose: "qlever-position", envelope: env, keys: deriveSealKeys({ mnemonic: mnemonic.trim() }), aad });
console.log("keeper opened registry-sealed envelope:", new TextDecoder().decode(out) === "qlever registry roundtrip");
