import dotenv from "dotenv";

dotenv.config();

import { RaydiumPoolCreationEventSource } from "./event_source/raydium_event_source";
import { inspect, sleep } from "./common/utils";
import { DefaultSnipingTaskDispatcher } from "./dispatcher/dispatcher";
import { InMemoryCreatorBlacklist } from "./dispatcher/creator_blacklist";
import { RaydiumV4SnipingCriteria } from "./task/sniping_criteria";
import {
  RaydiumV4QuotePayload,
  raydiumV4SwapperFactory,
} from "./trade/raydium_v4_swapper";
import { InMemorySnipingAnalyticalService } from "./analytical/in_memory_analytical_service";
import sniperConfig from "./common/config";
import { fromQuoteToken, SplToken } from "./common/spl_token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { QuoteToken } from "./common/types";
import BN from "bn.js";
import { defaultSnipingTaskFactory } from "./task/task";
import { spamSnipingTaskFactory } from "./task/spam_task";
import bs58 from "bs58";
import { SlotList } from "jito-ts/dist/gen/searcher";
import { getSwapTransaction } from "./common/raydium_utils";
import { sniperPayer } from "./common/payer";
import { bundle } from "jito-ts";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { confirmAndGetTransaction } from "./common/txn_utils";

async function testSwapper() {
  const jitoKeypair = Keypair.fromSecretKey(
    bs58.decode(process.env.JITO_PRIVATE_KEY),
  );
  const client = searcherClient(process.env.JITO_API, jitoKeypair);
  const tipAccounts = await client.getTipAccounts();

  client.onBundleResult(
    (result) => {
      console.log(`${Date.now()}`);
      console.log(`bundle result: ${inspect(result)}`);
    },
    (err) => {
      console.log(`bundle error: ${inspect(err)}`);
      throw err;
    },
  );

  while (true) {
    const nextLeader = await client.getNextScheduledLeader();
    if (nextLeader.currentSlot == nextLeader.nextLeaderSlot) {
      console.log(`Next leader: ${inspect(nextLeader)}`);
      console.log(`Current slot: ${nextLeader.currentSlot} is a JITO slot`);
      break;
    }
    await sleep(200);
  }

  console.log("Submitting txn as a bundle");

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
  let quote = await swapper.getBuyQuote(new BN(1_000_000_000), 5);
  console.log(`buying quote: ${inspect(quote)}`);
  console.log(`[${Date.now()}] start buying`);
  const { poolKeys } = quote.protocolSpecificPayload as RaydiumV4QuotePayload;

  const txn = await getSwapTransaction({
    poolKeys: poolKeys,
    tokenIn: quoteToken,
    tokenOut: baseToken,
    amountIn: quote.amountIn,
    minAmountOut: quote.minAmountOut,
    payer: sniperPayer.publicKey,
    priorityFeeMicroLamports: 0,
    closeSourceAta: false,
  });
  txn.sign([sniperPayer]);

  const bundle = new Bundle([], 2);
  console.log("latest blockhash: ", txn.message.recentBlockhash);
  let maybeBundle: Bundle | Error;
  maybeBundle = bundle.addTransactions(txn);
  if (maybeBundle instanceof Error) {
    throw maybeBundle;
  }

  maybeBundle = bundle.addTipTx(
    sniperPayer,
    10000000,
    new PublicKey(tipAccounts[0]),
    txn.message.recentBlockhash,
  );
  if (maybeBundle instanceof Error) {
    throw maybeBundle;
  }

  const bundleId = await client.sendBundle(maybeBundle);
  console.log(`bundleId: ${bundleId}`);

  const resultTxn = await confirmAndGetTransaction(
    bs58.encode(txn.signatures[0]),
  );
  console.log(`txn: ${inspect(resultTxn)}`);
  //
  // let summary = await swapper.buyToken(quote, {
  //   skipPreflight: false,
  //   priorityFeeInMicroLamports: 5000000,
  // });
  // console.log(`[${Date.now()}] successfully bought`);
  // console.log(`summary: ${inspect(summary)}`);
  // console.log(`preBaseTokenAmount: ${summary.preBaseTokenAmount.toString()}`);
  // console.log(`postBaseTokenAmount: ${summary.postBaseTokenAmount.toString()}`);
  // console.log(`preQuoteTokenAmount: ${summary.preQuoteTokenAmount.toString()}`);
  // console.log(
  //   `postQuoteTokenAmount: ${summary.postQuoteTokenAmount.toString()}`,
  // );
  //
  // // const sellAmount = summary.postBaseTokenAmount.sub(
  // //   summary.preBaseTokenAmount,
  // // );
  // const sellAmount = summary.postBaseTokenAmount;
  // // const sellAmount = new BN("13014245680");
  // quote = await swapper.getSellQuote(sellAmount, 5);
  // console.log(`selling quote: ${inspect(quote)}`);
  // console.log(
  //   `[${Date.now()}] start selling, amount: ${sellAmount.toString()}`,
  // );
  // summary = await swapper.sellToken(quote, {
  //   skipPreflight: false,
  //   priorityFeeInMicroLamports: 5000000,
  // });
  // console.log(`[${Date.now()}] successfully sold`);
  // console.log(`summary: ${inspect(summary)}`);
  // console.log(`preBaseTokenAmount: ${summary.preBaseTokenAmount.toString()}`);
  // console.log(`postBaseTokenAmount: ${summary.postBaseTokenAmount.toString()}`);
  // console.log(`preQuoteTokenAmount: ${summary.preQuoteTokenAmount.toString()}`);
  // console.log(
  //   `postQuoteTokenAmount: ${summary.postQuoteTokenAmount.toString()}`,
  // );
}

function getEstimatedCoverage(leaders: { [p: string]: SlotList }) {
  const allSlots = Object.values(leaders).flatMap((slotList) => slotList.slots);
  const minSlot = Math.min(...allSlots);
  const maxSlot = Math.max(...allSlots);
  const slotRange = maxSlot - minSlot + 1;
  return allSlots.length / slotRange;
}

async function testJitoClient() {
  const jitoKeypair = Keypair.fromSecretKey(
    bs58.decode(process.env.JITO_PRIVATE_KEY),
  );
  const client = searcherClient(process.env.JITO_API, jitoKeypair);

  const slotSet = new Set<number>();
  let startSet = 0;
  let endSet = 0;
  for (let i = 0; i < 1000; i++) {
    const nextLeader = await client.getNextScheduledLeader();
    console.log(
      `#${i} next leader: ${Date.now().toFixed(0)}, ${inspect(nextLeader)}`,
    );
    if (startSet == 0) {
      startSet = nextLeader.currentSlot;
    }
    endSet = nextLeader.currentSlot;

    if (nextLeader.currentSlot == nextLeader.nextLeaderSlot) {
      slotSet.add(nextLeader.currentSlot);
    } else {
      for (let i = 0; i < 4; i++) {
        slotSet.add(nextLeader.nextLeaderSlot + i);
      }
    }

    await sleep(50);
  }

  const ratio = slotSet.size / (endSet - startSet + 1);
  console.log(`jito ratio: ${ratio.toFixed(2)}`);
}

async function main() {
  console.log(inspect(sniperConfig));

  // await testJitoClient();

  await testSwapper();

  // // Handle SIGINT and SIGTERM gracefully.
  // async function cleanup() {
  //   await dispatcher.stop();
  // }
  //
  // process.on("SIGINT", () => {
  //   cleanup();
  // });
  // process.on("SIGTERM", () => {
  //   cleanup();
  // });
  //
  // const dispatcher = new DefaultSnipingTaskDispatcher({
  //   poolCreationEventSource: new RaydiumPoolCreationEventSource(),
  //   creatorBlacklist: new InMemoryCreatorBlacklist(),
  //   snipingCriteria: new RaydiumV4SnipingCriteria(),
  //   tokenSwapperFactory: raydiumV4SwapperFactory,
  //   // snipingTaskFactory: defaultSnipingTaskFactory,
  //   snipingTaskFactory: spamSnipingTaskFactory,
  //   snipingAnalyticalService: new InMemorySnipingAnalyticalService(),
  // });
  // await dispatcher.start();
}

main();
