import { PoolCreation } from "../common/types";

export interface SnipingTaskDispatcher {
  dispatchSnipingTask(poolUpdate: PoolCreation): Promise<void>;
}

export class SnipingTaskDispatcherImpl implements SnipingTaskDispatcher {
  async dispatchSnipingTask(poolUpdate: PoolCreation): Promise<void> {
    console.log(`Dispatching sniping task for pool update: ${poolUpdate}`);
  }
}
