import * as util from "node:util";
import BN from "bn.js";
import Decimal from "decimal.js";
import { PublicKey } from "@solana/web3.js";

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function inspect(obj: any) {
  return util.inspect(obj, { depth: null, colors: true });
}

export function uiAmountToBN(uiAmount: number, decimals: number): BN {
  let amount = new Decimal(10).pow(decimals).mul(uiAmount);
  return new BN(amount.floor().toString());
}

export function decimalToBN(value: Decimal): BN {
  return new BN(value.toString());
}

export function bnToDecimal(value: BN): Decimal {
  return new Decimal(value.toString());
}

export function rawAmountToDecimal(value: BN, decimals: number): Decimal {
  return new Decimal(value.toString()).div(new Decimal(10).pow(decimals));
}

export function findPda(programId: PublicKey, ...args: any[]): PublicKey {
  const seeds: Array<Buffer | Uint8Array> = [];
  for (let arg of args) {
    if (
      arg instanceof PublicKey ||
      (typeof arg === "object" && arg.constructor.name === "PublicKey")
    ) {
      seeds.push(arg.toBytes());
    } else if (arg instanceof BN) {
      seeds.push(arg.toBuffer("le", 8));
    } else if (typeof arg === "string") {
      seeds.push(new TextEncoder().encode(arg));
    } else if (typeof arg === "number") {
      // Only 4-bytes int are supported here.
      const value = new BN(arg);
      seeds.push(value.toBuffer("le", 4));
    } else if (isNumberArray(arg)) {
      seeds.push(Uint8Array.from(arg));
    } else {
      console.log("Missing type!!!!!!!!!!!!!!!!!");
      console.log(typeof arg);
      console.log(arg.constructor.name);
      console.log(arg.toString());
    }
  }
  const [pda, _] = PublicKey.findProgramAddressSync(seeds, programId);
  return pda;
}

function isNumberArray(value: any): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((element) => typeof element === "number")
  );
}

// Binary search for the first element that doesn't satisfy the leftPredicate.
export function binarySearch<T>(
  elements: T[],
  leftPredicate: (i: number) => boolean,
): number {
  let left = 0;
  let right = elements.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    if (leftPredicate(mid)) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return left;
}
