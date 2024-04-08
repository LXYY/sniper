import { PoolType } from "./types";
import BN from "bn.js";

export interface PoolUpdate {
  type: PoolType;
  createdBlockTime: number;
  openTime: number;
  isNewPool: boolean;
  baseTokenAmount: BN;
  quoteTokenAmount: BN;
  updateTxnSignature: string;
  hydrate(): Promise<void>;
}
