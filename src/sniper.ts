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

async function main() {
  // Handle SIGINT and SIGTERM gracefully.
  async function cleanup() {
    console.log("Cleaning up...");
    await eventSource.stop();
  }
  process.on("SIGINT", async () => {
    await cleanup();
  });
  process.on("SIGTERM", async () => {
    await cleanup();
  });

  console.log(config);
  const recentBlockhash = await solConnection.getLatestBlockhash();
  console.log(recentBlockhash);

  const eventSource = new RaydiumPoolCreationEventSource();
  eventSource.onPoolCreation(async (poolCreation) => {
    console.log(`Pool created! Details: ${inspect(poolCreation)}`);
  });
  await eventSource.start();
}

main();
