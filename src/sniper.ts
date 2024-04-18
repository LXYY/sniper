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
import { fromQuoteToken, SplToken } from "./common/spl_token";
import { PublicKey } from "@solana/web3.js";
import { QuoteToken } from "./common/types";
import BN from "bn.js";
import { defaultSnipingTaskFactory } from "./task/task";
import { spamSnipingTaskFactory } from "./task/spam_task";

async function testSwapper() {
  const poolId = new PublicKey("BGS69Ju7DRRVxw9b2B5TnrMLzVdJcscV8UtKywqNsgwx");
  const tokenMintAddress = new PublicKey(
    "HLptm5e6rTgh4EKgDpYFrnRHbjpkMyVdEeREEa2G7rf9",
  );
  const baseToken: SplToken = {
    mintAddress: tokenMintAddress,
    decimals: 6,
    mintDisabled: true,
    freezeDisabled: true,
    name: "DUKO",
    symbol: "DUKO",
  };
  const quoteToken = fromQuoteToken(QuoteToken.SOL);
  const swapper = raydiumV4SwapperFactory(poolId, baseToken, quoteToken);
  let quote = await swapper.getBuyQuote(new BN(100000000), 5);
  console.log(`buying quote: ${inspect(quote)}`);
  console.log(`[${Date.now()}] start buying`);
  let summary = await swapper.buyToken(quote, {
    skipPreflight: false,
    priorityFeeInMicroLamports: 5000000,
  });
  console.log(`[${Date.now()}] successfully bought`);
  console.log(`summary: ${inspect(summary)}`);
  console.log(`preBaseTokenAmount: ${summary.preBaseTokenAmount.toString()}`);
  console.log(`postBaseTokenAmount: ${summary.postBaseTokenAmount.toString()}`);
  console.log(`preQuoteTokenAmount: ${summary.preQuoteTokenAmount.toString()}`);
  console.log(
    `postQuoteTokenAmount: ${summary.postQuoteTokenAmount.toString()}`,
  );

  // const sellAmount = summary.postBaseTokenAmount.sub(
  //   summary.preBaseTokenAmount,
  // );
  const sellAmount = summary.postBaseTokenAmount;
  // const sellAmount = new BN("13014245680");
  quote = await swapper.getSellQuote(sellAmount, 5);
  console.log(`selling quote: ${inspect(quote)}`);
  console.log(
    `[${Date.now()}] start selling, amount: ${sellAmount.toString()}`,
  );
  summary = await swapper.sellToken(quote, {
    skipPreflight: false,
    priorityFeeInMicroLamports: 5000000,
  });
  console.log(`[${Date.now()}] successfully sold`);
  console.log(`summary: ${inspect(summary)}`);
  console.log(`preBaseTokenAmount: ${summary.preBaseTokenAmount.toString()}`);
  console.log(`postBaseTokenAmount: ${summary.postBaseTokenAmount.toString()}`);
  console.log(`preQuoteTokenAmount: ${summary.preQuoteTokenAmount.toString()}`);
  console.log(
    `postQuoteTokenAmount: ${summary.postQuoteTokenAmount.toString()}`,
  );
}

async function main() {
  console.log(inspect(sniperConfig));

  // await testSwapper();

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
    // snipingTaskFactory: defaultSnipingTaskFactory,
    snipingTaskFactory: spamSnipingTaskFactory,
    snipingAnalyticalService: new InMemorySnipingAnalyticalService(),
  });
  await dispatcher.start();
}

main();
