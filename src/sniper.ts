import dotenv from "dotenv";

dotenv.config();

import { RaydiumPoolCreationEventSource } from "./event_source/raydium_event_source";
import { inspect } from "./common/utils";
import { DefaultSnipingTaskDispatcher } from "./dispatcher/dispatcher";
import { InMemoryCreatorBlacklist } from "./dispatcher/creator_blacklist";
import { RaydiumV4SnipingCriteria } from "./task/sniping_criteria";
import { raydiumV4SwapperFactory } from "./trade/raydium_v4_swapper";
import { InMemorySnipingAnalyticalService } from "./analytical/in_memory_analytical_service";
import sniperConfig from "./common/config";

async function main() {
  console.log(inspect(sniperConfig));

  // Handle SIGINT and SIGTERM gracefully.
  async function cleanup() {
    await dispatcher.stop();
  }

  process.on("SIGINT", () => {
    cleanup();
  });
  process.on("SIGTERM", () => {
    cleanup();
  });

  const dispatcher = new DefaultSnipingTaskDispatcher({
    poolCreationEventSource: new RaydiumPoolCreationEventSource(),
    creatorBlacklist: new InMemoryCreatorBlacklist(),
    snipingCriteria: new RaydiumV4SnipingCriteria(),
    tokenSwapperFactory: raydiumV4SwapperFactory,
    snipingAnalyticalService: new InMemorySnipingAnalyticalService(),
  });
  await dispatcher.start();
}

main();
