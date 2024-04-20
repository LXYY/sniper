import {
  ApiPoolInfoV4,
  buildSimpleTransaction,
  jsonInfo2PoolKeys,
  Liquidity,
  LIQUIDITY_STATE_LAYOUT_V4,
  LiquidityPoolKeys,
  LiquidityPoolKeysV4,
  LiquidityStateV4,
  LOOKUP_TABLE_CACHE,
  MAINNET_PROGRAM_ID,
  Market,
  MARKET_STATE_LAYOUT_V3,
  Token,
  TOKEN_PROGRAM_ID,
  TokenAmount,
  TxVersion,
} from "@raydium-io/raydium-sdk";
import { MarketCreation, PoolCreation, PoolType } from "./types";
import {
  getAssociatedTokenAddressSync,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import solConnection from "./sol_connection";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { SplToken } from "./spl_token";
import BN from "bn.js";
import { sniperPayer } from "./payer";
import {
  createCheckTokenAmountInstruction,
  createInitSnipeInstruction,
} from "../program/sniper_helper_utils";

export const RAYDIUM_SWAP_TXN_COMPUTE_UNIT_LIMIT = 100000;

export function getRaydiumV4LiquidityStateFromData(
  data: Buffer,
): LiquidityStateV4 {
  return LIQUIDITY_STATE_LAYOUT_V4.decode(data);
}

export function getPoolCreationFromRaydiumV4(
  poolKey: PublicKey,
  liquidityState: LiquidityStateV4,
  marketCreation: MarketCreation,
): PoolCreation {
  return {
    type: PoolType.RAYDIUM_V4,
    poolId: poolKey,
    marketId: marketCreation.marketId,
    initialPoolState: liquidityState,
    openTime: liquidityState.poolOpenTime.toNumber(),
    baseToken: marketCreation.baseToken,
    quoteToken: marketCreation.quoteToken,
    marketCreator: marketCreation.creator,
    marketCreatedAtTimestamp: marketCreation.createdAtTimestamp,
    marketCreatedBeforeSec:
      Date.now() / 1000 - marketCreation.createdAtTimestamp,
  };
}

export async function getPoolKeysFromMarketId(
  marketId: PublicKey,
  baseTokenDecimals: number,
  quoteTokenDecimals: number,
): Promise<LiquidityPoolKeysV4> {
  const marketAccount = await solConnection.getAccountInfo(marketId);
  const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount!.data);
  const programId = MAINNET_PROGRAM_ID.AmmV4;
  return {
    id: Liquidity.getAssociatedId({
      programId,
      marketId,
    }),
    baseMint: marketInfo.baseMint,
    quoteMint: marketInfo.quoteMint,
    lpMint: Liquidity.getAssociatedLpMint({
      programId,
      marketId,
    }),
    baseDecimals: baseTokenDecimals,
    quoteDecimals: quoteTokenDecimals,
    lpDecimals: baseTokenDecimals,
    version: 4,
    programId: programId,
    authority: Liquidity.getAssociatedAuthority({
      programId: programId,
    }).publicKey,
    openOrders: Liquidity.getAssociatedOpenOrders({
      programId,
      marketId,
    }),
    targetOrders: Liquidity.getAssociatedTargetOrders({
      programId,
      marketId,
    }),
    baseVault: Liquidity.getAssociatedBaseVault({
      programId,
      marketId,
    }),
    quoteVault: Liquidity.getAssociatedQuoteVault({
      programId,
      marketId,
    }),
    withdrawQueue: Liquidity.getAssociatedWithdrawQueue({
      programId,
      marketId,
    }),
    lpVault: Liquidity.getAssociatedLpVault({
      programId,
      marketId,
    }),
    marketVersion: 3,
    marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
    marketId: marketId,
    marketAuthority: Market.getAssociatedAuthority({
      programId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
      marketId: marketId,
    }).publicKey,
    marketBaseVault: marketInfo.baseVault,
    marketQuoteVault: marketInfo.quoteVault,
    marketBids: marketInfo.bids,
    marketAsks: marketInfo.asks,
    marketEventQueue: marketInfo.eventQueue,
    lookupTableAccount: PublicKey.default,
  };
}

export async function getPoolInfo(
  poolAddress: PublicKey,
  lpTokenDecimal: number,
): Promise<ApiPoolInfoV4> {
  const account = await solConnection.getAccountInfo(poolAddress);
  const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account!.data);

  const marketId = info.marketId;
  const marketAccount = await solConnection.getAccountInfo(marketId);
  const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);

  return {
    id: poolAddress.toString(),
    baseMint: info.baseMint.toString(),
    quoteMint: info.quoteMint.toString(),
    lpMint: info.lpMint.toString(),
    baseDecimals: info.baseDecimal.toNumber(),
    quoteDecimals: info.quoteDecimal.toNumber(),
    lpDecimals: lpTokenDecimal,
    version: 4,
    programId: account.owner.toString(),
    authority: Liquidity.getAssociatedAuthority({
      programId: account.owner,
    }).publicKey.toString(),
    openOrders: info.openOrders.toString(),
    targetOrders: info.targetOrders.toString(),
    baseVault: info.baseVault.toString(),
    quoteVault: info.quoteVault.toString(),
    withdrawQueue: info.withdrawQueue.toString(),
    lpVault: info.lpVault.toString(),
    marketVersion: 3,
    marketProgramId: info.marketProgramId.toString(),
    marketId: info.marketId.toString(),
    marketAuthority: Market.getAssociatedAuthority({
      programId: info.marketProgramId,
      marketId: info.marketId,
    }).publicKey.toString(),
    marketBaseVault: marketInfo.baseVault.toString(),
    marketQuoteVault: marketInfo.quoteVault.toString(),
    marketBids: marketInfo.bids.toString(),
    marketAsks: marketInfo.asks.toString(),
    marketEventQueue: marketInfo.eventQueue.toString(),
    lookupTableAccount: PublicKey.default.toString(),
  };
}

export async function getLiquidityPoolInfo(
  poolAddress: PublicKey,
  lpTokenDecimal: number,
) {
  const poolInfo = await getPoolInfo(poolAddress, lpTokenDecimal);
  const poolKeys = jsonInfo2PoolKeys(poolInfo) as LiquidityPoolKeys;
  const liquidityPoolInfo = await Liquidity.fetchInfo({
    connection: solConnection,
    poolKeys,
  });
  return {
    poolKeys,
    liquidityPoolInfo,
  };
}

export function toRaydiumToken(splToken: SplToken): Token {
  return new Token(
    TOKEN_PROGRAM_ID,
    new PublicKey(splToken.mintAddress),
    splToken.decimals,
    splToken.symbol,
    splToken.name,
  );
}

export interface SnipeSpecificInput {
  minQuoteTokenAmount: BN;
  maxQuoteTokenAmount: BN;
}

export interface RaydiumV4SwapTransactionInput {
  poolKeys: LiquidityPoolKeys;
  tokenIn: SplToken;
  tokenOut: SplToken;
  amountIn: BN;
  minAmountOut: BN;
  payer: PublicKey;
  priorityFeeMicroLamports: number;
  closeSourceAta: boolean;
  snipeSpecificInput?: SnipeSpecificInput;
}

export async function getSwapTransaction(
  input: RaydiumV4SwapTransactionInput,
): Promise<VersionedTransaction> {
  const tokenIn = toRaydiumToken(input.tokenIn);
  const tokenOut = toRaydiumToken(input.tokenOut);

  const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
    connection: solConnection,
    poolKeys: input.poolKeys,
    userKeys: {
      tokenAccounts: [],
      owner: input.payer,
    },
    amountIn: new TokenAmount(tokenIn, input.amountIn),
    amountOut: new TokenAmount(tokenOut, input.minAmountOut),
    fixedSide: "in",
    makeTxVersion: TxVersion.V0,
    computeBudgetConfig: {
      units: RAYDIUM_SWAP_TXN_COMPUTE_UNIT_LIMIT,
      microLamports: input.priorityFeeMicroLamports,
    },
    config: {
      checkCreateATAOwner: true,
    },
  });

  if (input.closeSourceAta) {
    innerTransactions[0].instructions.push(
      createCloseAccountInstruction(
        getAssociatedTokenAddressSync(tokenIn.mint, input.payer),
        input.payer,
        input.payer,
      ),
    );
  }

  if (input.snipeSpecificInput) {
    const snipeSpecificInstructions = await getSnipeSpecificInstructions(
      input.poolKeys,
      input.snipeSpecificInput,
      input.payer,
    );
    // Insert the elements at position 2 (skip the first 2 instructions which are for compute unit & priority fee
    // settings) of innerTransactions[0].instructions.
    innerTransactions[0].instructions.splice(
      2,
      0,
      ...snipeSpecificInstructions,
    );
  }

  const latestBlockhash =
    await solConnection.getLatestBlockhashAndContext("processed");
  const txnToSend = await buildSimpleTransaction({
    connection: solConnection,
    makeTxVersion: TxVersion.V0,
    payer: input.payer,
    innerTransactions: innerTransactions,
    addLookupTableInfo: LOOKUP_TABLE_CACHE,
    recentBlockhash: latestBlockhash.value.blockhash,
  });

  return txnToSend[0] as VersionedTransaction;
}

async function getSnipeSpecificInstructions(
  poolKeys: LiquidityPoolKeys,
  snipeSpecificInput: SnipeSpecificInput,
  payer: PublicKey,
): Promise<TransactionInstruction[]> {
  return [
    // Initializes the snipe account to avoid double-spend.
    await createInitSnipeInstruction(payer, poolKeys.baseMint),
    // Checks the amount of the quote token in the quote vault before swapping.
    await createCheckTokenAmountInstruction(
      poolKeys.quoteVault,
      snipeSpecificInput.minQuoteTokenAmount,
      snipeSpecificInput.maxQuoteTokenAmount,
    ),
  ];
}
