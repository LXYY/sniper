import BN from "bn.js";
import { SplToken } from "./spl_token";
import { PublicKey } from "@solana/web3.js";
import { ApiPoolInfoV4, LiquidityStateV4 } from "@raydium-io/raydium-sdk";

export enum QuoteToken {
  SOL = "SOL",
}

export enum PoolType {
  RAYDIUM_V4 = "RAYDIUM_V4",
}

export interface PoolCreation {
  type: PoolType;
  poolId: PublicKey;
  marketId: PublicKey;
  initialPoolState?: LiquidityStateV4;
  openTime: number;
  baseToken: SplToken;
  quoteToken: SplToken;
  marketCreator: PublicKey;
  marketCreatedAtTimestamp: number;
  marketCreatedBeforeSec: number;
}

export interface MarketCreation {
  marketId: PublicKey;
  baseToken: SplToken;
  quoteToken: SplToken;
  createTxnSignature: string;
  createdAtSlot: number;
  createdAtTimestamp: number;
  creator: PublicKey;
}
