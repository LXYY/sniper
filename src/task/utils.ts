import { ErrRuntimeError, TaskError } from "./errors";
import { SnipingCriteriaInput, TaskSummary } from "./types";
import BN from "bn.js";
import { PoolCreation } from "../common/types";
import { SwapSummary } from "../trade/swapper";
import Decimal from "decimal.js";
import { Liquidity, MAINNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { PublicKey } from "@solana/web3.js";

export function getExecutionPriceFromSummary(summary: SwapSummary): Decimal {
  const deltaBaseAmount = new Decimal(summary.preBaseTokenAmount.toString())
    .sub(summary.postBaseTokenAmount.toString())
    .abs();
  const deltaQuoteAmount = new Decimal(summary.preQuoteTokenAmount.toString())
    .sub(summary.postQuoteTokenAmount.toString())
    .abs();
  return deltaQuoteAmount.div(deltaBaseAmount);
}

export function getSnipingCriteriaInput(
  poolCreation: PoolCreation,
): SnipingCriteriaInput {
  const programId = MAINNET_PROGRAM_ID.AmmV4;
  const marketId = poolCreation.marketId;
  return {
    poolId: poolCreation.poolId,
    baseToken: poolCreation.baseToken,
    quoteToken: poolCreation.quoteToken,
    baseVault: Liquidity.getAssociatedBaseVault({
      programId,
      marketId,
    }),
    quoteVault: Liquidity.getAssociatedQuoteVault({
      programId,
      marketId,
    }),
    lpVault: Liquidity.getAssociatedLpVault({
      programId,
      marketId,
    }),
    lpMint: Liquidity.getAssociatedLpMint({
      programId,
      marketId,
    }),
  };
}

export function getTaskSummaryFromError(
  error: Error,
  poolCreation: PoolCreation,
): TaskSummary {
  const taskError = getTaskError(error);
  return {
    poolId: poolCreation.poolId,
    error: taskError,
    baseToken: poolCreation.baseToken,
    quoteToken: poolCreation.quoteToken,
    snipingStartTime: 0,
    snipingEndTime: Date.now() / 1000,
    quoteTokenInAmount: new BN(0),
    quoteTokenOutAmount: new BN(0),
    priceSamples: [],
    txnSignatures: [],
    buyInPrice: "0",
    initialCashOutPrice: "0",
  };
}

export function printSwapSummary(summary: SwapSummary) {
  console.log(`txnSignature: ${summary.txnSignature}`);
  console.log(`txnType: ${summary.txnType}`);
  console.log(`blockTimestamp: ${summary.blockTimestamp}`);
  console.log(`preBaseTokenAmount: ${summary.preBaseTokenAmount.toString()}`);
  console.log(`postBaseTokenAmount: ${summary.postBaseTokenAmount.toString()}`);
  console.log(`preQuoteTokenAmount: ${summary.preQuoteTokenAmount.toString()}`);
  console.log(
    `postQuoteTokenAmount: ${summary.postQuoteTokenAmount.toString()}`,
  );
}

function getTaskError(error: Error): TaskError {
  let taskError: TaskError;
  if (!(error instanceof TaskError)) {
    taskError = new ErrRuntimeError(error.message);
  } else {
    taskError = error;
  }
  return taskError;
}
