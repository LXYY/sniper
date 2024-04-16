import { backOff } from "exponential-backoff";
import {
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  PublicKey,
  RpcResponseAndContext,
  SignatureResult,
  VersionedTransaction,
} from "@solana/web3.js";
import solConnection from "./sol_connection";
import { sleep } from "./utils";
import { sniperPayer } from "./payer";

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

export async function sendAndConfirmTransaction(
  txn: VersionedTransaction,
  skipPreflight: boolean,
) {
  txn.sign([sniperPayer]);
  const txnSignature = await solConnection.sendTransaction(txn, {
    skipPreflight,
    preflightCommitment: "processed",
  });
  const latestBlockhash =
    await solConnection.getLatestBlockhashAndContext("processed");
  const result = await solConnection.confirmTransaction(
    {
      signature: txnSignature,
      blockhash: latestBlockhash.value.blockhash,
      lastValidBlockHeight: latestBlockhash.value.lastValidBlockHeight,
    },
    "confirmed",
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
      return txn;
    },
    {
      jitter: "none",
    },
  );
}
