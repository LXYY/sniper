import BN from "bn.js";
import { SplToken } from "../common/spl_token";
import { QuoteToken } from "../common/types";
import { PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";

export enum SwapTxnType {
  BUY = "BUY",
  SELL = "SELL",
}

export interface SwapSummary {
  txnSignature: string;
  txnType: SwapTxnType;
  preBaseTokenAmount: BN;
  postBaseTokenAmount: BN;
  preQuoteTokenAmount: BN;
  postQuoteTokenAmount: BN;
}

export interface SwapOptions {
  skipPreflight: boolean;
  priorityFeeInMicroLamports: number;
}

export interface Quote {
  minOutAmount: BN;
  baseTokenPrice: Decimal;
}

export interface TokenSwapper {
  buyToken(
    buyAmount: BN,
    minExpectedAmount?: BN,
    opts?: SwapOptions,
  ): Promise<SwapSummary>;

  sellToken(
    sellAmount: BN,
    minExpectedAmount?: BN,
    opts?: SwapOptions,
  ): Promise<SwapSummary>;

  getBuyQuote(buyAmount: BN, slippage: number): Promise<Quote>;

  getSellQuote(sellAmount: BN, slippage: number): Promise<Quote>;

  getPriceInQuote(): Promise<Decimal>;
}

export type TokenSwapperFactory = (
  poolId: PublicKey,
  baseToken: SplToken,
  quoteToken: SplToken,
) => TokenSwapper;
