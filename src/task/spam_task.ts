import { SnipingTask, SnipingTaskInput } from "./task";
import { TaskSummary } from "./types";
import {
  getExecutionPriceFromSummary,
  getSnipingCriteriaInput,
  getTaskSummaryFromError,
  printSwapSummary,
} from "./utils";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import BN from "bn.js";
import sniperConfig from "../common/config";
import { inspect, rawAmountToDecimal, uiAmountToBN } from "../common/utils";
import {
  getSolBalanceChange,
  getSolTransferTransaction,
  sendAndConfirmTransaction,
} from "../common/txn_utils";
import { sniperPayer } from "../common/payer";
import { DefaultSpammer, SpammerInput } from "./spammer";
import { getPoolKeysFromMarketId } from "../common/raydium_utils";
import { Quote, SwapSummary, SwapTxnType } from "../trade/swapper";
import Decimal from "decimal.js";
import solConnection from "../common/sol_connection";
import { backOff } from "exponential-backoff";

export class SpamSnipingTask implements SnipingTask {
  private taskFinalizationCallback: (summary: TaskSummary) => Promise<void>;
  private input: SnipingTaskInput;
  private snipingWallet: Keypair;
  private snipingStartTime: number;
  private initialized: boolean;
  private investedAmount: BN;
  private returnAmount: BN;
  private readonly buyInSpammer: DefaultSpammer<SwapSummary>;
  private readonly cashOutSpammer: DefaultSpammer<SwapSummary>;
  private buyInSwapSummary?: SwapSummary;
  private cashOutSwapSummary?: SwapSummary;

  constructor(input: SnipingTaskInput) {
    this.input = input;
    this.snipingStartTime = 0;
    this.initialized = false;
    this.snipingWallet = Keypair.generate();
    this.investedAmount = new BN(0);
    this.returnAmount = new BN(0);
    this.buyInSpammer = new DefaultSpammer<SwapSummary>();
    this.cashOutSpammer = new DefaultSpammer<SwapSummary>();
  }

  async onTaskFinalization(callback: (summary: TaskSummary) => Promise<void>) {
    this.taskFinalizationCallback = callback;
  }

  async run() {
    let err: Error | undefined;
    try {
      await this.input.snipingCriteria.waitUntilSatisfied(
        getSnipingCriteriaInput(this.input.poolCreation),
      );
      await this.initialize();
      await this.buyIn();
      await this.cashOut();
    } catch (error) {
      err = error;
    }
    const taskSummary = await this.finalize(err);
    await this.taskFinalizationCallback(taskSummary);
  }

  private async initialize() {
    this.snipingStartTime = Date.now() / 1000;
    const transferAmount = this.getSnipingWalletBalance();
    console.log(
      `Initializing sniping wallet: ${this.snipingWallet.publicKey},` +
        ` private key: ${bs58.encode(this.snipingWallet.secretKey)},` +
        ` with SOL amount ${rawAmountToDecimal(transferAmount, this.input.poolCreation.quoteToken.decimals).toFixed(2)}.`,
    );
    while (true) {
      try {
        const transferTxn = await getSolTransferTransaction(
          transferAmount,
          sniperPayer.publicKey,
          this.snipingWallet.publicKey,
        );
        const parsedTxn = await sendAndConfirmTransaction(transferTxn, false);
        this.investedAmount = getSolBalanceChange(
          parsedTxn,
          sniperPayer.publicKey,
        );
        console.log(
          `Sniping wallet: ${this.snipingWallet.publicKey.toBase58()} initialized.`,
        );
        this.initialized = true;
        return;
      } catch (error) {
        console.log(
          `Failed to initializing sniping wallet ${this.snipingWallet.publicKey.toBase58()}, error: ${inspect(error)}`,
        );
      }
    }
  }

  private async buyIn() {
    await this.ensurePoolNotExist();
    const baseDecimals = this.input.poolCreation.baseToken.decimals;
    const quoteDecimals = this.input.poolCreation.quoteToken.decimals;
    const poolKeys = await getPoolKeysFromMarketId(
      this.input.poolCreation.marketId,
      baseDecimals,
      quoteDecimals,
    );
    const quote: Quote = {
      amountIn: uiAmountToBN(sniperConfig.spam.buyInAmount, quoteDecimals),
      // Set to the minimum non-zero value.
      minAmountOut: new BN(1),
      baseTokenPrice: new Decimal(0),
      protocolSpecificPayload: {
        poolKeys,
      },
    };
    const spammerInput: SpammerInput<SwapSummary> = {
      identifier: this.getSpammerIdentifier(SwapTxnType.BUY),
      intervalMs: sniperConfig.spam.intervalMs,
      spamCount:
        (sniperConfig.spam.timeoutSec * 1000) / sniperConfig.spam.intervalMs,
      spamFn: async (index: number) => {
        return await this.input.tokenSwapper.buyToken(quote, {
          skipPreflight: true,
          priorityFeeInMicroLamports: 0,
          payer: this.snipingWallet,
        });
      },
    };
    this.buyInSwapSummary = await this.buyInSpammer.startSpamming(spammerInput);
    printSwapSummary(this.buyInSwapSummary);
  }

  private async cashOut() {
    const baseDecimals = this.input.poolCreation.baseToken.decimals;
    const quoteDecimals = this.input.poolCreation.quoteToken.decimals;
    const poolKeys = await getPoolKeysFromMarketId(
      this.input.poolCreation.marketId,
      baseDecimals,
      quoteDecimals,
    );
    const quote: Quote = {
      amountIn: this.buyInSwapSummary.postBaseTokenAmount,
      // Set to the minimum non-zero value.
      minAmountOut: new BN(1),
      baseTokenPrice: new Decimal(0),
      protocolSpecificPayload: {
        poolKeys,
      },
    };
    const spammerInput: SpammerInput<SwapSummary> = {
      identifier: this.getSpammerIdentifier(SwapTxnType.SELL),
      intervalMs: sniperConfig.spam.intervalMs,
      spamCount: sniperConfig.spam.numCashOutTxns,
      spamFn: async (index: number) => {
        return await this.input.tokenSwapper.sellToken(quote, {
          skipPreflight: true,
          priorityFeeInMicroLamports: 0,
          payer: this.snipingWallet,
        });
      },
    };
    this.cashOutSwapSummary =
      await this.cashOutSpammer.startSpamming(spammerInput);
    printSwapSummary(this.cashOutSwapSummary);
  }

  private async finalize(err?: Error): Promise<TaskSummary> {
    if (!this.initialized) {
      return this.getTaskSummary(err);
    }

    // Wait until all the pending transactions are settled.
    await this.buyInSpammer.waitForPendingTasks();
    await this.cashOutSpammer.waitForPendingTasks();

    const snipingWalletBalanceAfterFee = new BN(
      await backOff(() =>
        solConnection.getBalance(this.snipingWallet.publicKey),
      ),
    ).subn(5000);

    console.log(
      `Finalizing sniping task, transferring ${rawAmountToDecimal(
        snipingWalletBalanceAfterFee,
        this.input.poolCreation.quoteToken.decimals,
      ).toFixed(2)} SOL back to payer.`,
    );

    while (true) {
      console.log(`Private key: ${bs58.encode(this.snipingWallet.secretKey)}`);
      try {
        const transferTxn = await getSolTransferTransaction(
          snipingWalletBalanceAfterFee,
          this.snipingWallet.publicKey,
          sniperPayer.publicKey,
        );
        const parsedTxn = await sendAndConfirmTransaction(
          transferTxn,
          false,
          this.snipingWallet,
        );
        this.returnAmount = getSolBalanceChange(
          parsedTxn,
          sniperPayer.publicKey,
        );
        console.log(
          `Sniping wallet: ${this.snipingWallet.publicKey.toBase58()} finalized.`,
        );
        break;
      } catch (error) {
        console.log(
          `Failed to finalizing sniping wallet ${this.snipingWallet.publicKey.toBase58()}, error: ${inspect(error)}`,
        );
        console.log(
          `Private key: ${bs58.encode(this.snipingWallet.secretKey)}`,
        );
      }
    }

    return this.getTaskSummary(err);
  }

  private getTaskSummary(err?: Error): TaskSummary {
    if (err) {
      const taskSummary = getTaskSummaryFromError(err, this.input.poolCreation);
      taskSummary.snipingStartTime = this.snipingStartTime;
      taskSummary.quoteTokenInAmount = this.investedAmount;
      taskSummary.quoteTokenOutAmount = this.returnAmount;
      return taskSummary;
    }
    return {
      poolId: this.input.poolCreation.poolId,
      baseToken: this.input.poolCreation.baseToken,
      quoteToken: this.input.poolCreation.quoteToken,
      snipingStartTime: this.snipingStartTime,
      snipingEndTime: Date.now() / 1000,
      quoteTokenInAmount: this.investedAmount,
      quoteTokenOutAmount: this.returnAmount,
      priceSamples: [],
      txnSignatures: [
        this.buyInSwapSummary.txnSignature,
        this.cashOutSwapSummary.txnSignature,
      ],
      buyInPrice: getExecutionPriceFromSummary(this.buyInSwapSummary).toFixed(
        10,
      ),
      initialCashOutPrice: getExecutionPriceFromSummary(
        this.cashOutSwapSummary,
      ).toFixed(10),
    };
  }

  private getSnipingWalletBalance(): BN {
    const requiredAmount = sniperConfig.spam.buyInAmount + 0.05;
    return uiAmountToBN(
      requiredAmount,
      this.input.poolCreation.quoteToken.decimals,
    );
  }

  private getSpammerIdentifier(txnType: SwapTxnType): string {
    return `${this.input.poolCreation.baseToken.symbol}/${txnType}`;
  }

  private async ensurePoolNotExist() {
    const poolId = this.input.poolCreation.poolId;
    const accountInfo = await solConnection.getAccountInfo(poolId, "processed");
    if (accountInfo) {
      throw new Error(
        `Pool ${poolId.toBase58()} already exists, aborting sniping task.`,
      );
    }
  }
}

export function spamSnipingTaskFactory(input: SnipingTaskInput): SnipingTask {
  return new SpamSnipingTask(input);
}
