import { PoolUpdate } from "../common/pool_update";

export interface SnipingTaskDispatcher {
  dispatchSnipingTask(poolUpdate: PoolUpdate): Promise<void>;
}

export class SnipingTaskDispatcherImpl implements SnipingTaskDispatcher {
  async dispatchSnipingTask(poolUpdate: PoolUpdate): Promise<void> {
    console.log(`Dispatching sniping task for pool update: ${poolUpdate}`);
  }
}
