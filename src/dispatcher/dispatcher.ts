import { PoolCreation } from "../common/types";
import * as console from "node:console";
import { DispatcherOptions } from "./types";
import { PoolCreationEventSource } from "../event_source/event_source";
import { TaskSummary } from "../task/types";
import { CreatorBlacklist } from "./creator_blacklist";
import { DefaultSnipingTask } from "../task/task";
import { SnipingCriteria } from "../task/sniping_criteria";
import { TokenSwapper, TokenSwapperFactory } from "../trade/swapper";
import { SnipingAnalyticalService } from "../analytical/sniping_analytical_service";
import { inspect } from "../common/utils";
import Decimal from "decimal.js";
import { SnipingPerformanceModel } from "../analytical/types";
import { fromQuoteToken, toQuoteToken } from "../common/spl_token";

export interface SnipingTaskDispatcher {
  start(): Promise<void>;

  stop(): Promise<void>;

  dispatchSnipingTask(poolUpdate: PoolCreation): Promise<void>;

  finalizeTask(summary: TaskSummary): Promise<void>;
}

export class DefaultSnipingTaskDispatcher implements SnipingTaskDispatcher {
  private eventSource: PoolCreationEventSource;
  private creatorBlacklist: CreatorBlacklist;
  private readonly snipingCriteria: SnipingCriteria;
  private readonly tokenSwapperFactory: TokenSwapperFactory;
  private readonly snipingAnalyticalService: SnipingAnalyticalService;
  private cleanupStarted: boolean;

  constructor(opts: DispatcherOptions) {
    this.eventSource = opts.poolCreationEventSource;
    this.creatorBlacklist = opts.creatorBlacklist;
    this.snipingCriteria = opts.snipingCriteria;
    this.tokenSwapperFactory = opts.tokenSwapperFactory;
    this.snipingAnalyticalService = opts.snipingAnalyticalService;
    this.cleanupStarted = false;
    this.eventSource.onPoolCreation(async (poolCreation) => {
      await this.dispatchSnipingTask(poolCreation);
    });
  }

  async dispatchSnipingTask(poolCreation: PoolCreation): Promise<void> {
    if (await this.creatorBlacklist.has(poolCreation.marketCreator)) {
      console.log(
        `Skipping sniping task for blacklisted creator: ${poolCreation.marketCreator}`,
      );
      return;
    }
    console.log(
      `Dispatching sniping task for pool update: ${inspect(poolCreation)}`,
    );
    const task = new DefaultSnipingTask({
      poolCreation,
      snipingCriteria: this.snipingCriteria,
      tokenSwapper: this.tokenSwapperFactory(
        poolCreation.poolId,
        poolCreation.baseToken,
        poolCreation.quoteToken,
      ),
    });
    task.onTaskFinalization(async (summary) => {
      await this.finalizeTask(summary);
    });
    setImmediate(() => task.run());
  }

  async finalizeTask(summary: TaskSummary): Promise<void> {
    this.printTaskSummary(summary);
    await this.snipingAnalyticalService.recordSnipingTaskSummary(summary);
  }

  private printTaskSummary(summary: TaskSummary) {
    if (summary.error) {
      console.log(
        `[Task skipped]  ${summary.baseToken.symbol} due to error: ${summary.error.message}`,
      );
      return;
    }

    const decimalSegment = new Decimal(10).pow(summary.quoteToken.decimals);
    const totalInvestment = new Decimal(
      summary.quoteTokenInAmount.toString(),
    ).div(decimalSegment);
    const totalReturn = new Decimal(summary.quoteTokenOutAmount.toString()).div(
      decimalSegment,
    );
    const pnl = totalReturn.minus(totalInvestment);
    const roi = pnl.div(totalInvestment).times(100);
    console.log(
      `[Task summary] ${summary.baseToken.symbol}` +
        ` invested: ${totalInvestment.toFixed(2)} ${summary.quoteToken.symbol}` +
        ` return: ${totalReturn.toFixed(2)} ${summary.quoteToken.symbol}` +
        ` PnL: ${pnl.toFixed(2)} ${summary.quoteToken.symbol}` +
        ` ROI: ${roi.toFixed(2)} %`,
    );
    console.log(`Buy in price: ${summary.buyInPrice}`);
    console.log(`Initial cash out price: ${summary.initialCashOutPrice}`);
    console.log(`Final cash out price: ${summary.finalCashOutPrice}`);
    console.log(`Price samples: ${inspect(summary.priceSamples)}`);
  }

  private printPerformance(performance: SnipingPerformanceModel) {
    const quoteToken = fromQuoteToken(performance.quoteToken);
    const decimalSegment = new Decimal(10).pow(quoteToken.decimals);
    const totalInvestment = new Decimal(
      performance.totalInvestment.toString(),
    ).div(decimalSegment);
    const totalReturn = new Decimal(performance.totalReturn.toString()).div(
      decimalSegment,
    );
    const pnl = totalReturn.minus(totalInvestment);
    const roi = pnl.div(totalInvestment).times(100);
    console.log(
      `[Performance]` +
        ` invested: ${totalInvestment.toFixed(2)} ${quoteToken.symbol}` +
        ` return: ${totalReturn.toFixed(2)} ${quoteToken.symbol}` +
        ` PnL: ${pnl.toFixed(2)} ${quoteToken.symbol}` +
        ` ROI: ${roi.toFixed(2)} %`,
    );
  }

  async start() {
    await this.eventSource.start();
  }

  async stop() {
    if (this.cleanupStarted) {
      return;
    }
    this.cleanupStarted = true;
    const performance =
      await this.snipingAnalyticalService.getSnipingPerformance();
    this.printPerformance(performance);
    await this.eventSource.stop();
  }
}
