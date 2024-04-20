import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { SplToken } from "../common/spl_token";
import splToken from "@solana/spl-token";
import { TaskError } from "./errors";
import Decimal from "decimal.js";

export interface Price {
  timestamp: number;
  price: string;
}

export interface TaskSummary {
  poolId: PublicKey;
  error?: TaskError;
  baseToken: SplToken;
  quoteToken: SplToken;
  snipingStartTime: number;
  snipingEndTime: number;
  quoteTokenInAmount: BN;
  quoteTokenOutAmount: BN;
  priceSamples: Price[];
  txnSignatures: string[];
  buyInPrice: string;
  initialCashOutPrice: string;
  finalCashOutPrice?: string;
  buyInTimeString?: string;
  cashOutTimeString?: string;
}

export interface SnipingCriteriaInput {
  poolId: PublicKey;
  baseToken: SplToken;
  quoteToken: SplToken;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  lpVault: PublicKey;
  lpMint: PublicKey;
}
