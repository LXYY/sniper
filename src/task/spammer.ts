import { inspect, sleep } from "../common/utils";
import { ErrAllSpamsFailed, TaskError } from "./errors";

export interface SpammerInput<T> {
  identifier: string;
  intervalMs: number;
  spamCount: number;
  spamFn: (index: number) => Promise<T>;
}

export interface TaskSpammer<T> {
  startSpamming(input: SpammerInput<T>): Promise<T>;

  waitForPendingTasks(): Promise<void>;
}

export class DefaultSpammer<T> implements TaskSpammer<T> {
  private input: SpammerInput<T>;
  private spamResult: T | null;
  private numSpawned: number;
  private numFailed: number;
  private numSucceeded: number;
  private finished: boolean;

  constructor() {
    this.spamResult = null;
    this.finished = false;
    this.numSpawned = 0;
    this.numSucceeded = 0;
    this.numFailed = 0;
  }

  async startSpamming(input: SpammerInput<T>): Promise<T> {
    this.input = input;
    setImmediate(() => this.printProgress());
    for (let i = 0; i < input.spamCount; i++) {
      if (this.spamResult) {
        this.finished = true;
        return this.spamResult;
      }
      this.spawnSpamTask(i);
      await sleep(input.intervalMs);
    }
    return await this.waitForResult();
  }

  async waitForPendingTasks() {
    while (true) {
      const numPendingTasks =
        this.numSpawned - this.numSucceeded - this.numFailed;
      if (numPendingTasks == 0) {
        return;
      }
      console.log(
        `Spammer "${this.input.identifier}": waiting for ${numPendingTasks} pending tasks to finish...`,
      );
      await sleep(3000);
    }
  }

  private spawnSpamTask(index: number) {
    this.numSpawned += 1;
    setImmediate(() => this.runTask(index));
  }

  private async runTask(index: number) {
    try {
      this.spamResult = await this.input.spamFn(index);
      this.numSucceeded += 1;
    } catch (error) {
      // console.error(
      //   `Error: task "${this.input.identifier}" #${index}: ${inspect(error)}`,
      // );
      this.numFailed += 1;
    }
  }

  private async waitForResult(): Promise<T> {
    while (true) {
      if (this.spamResult) {
        this.finished = true;
        return this.spamResult;
      }
      const numPendingTasks =
        this.numSpawned - this.numSucceeded - this.numFailed;
      if (numPendingTasks == 0) {
        this.finished = true;
        throw new ErrAllSpamsFailed(this.input.identifier);
      }
      await sleep(100);
    }
  }

  private async printProgress() {
    while (!this.finished) {
      await sleep(30000);
      console.log(
        `Spammer "${this.input.identifier}": ` +
          `spawned: ${this.numSpawned}, ` +
          `succeeded: ${this.numSucceeded}, ` +
          `failed: ${this.numFailed}`,
      );
    }
  }
}
