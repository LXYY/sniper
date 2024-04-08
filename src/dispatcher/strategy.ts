import { PoolUpdate } from "../common/pool_update";
import { EventEmitter } from "events";

export interface DispatcherStrategy {
  shouldSkip(poolUpdate: PoolUpdate): boolean;
  eventEmitter: EventEmitter;
}

export enum DispatcherStrategyEventType {
  POOL_RUGGED = "POOL_RUGGED",
}

export interface PoolRuggedEventPayload {
  poolCreationTxnSignature: string;
}

export class DefaultDispatcherStrategy implements DispatcherStrategy {
  eventEmitter: EventEmitter;

  constructor() {
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.on(
      DispatcherStrategyEventType.POOL_RUGGED,
      async (payload: PoolRuggedEventPayload) => {
        await this.processPoolRuggedEvent(payload);
      },
    );
  }

  shouldSkip(poolUpdate: PoolUpdate): boolean {
    return false;
  }

  async processPoolRuggedEvent(payload: PoolRuggedEventPayload): Promise<void> {
    // TODO: implement me.
    console.log(
      `Processing pool rugged event for pool creation txn: ${payload.poolCreationTxnSignature}`,
    );
  }
}
