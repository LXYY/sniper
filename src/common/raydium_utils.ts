import {
  ApiPoolInfoV4,
  jsonInfo2PoolKeys,
  Liquidity,
  LIQUIDITY_STATE_LAYOUT_V4,
  LiquidityPoolKeys,
  LiquidityStateV4,
  MAINNET_PROGRAM_ID,
  Market,
  MARKET_STATE_LAYOUT_V3,
  Token,
  TOKEN_PROGRAM_ID,
} from "@raydium-io/raydium-sdk";
import { MarketCreation, PoolCreation, PoolType } from "./types";
import splToken from "@solana/spl-token";
import solConnection from "./sol_connection";
import { Connection, PublicKey } from "@solana/web3.js";
import { SplToken } from "./spl_token";

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
    initialPoolState: liquidityState,
    openTime: liquidityState.poolOpenTime.toNumber(),
    baseToken: marketCreation.baseToken,
    quoteToken: marketCreation.quoteToken,
    marketCreator: marketCreation.creator,
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
