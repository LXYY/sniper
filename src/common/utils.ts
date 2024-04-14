import * as util from "node:util";
import BN from "bn.js";
import Decimal from "decimal.js";

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
