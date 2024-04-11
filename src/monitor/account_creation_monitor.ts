import { PublicKey } from "@solana/web3.js";
import { sleep } from "../common/utils";
import solConnection from "../common/sol_connection";

interface AccountCallbacks {
  registerTimestamp: number;
  onCreation: (accountKey: PublicKey, accountData: Buffer) => Promise<void>;
  onExpire: (accountKey: PublicKey) => Promise<void>;
}

export interface AccountCreationMonitor {
  start(): Promise<void>;

  stop(): Promise<void>;

  registerAccount(
    account: PublicKey,
    onCreation: (accountKey: PublicKey, accountData: Buffer) => Promise<void>,
    onExpire: (accountKey: PublicKey) => Promise<void>,
  ): void;
}

export class DefaultAccountCreationMonitor implements AccountCreationMonitor {
  private readonly accountCallbacks: Map<PublicKey, AccountCallbacks>;
  private readonly pollIntervalMs: number;
  private readonly expirationTimeSec: number;
  private stopped = false;

  constructor(pollIntervalMs: number, expirationTimeSec: number) {
    this.pollIntervalMs = pollIntervalMs;
    this.expirationTimeSec = expirationTimeSec;
    this.accountCallbacks = new Map<PublicKey, AccountCallbacks>();
  }

  registerAccount(
    account: PublicKey,
    onCreation: (accountKey: PublicKey, accountData: Buffer) => Promise<void>,
    onExpire: (accountKey: PublicKey) => Promise<void>,
  ) {
    this.accountCallbacks.set(account, {
      registerTimestamp: Date.now() / 1000,
      onCreation,
      onExpire,
    });
  }

  async start() {
    while (!this.stopped) {
      const now = Date.now() / 1000;
      await sleep(this.pollIntervalMs);
      // Process expired accounts.
      for (const [account, callbacks] of this.accountCallbacks.entries()) {
        if (now - callbacks.registerTimestamp < this.expirationTimeSec) {
          continue;
        }
        setImmediate(() => callbacks.onExpire(account));
        this.accountCallbacks.delete(account);
      }
      // Batch-getting all accounts.
      const accountKeys = Array.from(this.accountCallbacks.keys());
      try {
        const accounts = await solConnection.getMultipleAccountsInfo(
          accountKeys,
          "processed",
        );
        for (let i = 0; i < accountKeys.length; i++) {
          const account = accountKeys[i];
          const accountInfo = accounts[i];
          const callbacks = this.accountCallbacks.get(account);
          if (!accountInfo || !callbacks) {
            continue;
          }
          setImmediate(() => callbacks.onCreation(account, accountInfo.data));
          this.accountCallbacks.delete(account);
        }
      } catch (err) {
        console.warn(`Error when getting account data: ${err}`);
      }
    }
    console.log("Account creation monitor stopped");
  }

  async stop() {
    this.stopped = true;
  }
}
