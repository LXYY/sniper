import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import chaiAsPromised from "chai-as-promised";
import { expect, use } from "chai";
import {
  Keypair,
  PublicKey,
  Signer,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import {
  createCheckTokenAmountInstruction,
  createInitSnipeInstruction,
} from "../src/program/sniper_helper_utils";

use(chaiAsPromised);

async function airdrop(receiver: PublicKey) {
  const connection = anchor.getProvider().connection;
  const txnSignature = await connection.requestAirdrop(receiver, 100000000000);
  const latestBlockHash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      signature: txnSignature,
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    },
    "confirmed",
  );
}

async function createToken(authority: Signer) {
  const connection = anchor.getProvider().connection;
  const mintKeypair = Keypair.generate();
  return await splToken.createMint(
    connection,
    authority,
    authority.publicKey,
    null,
    9,
    mintKeypair,
  );
}

async function mintToken(
  authority: Signer,
  mint: PublicKey,
  recipient: PublicKey,
  amount: BN,
) {
  const connection = anchor.getProvider().connection;
  const ata = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    recipient,
  );
  await splToken.mintToChecked(
    connection,
    authority,
    mint,
    ata.address,
    authority.publicKey,
    BigInt(amount.toString()),
    9,
  );
}

async function sendAndConfirmIxns(
  ixns: TransactionInstruction[],
  payer: Signer,
) {
  const connection = anchor.getProvider().connection;
  const latestBlockhash = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: ixns,
  }).compileToV0Message();
  const txn = new VersionedTransaction(messageV0);
  txn.sign([payer]);
  const txnSignature = await connection.sendTransaction(txn, {
    skipPreflight: true,
  });
  const result = await connection.confirmTransaction(
    {
      signature: txnSignature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed",
  );
  if (result.value.err) {
    const customErrorCode = result.value.err["InstructionError"][1]["Custom"];
    throw new Error(
      `Transaction failed with custom error code: ${customErrorCode}`,
    );
  }
}

describe("SniperHelperTest", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const connection = provider.connection;
  const authority = Keypair.generate();
  let testTokenMint: PublicKey;

  before(async () => {
    await airdrop(authority.publicKey);
    testTokenMint = await createToken(authority);
    await mintToken(
      authority,
      testTokenMint,
      authority.publicKey,
      new BN(100_000_000_000),
    );
  });

  describe("InitializeSnipe", () => {
    it("should be able to initialize a snipe", async () => {
      const ixn = await createInitSnipeInstruction(
        authority.publicKey,
        testTokenMint,
      );
      await sendAndConfirmIxns([ixn], authority);
    });
    it("should be reverted when re-initialize a snipe", async () => {
      const ixn = await createInitSnipeInstruction(
        authority.publicKey,
        testTokenMint,
      );
      await expect(
        sendAndConfirmIxns([ixn], authority),
      ).to.eventually.be.rejectedWith(
        "Transaction failed with custom error code: 0",
      );
    });
  });

  describe("CheckTokenAmount", () => {
    it("should be able to check token amount", async () => {
      const ixn = await createCheckTokenAmountInstruction(
        splToken.getAssociatedTokenAddressSync(
          testTokenMint,
          authority.publicKey,
        ),
        new BN(100_000_000_000),
        new BN(150_000_000_000),
      );
      await expect(sendAndConfirmIxns([ixn], authority)).to.eventually.be
        .fulfilled;
    });
    it("should revert when the token amount checking input is invalid", async () => {
      const ixn = await createCheckTokenAmountInstruction(
        splToken.getAssociatedTokenAddressSync(
          testTokenMint,
          authority.publicKey,
        ),
        new BN(150_000_000_000),
        new BN(100_000_000_000),
      );
      await expect(
        sendAndConfirmIxns([ixn], authority),
      ).to.eventually.be.rejectedWith(
        "Transaction failed with custom error code: 6000",
      );
    });
    it("should revert when the token amount is too low", async () => {
      const ixn = await createCheckTokenAmountInstruction(
        splToken.getAssociatedTokenAddressSync(
          testTokenMint,
          authority.publicKey,
        ),
        new BN(10_000_000_000),
        new BN(90_000_000_000),
      );
      await expect(
        sendAndConfirmIxns([ixn], authority),
      ).to.eventually.be.rejectedWith(
        "Transaction failed with custom error code: 6001",
      );
    });
    it("should revert when the token amount is too high", async () => {
      const ixn = await createCheckTokenAmountInstruction(
        splToken.getAssociatedTokenAddressSync(
          testTokenMint,
          authority.publicKey,
        ),
        new BN(110_000_000_000),
        new BN(200_000_000_000),
      );
      await expect(
        sendAndConfirmIxns([ixn], authority),
      ).to.eventually.be.rejectedWith(
        "Transaction failed with custom error code: 6001",
      );
    });
  });
});
