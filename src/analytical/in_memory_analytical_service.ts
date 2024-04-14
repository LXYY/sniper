import { SnipingAnalyticalService } from "./sniping_analytical_service";
import { TaskSummary } from "../task/types";
import { SnipingPerformanceModel, SnipingTaskSummaryModel } from "./types";
import { toQuoteToken } from "../common/spl_token";
import { createBigInt } from "@metaplex-foundation/umi";
import { QuoteToken } from "../common/types";

export class InMemorySnipingAnalyticalService
  implements SnipingAnalyticalService
{
  private readonly taskSummaries: SnipingTaskSummaryModel[] = [];

  async recordSnipingTaskSummary(taskSummary: TaskSummary): Promise<void> {
    this.taskSummaries.push(this.toTaskSummaryModel(taskSummary));
  }

  async getSnipingTaskSummaries(): Promise<SnipingTaskSummaryModel[]> {
    return this.taskSummaries;
  }

  async getSnipingPerformance(): Promise<SnipingPerformanceModel> {
    // TODO: This is a naive implementation. We should consider supporting multiple quote tokens.
    const totalInvestment = this.taskSummaries.reduce(
      (acc, taskSummary) => acc + taskSummary.investment,
      BigInt(0),
    );
    const totalReturn = this.taskSummaries.reduce(
      (acc, taskSummary) => acc + taskSummary.return,
      BigInt(0),
    );
    let quoteToken: QuoteToken;
    if (this.taskSummaries.length === 0) {
      quoteToken = QuoteToken.SOL;
    } else {
      quoteToken = this.taskSummaries[0].quoteToken;
    }
    return {
      quoteToken: quoteToken,
      totalInvestment: createBigInt(totalInvestment.toString()),
      totalReturn: createBigInt(totalReturn.toString()),
    };
  }

  private toTaskSummaryModel(
    taskSummary: TaskSummary,
  ): SnipingTaskSummaryModel {
    return {
      mint: taskSummary.baseToken.mintAddress.toBase58(),
      symbol: taskSummary.baseToken.symbol,
      name: taskSummary.baseToken.name,
      poolId: taskSummary.poolId.toBase58(),
      started: taskSummary.snipingStartTime,
      ended: taskSummary.snipingEndTime,
      errorDetails: taskSummary.error?.message,
      quoteToken: toQuoteToken(taskSummary.quoteToken),
      investment: BigInt(taskSummary.quoteTokenInAmount.toString()),
      return: BigInt(taskSummary.quoteTokenOutAmount.toString()),
    };
  }
}
