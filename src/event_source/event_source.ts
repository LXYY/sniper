import { PoolCreation } from "../common/types";

export interface PoolCreationEventSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  onPoolCreation(callback: (poolCreation: PoolCreation) => Promise<void>): void;
}
