import {
  Quote,
  SwapOptions,
  SwapSummary,
  SwapTxnType,
  TokenSwapper,
  TokenSwapperFactory,
} from "./swapper";
import BN from "bn.js";
import { SplToken } from "../common/spl_token";
import { PublicKey } from "@solana/web3.js";
import {
  Liquidity,
  LiquidityPoolInfo,
  LiquidityStateV4,
  Percent,
  TokenAmount,
} from "@raydium-io/raydium-sdk";
import sniperConfig from "../common/config";
import { getLiquidityPoolInfo, toRaydiumToken } from "../common/raydium_utils";
import { SwapDryRunner } from "./dry_runner";
import Decimal from "decimal.js";
import { bnToDecimal, rawAmountToDecimal } from "../common/utils";

export class RaydiumV4Swapper implements TokenSwapper {
  private poolId: PublicKey;
  private baseToken: SplToken;
  private quoteToken: SplToken;
  private readonly swapDryRunner: SwapDryRunner;

  constructor(poolId: PublicKey, baseToken: SplToken, quoteToken: SplToken) {
    this.poolId = poolId;
    this.baseToken = baseToken;
    this.quoteToken = quoteToken;
    this.swapDryRunner = new SwapDryRunner();
  }

  initialize(poolId: PublicKey, baseToken: SplToken, quoteToken: SplToken) {
    this.poolId = poolId;
    this.baseToken = baseToken;
    this.quoteToken = quoteToken;
  }

  async buyToken(
    buyAmount: BN,
    minExpectedAmount?: BN,
    opts?: SwapOptions,
  ): Promise<SwapSummary> {
    if (sniperConfig.general.dryRun) {
      return this.swapDryRunner.buyToken(buyAmount, minExpectedAmount!);
    }
    return Promise.resolve(undefined);
  }

  async sellToken(
    sellAmount: BN,
    minExpectedAmount?: BN,
    opts?: SwapOptions,
  ): Promise<SwapSummary> {
    if (sniperConfig.general.dryRun) {
      return this.swapDryRunner.sellToken(sellAmount, minExpectedAmount!);
    }
    return Promise.resolve(undefined);
  }

  async getBuyQuote(buyAmount: BN, slippage: number): Promise<Quote> {
    return await this.getQuote(
      this.quoteToken,
      this.baseToken,
      this.baseToken.decimals,
      buyAmount,
      slippage,
    );
  }

  async getSellQuote(sellAmount: BN, slippage: number): Promise<Quote> {
    return await this.getQuote(
      this.baseToken,
      this.quoteToken,
      this.baseToken.decimals,
      sellAmount,
      slippage,
    );
  }

  async getPriceInQuote(): Promise<Decimal> {
    const { liquidityPoolInfo } = await getLiquidityPoolInfo(
      this.poolId,
      this.baseToken.decimals,
    );
    return this.getBaseTokenPrice(liquidityPoolInfo);
  }

  async getQuote(
    tokenIn: SplToken,
    tokenOut: SplToken,
    lpDecimals: number,
    amount: BN,
    slippage: number,
  ): Promise<Quote> {
    const { poolKeys, liquidityPoolInfo } = await getLiquidityPoolInfo(
      this.poolId,
      lpDecimals,
    );
    const tokenInRaydium = toRaydiumToken(tokenIn);
    const tokenOutRaydium = toRaydiumToken(tokenOut);

    const result = Liquidity.computeAmountOut({
      poolKeys,
      poolInfo: liquidityPoolInfo,
      amountIn: new TokenAmount(tokenInRaydium, amount),
      currencyOut: tokenOutRaydium,
      slippage: new Percent(slippage, 100),
    });
    return {
      minOutAmount: result.minAmountOut.raw,
      baseTokenPrice: this.getBaseTokenPrice(liquidityPoolInfo),
    };
  }

  private getBaseTokenPrice(liquidityPoolInfo: LiquidityPoolInfo): Decimal {
    const baseAmount = rawAmountToDecimal(
      liquidityPoolInfo.baseReserve,
      this.baseToken.decimals,
    );
    const quoteAmount = rawAmountToDecimal(
      liquidityPoolInfo.quoteReserve,
      this.quoteToken.decimals,
    );
    return quoteAmount.div(baseAmount);
  }
}

export function raydiumV4SwapperFactory(
  poolId: PublicKey,
  baseToken: SplToken,
  quoteToken: SplToken,
): TokenSwapper {
  return new RaydiumV4Swapper(poolId, baseToken, quoteToken);
}
