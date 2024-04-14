import { PoolCreation } from "../common/types";
import { Price, SnipingCriteriaInput, TaskSummary } from "./types";
import { SnipingCriteria } from "./sniping_criteria";
import { ErrRuntimeError, TaskError } from "./errors";
import BN from "bn.js";
import {
  PositionManager,
  DefaultPositionManager,
} from "../trade/position_manager";
import sniperConfig from "../common/config";
import { PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import solConnection from "../common/sol_connection";
import { sleep, uiAmountToBN } from "../common/utils";
import { SplToken } from "../common/spl_token";
import { SwapSummary, SwapTxnType, TokenSwapper } from "../trade/swapper";
import Decimal from "decimal.js";

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
        this.getSnipingCriteriaInput(),
      );
      await this.buyIn();
      await this.initialCashOut();
      await this.hardCashOut();
      await this.taskFinalizationCallback(this.getTaskSummary());
    } catch (error) {
      await this.taskFinalizationCallback(
        this.getTaskSummaryFromError(this.getTaskError(error)),
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

  private async buyIn() {
    const buyInAmount = await this.getBuyInAmount();
    const slippage = sniperConfig.strategy.buySlippage;
    const quote = await this.tokenSwapper.getBuyQuote(buyInAmount, slippage);
    this.buyInTimestamp = Date.now() / 1000;
    const buyInSummary = await this.tokenSwapper.buyToken(
      buyInAmount,
      quote.minOutAmount,
      {
        skipPreflight: false,
        priorityFeeInMicroLamports: sniperConfig.strategy.buyFeeMicroLamports,
      },
    );
    this.buyInTimestamp = Date.now() / 1000;
    this.buyInPrice = quote.baseTokenPrice;
    this.updatePosition(buyInSummary);
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
    // Only sample per second.
    // TODO: make this configurable.
    if (
      this.priceSamples.length > 0 &&
      now - this.priceSamples[0].timestamp < 5
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
        .mul(strategyConfig.takeProfitPercentage)
        .div(100)
        .floor()
        .toString(),
    );
    const quote = await this.tokenSwapper.getSellQuote(
      takeProfitAmount,
      strategyConfig.sellSlippage,
    );
    const averagePrice = new Decimal(quote.minOutAmount.toString()).div(
      takeProfitAmount.toString(),
    );
    const unrealizedRoi =
      this.positionManager.getUnrealizedRoi(averagePrice) * 100;
    if (unrealizedRoi < strategyConfig.takeProfitPercentage) {
      return false;
    }
    const swapSummary = await this.tokenSwapper.sellToken(
      takeProfitAmount,
      quote.minOutAmount,
      {
        skipPreflight: false,
        priorityFeeInMicroLamports: sniperConfig.strategy.sellFeeMicroLamports,
      },
    );
    this.initialCashOutPrice = quote.baseTokenPrice;
    this.updatePosition(swapSummary);
    return true;
  }

  private async tryCutLoss(): Promise<boolean> {
    const strategyConfig = sniperConfig.strategy;
    const position = this.positionManager.getCurrentPosition();
    const stopLossAmount = new BN(
      position
        .mul(strategyConfig.stopLossPercentage)
        .div(100)
        .floor()
        .toString(),
    );
    const quote = await this.tokenSwapper.getSellQuote(
      stopLossAmount,
      strategyConfig.sellSlippage,
    );
    const averagePrice = new Decimal(quote.minOutAmount.toString()).div(
      stopLossAmount.toString(),
    );
    const unrealizedRoi =
      this.positionManager.getUnrealizedRoi(averagePrice) * 100;
    if (unrealizedRoi > -strategyConfig.stopLossPercentage) {
      return false;
    }
    const swapSummary = await this.tokenSwapper.sellToken(
      stopLossAmount,
      quote.minOutAmount,
      {
        skipPreflight: false,
        priorityFeeInMicroLamports: sniperConfig.strategy.sellFeeMicroLamports,
      },
    );
    this.initialCashOutPrice = quote.baseTokenPrice;
    this.updatePosition(swapSummary);
    return true;
  }

  private async hardCashOut() {
    const timeToSleep = this.getHardCashOutTime() - Date.now() / 1000;
    if (timeToSleep > 0) {
      await sleep(timeToSleep * 1000);
    }
    await this.sellAll();
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
      position,
      quote.minOutAmount,
      {
        skipPreflight: false,
        priorityFeeInMicroLamports: sniperConfig.strategy.sellFeeMicroLamports,
      },
    );
    this.finalCashOutPrice = quote.baseTokenPrice;
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

  private getSnipingCriteriaInput(): SnipingCriteriaInput {
    const initialPoolState = this.poolCreation.initialPoolState;
    return {
      poolId: this.poolCreation.poolId,
      baseToken: this.poolCreation.baseToken,
      quoteToken: this.poolCreation.quoteToken,
      baseVault: initialPoolState.baseVault,
      quoteVault: initialPoolState.quoteVault,
      lpVault: initialPoolState.lpVault,
      lpMint: initialPoolState.lpMint,
    };
  }

  private getTaskSummaryFromError(error: TaskError): TaskSummary {
    return {
      poolId: this.poolCreation.poolId,
      error,
      baseToken: this.poolCreation.baseToken,
      quoteToken: this.poolCreation.quoteToken,
      snipingStartTime: this.startTimestamp,
      snipingEndTime: Date.now() / 1000,
      quoteTokenInAmount: new BN(0),
      quoteTokenOutAmount: new BN(0),
      priceSamples: [],
      txnSignatures: [],
      buyInPrice: "0",
      initialCashOutPrice: "0",
    };
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
      initialCashOutPrice: this.initialCashOutPrice.toFixed(10),
      finalCashOutPrice: this.finalCashOutPrice?.toFixed(10),
    };
  }

  private getTaskError(error: Error): TaskError {
    let taskError: TaskError;
    if (!(error instanceof TaskError)) {
      taskError = new ErrRuntimeError(error.message);
    } else {
      taskError = error;
    }
    return taskError;
  }
}
