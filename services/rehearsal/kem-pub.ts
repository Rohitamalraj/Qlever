// Reads a qorechaind `keys add --output json` blob on stdin and prints ONLY the QoreSeal ML-KEM-1024 public key (hex).
import { deriveSealKeys } from "@qorechain/qoreseal";
import { bytesToHex } from "viem";

let raw = "";
for await (const c of process.stdin) raw += c;
let mnemonic: string;
try {
  ({ mnemonic } = JSON.parse(raw.replace(/^﻿/, "")) as { mnemonic: string });
} catch {
  console.error("could not parse key JSON"); // never echo the input: it contains a mnemonic
  process.exit(1);
}
console.log(bytesToHex(deriveSealKeys({ mnemonic: mnemonic.trim() }).mlkemPublicKey).slice(2));
