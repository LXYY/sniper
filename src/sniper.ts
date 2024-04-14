import dotenv from "dotenv";

dotenv.config();

import config from "./common/config";
import solConnection from "./common/sol_connection";
import geyserClient from "./common/geyser_client";
import { PublicKey } from "@solana/web3.js";
import { LIQUIDITY_STATE_LAYOUT_V4 } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { SlotUpdateStatus } from "./gen/geyser/geyser";
import { RaydiumPoolCreationEventSource } from "./event_source/raydium_event_source";
import { inspect } from "./common/utils";
import { DefaultSnipingTaskDispatcher } from "./dispatcher/dispatcher";
import { InMemoryCreatorBlacklist } from "./dispatcher/creator_blacklist";
import { RaydiumV4SnipingCriteria } from "./task/sniping_criteria";
import {
  RaydiumV4Swapper,
  raydiumV4SwapperFactory,
} from "./trade/raydium_v4_swapper";
import { InMemorySnipingAnalyticalService } from "./analytical/in_memory_analytical_service";
import sniperConfig from "./common/config";

async function main() {
  console.log(inspect(sniperConfig));
  // Handle SIGINT and SIGTERM gracefully.
  async function cleanup() {
    console.log("Cleaning up...");
    await dispatcher.stop();
  }
  process.on("SIGINT", async () => {
    await cleanup();
  });
  process.on("SIGTERM", async () => {
    await cleanup();
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
