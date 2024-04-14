import { QuoteToken } from "../common/types";

export interface SnipingTaskSummaryModel {
  mint: string;
  symbol: string;
  name: string;
  poolId: string;
  started: number;
  ended: number;
  errorDetails?: string;
  quoteToken: QuoteToken;
  investment: bigint;
  return: bigint;
}

export interface SnipingPerformanceModel {
  quoteToken: QuoteToken;
  totalInvestment: bigint;
  totalReturn: bigint;
}
