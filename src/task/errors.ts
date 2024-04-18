import { PublicKey } from "@solana/web3.js";

export abstract class TaskError extends Error {
  protected constructor(message: string) {
    super(message);
  }
}

export class ErrSnipingCriteriaNotMet extends TaskError {
  constructor(details: string) {
    super(`Sniping criteria not met: ${details}`);
  }
}

export class ErrSnipingCriteriaMonitorTimeout extends TaskError {
  constructor(timeoutSec: number) {
    super(`Sniping criteria monitor timed out after ${timeoutSec} seconds`);
  }
}

export class ErrRugpullDetected extends TaskError {
  private readonly marketCreator: PublicKey;
  constructor(marketCreator: PublicKey) {
    super(`Rugpull detected. Market creator: ${marketCreator.toBase58()}`);
    this.marketCreator = marketCreator;
  }

  getMarketCreator() {
    return this.marketCreator;
  }
}

export class ErrBuyTxnFailure extends TaskError {
  private readonly txnSignature: string;
  constructor(txnSignature: string, failureDetails: string) {
    super(
      `Buy transaction failed: ${failureDetails}. Txn signature: ${txnSignature}`,
    );
  }
  getTxnSignature() {
    return this.txnSignature;
  }
}

export class ErrAllSpamsFailed extends TaskError {
  constructor(identifier: string) {
    super(`All "${identifier}" spam tasks are failed.`);
  }
}

export class ErrRuntimeError extends TaskError {
  constructor(message: string) {
    super(`Runtime error: ${message}`);
  }
}
