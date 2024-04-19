import { IDL, SniperHelper } from "./idl/sniper_helper";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findPda } from "../common/utils";
import BN from "bn.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const SNIPER_HELPER_PROGRAM_ID = new PublicKey(
  "51kNvtqUvNKYCm3xYfYNRxeaZpsgjfx5sbqV2hvSTKhs",
);

export const SNIPER_HELPER_PROGRAM = new Program<SniperHelper>(
  IDL,
  SNIPER_HELPER_PROGRAM_ID,
);

export function findPdaSnipe(
  payer: PublicKey,
  tokenMint: PublicKey,
): PublicKey {
  return findPda(SNIPER_HELPER_PROGRAM_ID, "snipe", payer, tokenMint);
}

export async function createInitSnipeInstruction(
  payer: PublicKey,
  tokenMint: PublicKey,
) {
  return await SNIPER_HELPER_PROGRAM.methods
    .initSnipe()
    .accounts({
      snipe: findPdaSnipe(payer, tokenMint),
      payer: payer,
      snipedTokenMint: tokenMint,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export async function createCheckTokenAmountInstruction(
  tokenAccount: PublicKey,
  minAmount: BN,
  maxAmount: BN,
) {
  return await SNIPER_HELPER_PROGRAM.methods
    .checkTokenAmount(minAmount, maxAmount)
    .accounts({
      tokenAccount: tokenAccount,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}
