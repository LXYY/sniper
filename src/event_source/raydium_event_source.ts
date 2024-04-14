import { PoolCreationEventSource } from "./event_source";
import { PoolCreation } from "../common/types";
import geyserClient from "../common/geyser_client";
import solConnection from "../common/sol_connection";
import {
  Liquidity,
  MAINNET_PROGRAM_ID,
  RAYDIUM_MAINNET,
} from "@raydium-io/raydium-sdk";
import {
  AccountCreationMonitor,
  DefaultAccountCreationMonitor,
} from "../monitor/account_creation_monitor";
import sniperConfig from "../common/config";
import {
  extractInstructions,
  confirmAndGetTransaction,
  programInvokedFromLogs,
} from "../common/txn_utils";
import {
  tryGetMarketCreationFromInstruction,
  tryGetOpenbookMarketCreationIxn,
} from "../common/openbook_utils";
import { PublicKey } from "@solana/web3.js";
import { MarketCreation } from "../common/types";
import {
  getPoolCreationFromRaydiumV4,
  getRaydiumV4LiquidityStateFromData,
} from "../common/raydium_utils";
import { inspect } from "../common/utils";
import NodeCache from "node-cache";
import { ClientReadableStream } from "@grpc/grpc-js";
import { TimestampedAccountUpdate } from "../gen/geyser/geyser";
import { backOff } from "exponential-backoff";

// Define type for pool creation callback
export type PoolCreationCallback = (
  poolCreation: PoolCreation,
) => Promise<void>;

export class RaydiumPoolCreationEventSource implements PoolCreationEventSource {
  private openbookSubscriptionId: number;
  private poolCreationMonitor: AccountCreationMonitor;
  private poolCreationCallback: PoolCreationCallback;
  private txnCache: NodeCache;

  constructor() {
    this.poolCreationMonitor = new DefaultAccountCreationMonitor(
      sniperConfig.monitor.poolCreationMonitorPollIntervalMs,
      sniperConfig.monitor.poolCreationMonitorTimeout,
    );
    this.txnCache = new NodeCache({
      stdTTL: 10 * 60,
    });
  }

  async start() {
    const openbookProgramIdString =
      MAINNET_PROGRAM_ID.OPENBOOK_MARKET.toBase58();
    this.openbookSubscriptionId = solConnection.onLogs(
      MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
      async (logs, ctx) => {
        // Ignore error transactions.
        if (logs.err || this.txnCache.has(logs.signature)) {
          return;
        }
        // Prefilter the logs to reduce the number of transactions to process.
        if (!programInvokedFromLogs(openbookProgramIdString, logs.logs)) {
          return;
        }
        this.txnCache.set(logs.signature, true);
        await this.handleOpenbookTxn(logs.signature);
      },
      "processed",
    );
    setImmediate(() => this.poolCreationMonitor.start());
  }

  async stop() {
    await solConnection.removeOnLogsListener(this.openbookSubscriptionId);
    await this.poolCreationMonitor.stop();
  }

  async handleOpenbookTxn(txnSignature: string) {
    const txn = await backOff(() => confirmAndGetTransaction(txnSignature), {
      numOfAttempts: 1,
    });
    if (!txn) {
      return;
    }
    const ixns = extractInstructions(txn);
    const marketCreationIxn = tryGetOpenbookMarketCreationIxn(ixns);
    if (!marketCreationIxn) {
      return;
    }
    const marketCreation = await tryGetMarketCreationFromInstruction(
      marketCreationIxn,
      txn,
    );
    if (!marketCreation) {
      return;
    }
    console.log(`Market creation detected: ${inspect(marketCreation)}`);
    const lpPoolAccount = Liquidity.getAssociatedId({
      programId: MAINNET_PROGRAM_ID.AmmV4,
      marketId: marketCreation.marketId,
    });
    this.poolCreationMonitor.registerAccount(
      lpPoolAccount,
      (poolKey: PublicKey, poolAccountData: Buffer) =>
        this.onPoolAccountCreation(poolKey, poolAccountData, marketCreation),
      this.onPoolAccountMonitorTimeout,
    );
  }

  private async onPoolAccountCreation(
    poolKey: PublicKey,
    poolAccountData: Buffer,
    marketCreation: MarketCreation,
  ) {
    const poolState = getRaydiumV4LiquidityStateFromData(poolAccountData);
    const poolCreation = getPoolCreationFromRaydiumV4(
      poolKey,
      poolState,
      marketCreation,
    );
    setImmediate(() => this.poolCreationCallback(poolCreation));
  }

  private async onPoolAccountMonitorTimeout(poolKey: PublicKey) {
    console.log(
      `Pool account creation monitoring timeout: ${poolKey.toString()}`,
    );
  }

  onPoolCreation(callback: PoolCreationCallback) {
    this.poolCreationCallback = callback;
  }
}
