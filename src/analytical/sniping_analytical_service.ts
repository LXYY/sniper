import { TaskSummary } from "../task/types";
import { SnipingPerformanceModel, SnipingTaskSummaryModel } from "./types";

export interface SnipingAnalyticalService {
  recordSnipingTaskSummary(taskSummary: TaskSummary): Promise<void>;

  getSnipingTaskSummaries(): Promise<SnipingTaskSummaryModel[]>;

  getSnipingPerformance(): Promise<SnipingPerformanceModel>;
}
