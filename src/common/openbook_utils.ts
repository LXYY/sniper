import {
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { MAINNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import bs58 from "bs58";
import BN from "bn.js";
import { MarketCreation } from "./types";
import { getQuoteToken, getSplTokenFromMintAddress } from "./spl_token";
import sniperConfig from "./config";
import { findSignature, findSigner } from "./txn_utils";

export function isOpenbookMarketCreationInstruction(
  ixn: PartiallyDecodedInstruction | ParsedInstruction,
) {
  if (!ixn.programId.equals(MAINNET_PROGRAM_ID.OPENBOOK_MARKET)) {
    return false;
  }
  const decodedIxn = ixn as PartiallyDecodedInstruction;
  const ixnData = bs58.decode(decodedIxn.data) as Buffer;
  const ixnType = ixnData.subarray(1, 5);
  const ixnNumber = new BN(ixnType, "le").toNumber();
  return ixnNumber == 0;
}

export function tryGetOpenbookMarketCreationIxn(
  ixns: Array<PartiallyDecodedInstruction | ParsedInstruction>,
) {
  for (const ixn of ixns) {
    if (isOpenbookMarketCreationInstruction(ixn)) {
      return ixn as PartiallyDecodedInstruction;
    }
  }
  return null;
}

export async function tryGetMarketCreationFromInstruction(
  marketCreationIxn: PartiallyDecodedInstruction,
  txn: ParsedTransactionWithMeta,
): Promise<MarketCreation | null> {
  const quoteToken = getQuoteToken(sniperConfig.general.quoteToken);
  const marketId = marketCreationIxn.accounts[0];
  const baseMint = marketCreationIxn.accounts[7];
  const quoteMint = marketCreationIxn.accounts[8];
  if (!quoteMint.equals(quoteToken.mintAddress)) {
    return null;
  }
  return {
    marketId,
    baseToken: await getSplTokenFromMintAddress(baseMint),
    quoteToken: quoteToken,
    createTxnSignature: findSignature(txn),
    createdAtSlot: txn.slot,
    createdAtTimestamp: txn.blockTime,
    creator: findSigner(txn),
  };
}
