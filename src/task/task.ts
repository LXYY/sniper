import { PoolCreation } from "../common/types";
import { Price, SnipingCriteriaInput, TaskSummary } from "./types";
import { SnipingCriteria } from "./sniping_criteria";
import { ErrRuntimeError, TaskError } from "./errors";
import BN from "bn.js";
import {
  DefaultPositionManager,
  PositionManager,
} from "../trade/position_manager";
import sniperConfig from "../common/config";
import { PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import solConnection from "../common/sol_connection";
import { sleep, uiAmountToBN } from "../common/utils";
import { SplToken } from "../common/spl_token";
import {
  SwapOptions,
  SwapSummary,
  SwapTxnType,
  TokenSwapper,
} from "../trade/swapper";
import Decimal from "decimal.js";
import { RaydiumV4Swapper } from "../trade/raydium_v4_swapper";
import {
  getExecutionPriceFromSummary,
  getSnipingCriteriaInput,
  getTaskSummaryFromError,
  printSwapSummary,
} from "./utils";
import jitoLeaderSchedule, {
  JitoLeaderSchedule,
} from "../jito/leader_schedule";

export interface SnipingTask {
  run(): Promise<void>;

  onTaskFinalization(callback: (summary: TaskSummary) => Promise<void>): void;
}

export interface SnipingTaskInput {
  snipingCriteria: SnipingCriteria;
  poolCreation: PoolCreation;
  tokenSwapper: TokenSwapper;
}

export class DefaultSnipingTask implements SnipingTask {
  private readonly snipingCriteria: SnipingCriteria;
  private readonly poolCreation: PoolCreation;
  private readonly tokenSwapper: TokenSwapper;
  private startTimestamp: number;
  private buyInTimestamp: number;
  private positionManager: PositionManager;
  private readonly priceSamples: Price[];
  private readonly txnSignatures: string[];
  private buyInPrice?: Decimal;
  private initialCashOutPrice?: Decimal;
  private finalCashOutPrice?: Decimal;
  private marketId: PublicKey;
  private taskFinalizationCallback: (summary: TaskSummary) => Promise<void>;

  constructor(input: SnipingTaskInput) {
    this.snipingCriteria = input.snipingCriteria;
    this.poolCreation = input.poolCreation;
    this.tokenSwapper = input.tokenSwapper;
    this.positionManager = new DefaultPositionManager();
    this.txnSignatures = [];
    this.priceSamples = [];
  }

  onTaskFinalization(callback: (summary: TaskSummary) => Promise<void>) {
    this.taskFinalizationCallback = callback;
  }

  getBaseVault(): PublicKey {
    return this.poolCreation.initialPoolState.baseVault;
  }

  getQuoteVault(): PublicKey {
    return this.poolCreation.initialPoolState.quoteVault;
  }

  getBaseToken(): SplToken {
    return this.poolCreation.baseToken;
  }

  getQuoteToken(): SplToken {
    return this.poolCreation.quoteToken;
  }

  async run(): Promise<void> {
    this.startTimestamp = Date.now() / 1000;
    try {
      await this.snipingCriteria.waitUntilSatisfied(
        getSnipingCriteriaInput(this.poolCreation),
      );
      await this.buyIn();
      await this.initialCashOut();
      await this.hardCashOut();
      await this.taskFinalizationCallback(this.getTaskSummary());
    } catch (error) {
      await this.taskFinalizationCallback(
        getTaskSummaryFromError(error, this.poolCreation),
      );
      return;
    }
  }

  private getHardCashOutTime(): number {
    return this.buyInTimestamp + sniperConfig.strategy.hardCashOutTimeSec;
  }

  private async getBuyInAmount(): Promise<BN> {
    const quoteVault = await getAccount(
      solConnection,
      this.getQuoteVault(),
      "processed",
    );
    const strategyConfig = sniperConfig.strategy;
    const quoteAmountByPercentage = new BN(quoteVault.amount.toString())
      .muln(strategyConfig.quoteTokenBuyInPercentage)
      .divn(100);
    const minQuoteAmount = uiAmountToBN(
      strategyConfig.minQuoteTokenIn,
      this.getQuoteToken().decimals,
    );
    const maxQuoteAmount = uiAmountToBN(
      strategyConfig.maxQuoteTokenIn,
      this.getQuoteToken().decimals,
    );
    if (quoteAmountByPercentage.lt(minQuoteAmount)) {
      return minQuoteAmount;
    }
    if (quoteAmountByPercentage.gt(maxQuoteAmount)) {
      return maxQuoteAmount;
    }
    return quoteAmountByPercentage;
  }

  private getDefaultSwapOptions(swapType: SwapTxnType): SwapOptions {
    const options: SwapOptions = {
      skipPreflight: false,
      priorityFeeInMicroLamports:
        swapType === SwapTxnType.BUY
          ? sniperConfig.strategy.buyFeeMicroLamports
          : sniperConfig.strategy.sellFeeMicroLamports,
    };
    if (sniperConfig.general.sendTxnRetries > 0) {
      options.maxRetries = sniperConfig.general.sendTxnRetries;
    }
    return options;
  }

  private async buyIn() {
    await this.tryWaitForNextJitoLeader(true);
    const buyInAmount = await this.getBuyInAmount();
    const slippage = sniperConfig.strategy.buySlippage;
    const quote = await this.tokenSwapper.getBuyQuote(buyInAmount, slippage);
    const buyInSummary = await this.tokenSwapper.buyToken(
      quote,
      this.getDefaultSwapOptions(SwapTxnType.BUY),
    );
    printSwapSummary(buyInSummary);
    this.buyInTimestamp = buyInSummary.blockTimestamp;
    this.buyInPrice = getExecutionPriceFromSummary(buyInSummary);
    this.updatePosition(buyInSummary);
  }

  private async tryWaitForNextJitoLeader(checkSlotGap: boolean) {
    if (!sniperConfig.strategy.jitoOnly) {
      return;
    }
    let nextJitoLeaderSlot = await jitoLeaderSchedule.getNextLeaderSlot();
    if (
      checkSlotGap &&
      nextJitoLeaderSlot.nextSlot - nextJitoLeaderSlot.currentSlot >
        sniperConfig.strategy.maxSlotsUntilNextJitoLeader
    ) {
      throw new ErrRuntimeError(
        `next JITO leader slot is too far away. Current slot: ${nextJitoLeaderSlot.currentSlot}, next JITO leader slot: ${nextJitoLeaderSlot.nextSlot}`,
      );
    }

    while (nextJitoLeaderSlot.currentSlot < nextJitoLeaderSlot.nextSlot) {
      await sleep(sniperConfig.strategy.quoteTickIntervalMs);
      nextJitoLeaderSlot = await jitoLeaderSchedule.getNextLeaderSlot();
    }

    return;
  }

  // Initial cash out is based on the profit-taking & loss-cutting strategy.
  private async initialCashOut() {
    while (true) {
      await sleep(sniperConfig.strategy.quoteTickIntervalMs);
      const now = Date.now() / 1000;
      if (now > this.getHardCashOutTime()) {
        break;
      }
      try {
        const nextJitoLeaderSlot = await jitoLeaderSchedule.getNextLeaderSlot();
        if (nextJitoLeaderSlot.currentSlot < nextJitoLeaderSlot.nextSlot) {
          continue;
        }

        await this.samplePrice(now);
        if (await this.tryTakeProfit()) {
          break;
        }
        if (await this.tryCutLoss()) {
          break;
        }
      } catch (error) {
        console.error(
          `Error during cash out: ${error}, will retry after ${sniperConfig.strategy.quoteTickIntervalMs} ms`,
        );
      }
    }
  }

  private async samplePrice(now: number) {
    if (
      this.priceSamples.length > 0 &&
      now - this.priceSamples[this.priceSamples.length - 1].timestamp <
        sniperConfig.general.priceSampleInterval
    ) {
      return;
    }
    const price = await this.tokenSwapper.getPriceInQuote();
    this.priceSamples.push({
      timestamp: now,
      price: price.toFixed(10),
    });
  }

  private async tryTakeProfit(): Promise<boolean> {
    const strategyConfig = sniperConfig.strategy;
    const position = this.positionManager.getCurrentPosition();
    const takeProfitAmount = new BN(
      position
        .mul(strategyConfig.takeProfitSellPercentage)
        .div(100)
        .floor()
        .toString(),
    );
    const quote = await this.tokenSwapper.getSellQuote(
      takeProfitAmount,
      strategyConfig.sellSlippage,
    );
    // const price = new Decimal(quote.minAmountOut.toString()).div(
    //   takeProfitAmount.toString(),
    // );
    const price = new Decimal(quote.baseTokenPrice.toString());
    const unrealizedRoi = this.positionManager.getUnrealizedRoi(price) * 100;
    if (unrealizedRoi < strategyConfig.takeProfitPercentage) {
      return false;
    }
    const swapSummary = await this.tokenSwapper.sellToken(
      quote,
      this.getDefaultSwapOptions(SwapTxnType.SELL),
    );
    printSwapSummary(swapSummary);
    this.initialCashOutPrice = getExecutionPriceFromSummary(swapSummary);
    this.updatePosition(swapSummary);
    return true;
  }

  private async tryCutLoss(): Promise<boolean> {
    const strategyConfig = sniperConfig.strategy;
    const position = this.positionManager.getCurrentPosition();
    const stopLossAmount = new BN(
      position
        .mul(strategyConfig.stopLossSellPercentage)
        .div(100)
        .floor()
        .toString(),
    );
    const quote = await this.tokenSwapper.getSellQuote(
      stopLossAmount,
      strategyConfig.sellSlippage,
    );
    const averagePrice = new Decimal(quote.minAmountOut.toString()).div(
      stopLossAmount.toString(),
    );
    const unrealizedRoi =
      this.positionManager.getUnrealizedRoi(averagePrice) * 100;
    if (unrealizedRoi > -strategyConfig.stopLossPercentage) {
      return false;
    }
    const swapSummary = await this.tokenSwapper.sellToken(
      quote,
      this.getDefaultSwapOptions(SwapTxnType.SELL),
    );
    printSwapSummary(swapSummary);
    this.initialCashOutPrice = quote.baseTokenPrice;
    this.updatePosition(swapSummary);
    return true;
  }

  private async hardCashOut() {
    const timeToSleep = this.getHardCashOutTime() - Date.now() / 1000;
    if (timeToSleep > 0) {
      await sleep(timeToSleep * 1000);
    }
    while (true) {
      try {
        await this.tryWaitForNextJitoLeader(false);
        await this.sellAll();
        return;
      } catch (error) {
        console.error(`Error during hard cash out: ${error}, retrying...`);
      }
    }
  }

  private async sellAll() {
    const position = new BN(
      this.positionManager.getCurrentPosition().toString(),
    );
    if (position.eqn(0)) {
      return;
    }
    const quote = await this.tokenSwapper.getSellQuote(
      position,
      sniperConfig.strategy.sellSlippage,
    );
    const swapSummary = await this.tokenSwapper.sellToken(
      quote,
      this.getDefaultSwapOptions(SwapTxnType.SELL),
    );
    printSwapSummary(swapSummary);
    this.finalCashOutPrice = getExecutionPriceFromSummary(swapSummary);
    this.updatePosition(swapSummary);
  }

  private updatePosition(swapSummary: SwapSummary) {
    this.txnSignatures.push(swapSummary.txnSignature);
    if (swapSummary.txnType == SwapTxnType.BUY) {
      const quoteAmount = new Decimal(
        swapSummary.preQuoteTokenAmount
          .sub(swapSummary.postQuoteTokenAmount)
          .toString(),
      );
      const baseAmount = new Decimal(
        swapSummary.postBaseTokenAmount
          .sub(swapSummary.preBaseTokenAmount)
          .toString(),
      );
      this.positionManager.buy(quoteAmount, baseAmount);
    } else {
      const baseAmount = new Decimal(
        swapSummary.preBaseTokenAmount
          .sub(swapSummary.postBaseTokenAmount)
          .toString(),
      );
      const quoteAmount = new Decimal(
        swapSummary.postQuoteTokenAmount
          .sub(swapSummary.preQuoteTokenAmount)
          .toString(),
      );
      this.positionManager.sell(baseAmount, quoteAmount);
    }
  }

  private getTaskSummary(): TaskSummary {
    return {
      poolId: this.poolCreation.poolId,
      error: null,
      baseToken: this.poolCreation.baseToken,
      quoteToken: this.poolCreation.quoteToken,
      snipingStartTime: this.startTimestamp,
      snipingEndTime: Date.now() / 1000,
      quoteTokenInAmount: new BN(
        this.positionManager.getTotalInvestment().toString(),
      ),
      quoteTokenOutAmount: new BN(
        this.positionManager.getTotalReturn().toString(),
      ),
      priceSamples: this.priceSamples,
      txnSignatures: this.txnSignatures,
      buyInPrice: this.buyInPrice.toFixed(10),
      initialCashOutPrice: this.initialCashOutPrice?.toFixed(10),
      finalCashOutPrice: this.finalCashOutPrice?.toFixed(10),
    };
  }
}

export type SnipingTaskFactory = (input: SnipingTaskInput) => SnipingTask;

export function defaultSnipingTaskFactory(
  input: SnipingTaskInput,
): SnipingTask {
  return new DefaultSnipingTask(input);
}
