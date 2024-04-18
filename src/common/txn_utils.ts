import { backOff } from "exponential-backoff";
import {
  ComputeBudgetProgram,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  PublicKey,
  RpcResponseAndContext,
  SignatureResult,
  Signer,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import solConnection from "./sol_connection";
import { sleep } from "./utils";
import { sniperPayer } from "./payer";
import BN from "bn.js";
import sniperConfig from "./config";

export async function confirmAndGetTransaction(signature: string) {
  const latestBlockHash = await backOff(() =>
    solConnection.getLatestBlockhash(),
  );
  let result: RpcResponseAndContext<SignatureResult>;
  try {
    result = await solConnection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature,
    });
  } catch (e) {
    console.error(`Error confirming transaction: ${e}`);
    return null;
  }
  // Skip errored transactions.
  if (result.value.err) {
    return null;
  }
  const retryIntervalMs = 1000;
  for (let remainingRetries = 30; remainingRetries > 0; remainingRetries--) {
    const txn = await backOff(() =>
      solConnection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      }),
    );
    if (txn) {
      return txn;
    }
    await sleep(retryIntervalMs);
  }
  return null;
}

export function extractInstructions(txn: ParsedTransactionWithMeta) {
  const ixns = new Array<ParsedInstruction | PartiallyDecodedInstruction>();
  if (txn.meta.innerInstructions) {
    for (const parsedInnerIxn of txn.meta.innerInstructions) {
      for (const innerTxn of parsedInnerIxn.instructions) {
        ixns.push(innerTxn);
      }
    }
  }
  return ixns.concat(txn.transaction.message.instructions);
}

export function findSigner(txn: ParsedTransactionWithMeta) {
  let signer: PublicKey;
  for (const account of txn.transaction.message.accountKeys) {
    if (account.signer) {
      signer = account.pubkey;
      break;
    }
  }
  return signer;
}

export function findSignature(txn: ParsedTransactionWithMeta) {
  return txn.transaction.signatures[0];
}

export function programInvokedFromLogs(
  programIdString: string,
  logs: string[],
) {
  const stringPrefix = `Program ${programIdString} invoke [`;
  for (const log of logs) {
    if (log.startsWith(stringPrefix)) {
      return true;
    }
  }
  return false;
}

export async function getSolTransferTransaction(
  amount: BN,
  payer: PublicKey,
  recipient: PublicKey,
): Promise<VersionedTransaction> {
  const latestBlockhash = await solConnection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 10000,
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: sniperConfig.general.defaultPriorityFeeLamports,
      }),
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: recipient,
        lamports: BigInt(amount.toString()),
      }),
    ],
  }).compileToV0Message();
  return new VersionedTransaction(messageV0);
}

export async function sendAndConfirmTransaction(
  txn: VersionedTransaction,
  skipPreflight: boolean,
  payer?: Signer,
  maxRetries?: number,
) {
  txn.sign([payer || sniperPayer]);
  const txnSignature = await solConnection.sendTransaction(txn, {
    skipPreflight,
    maxRetries,
    preflightCommitment: "processed",
  });
  const latestBlockhash =
    await solConnection.getLatestBlockhashAndContext("processed");
  const startingTime = Date.now() / 1000;
  const result = await solConnection.confirmTransaction(
    {
      signature: txnSignature,
      blockhash: latestBlockhash.value.blockhash,
      lastValidBlockHeight: latestBlockhash.value.lastValidBlockHeight,
    },
    "processed",
  );
  if (result.value.err) {
    throw new Error("transaction failed: " + result.value.err);
  }

  return await backOff(
    async () => {
      const txn = await solConnection.getParsedTransaction(txnSignature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      // The txn may be null.
      if (!txn) {
        throw new Error("transaction not found, retrying");
      }
      console.log(
        `Transaction ${txnSignature} succeeded after ${(Date.now() / 1000 - startingTime).toFixed(2)} seconds, slot: ${result.context.slot}`,
      );
      return txn;
    },
    {
      jitter: "none",
    },
  );
}

export function getSolBalanceChange(
  parsedTxn: ParsedTransactionWithMeta,
  account: PublicKey,
) {
  const accountIndex = parsedTxn.transaction.message.accountKeys.findIndex(
    (accountMeta) => accountMeta.pubkey.equals(account),
  );
  if (accountIndex < 0) {
    return new BN(0);
  }

  const preBalance = parsedTxn.meta.preBalances[accountIndex];
  const postBalance = parsedTxn.meta.postBalances[accountIndex];
  return new BN(Math.abs(postBalance - preBalance));
}
