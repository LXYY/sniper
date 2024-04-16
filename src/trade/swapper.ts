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
  amountIn: BN;
  minAmountOut: BN;
  baseTokenPrice: Decimal;
  protocolSpecificPayload: any;
}

export interface TokenSwapper {
  buyToken(quote: Quote, opts?: SwapOptions): Promise<SwapSummary>;

  sellToken(quote: Quote, opts?: SwapOptions): Promise<SwapSummary>;

  getBuyQuote(buyAmount: BN, slippage: number): Promise<Quote>;

  getSellQuote(sellAmount: BN, slippage: number): Promise<Quote>;

  getPriceInQuote(): Promise<Decimal>;
}

export type TokenSwapperFactory = (
  poolId: PublicKey,
  baseToken: SplToken,
  quoteToken: SplToken,
) => TokenSwapper;
