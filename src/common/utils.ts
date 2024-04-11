import * as util from "node:util";

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function inspect(obj: any) {
  return util.inspect(obj, { depth: null, colors: true });
}
