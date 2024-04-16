import { SnipingTask, SnipingTaskInput } from "./task";
import { TaskSummary } from "./types";

export class SpamSnipingTask implements SnipingTask {
  constructor(input: SnipingTaskInput) {}

  async onTaskFinalization(callback: (summary: TaskSummary) => Promise<void>) {}

  async run() {
    return Promise.resolve(undefined);
  }
}
