import { PoolCreationEventSource } from "../event_source/event_source";
import { CreatorBlacklist } from "./creator_blacklist";
import { SnipingCriteria } from "../task/sniping_criteria";
import { TokenSwapperFactory } from "../trade/swapper";
import { SnipingAnalyticalService } from "../analytical/sniping_analytical_service";
import { SnipingTaskFactory } from "../task/task";

export interface DispatcherOptions {
  poolCreationEventSource: PoolCreationEventSource;
  creatorBlacklist: CreatorBlacklist;
  snipingCriteria: SnipingCriteria;
  tokenSwapperFactory: TokenSwapperFactory;
  snipingTaskFactory: SnipingTaskFactory;
  snipingAnalyticalService: SnipingAnalyticalService;
}
