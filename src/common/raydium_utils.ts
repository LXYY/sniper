import {
  LIQUIDITY_STATE_LAYOUT_V4,
  LiquidityStateV4,
} from "@raydium-io/raydium-sdk";
import { MarketCreation, PoolCreation, PoolType } from "./types";
import splToken from "@solana/spl-token";
import solConnection from "./sol_connection";

export function getRaydiumV4LiquidityStateFromData(
  data: Buffer,
): LiquidityStateV4 {
  return LIQUIDITY_STATE_LAYOUT_V4.decode(data);
}

export function getPoolCreationFromRaydiumV4(
  liquidityState: LiquidityStateV4,
  marketCreation: MarketCreation,
): PoolCreation {
  return {
    type: PoolType.RAYDIUM_V4,
    initialPoolState: liquidityState,
    openTime: liquidityState.poolOpenTime.toNumber(),
    baseToken: marketCreation.baseToken,
    quoteToken: marketCreation.quoteToken,
    marketCreator: marketCreation.creator,
  };
}
