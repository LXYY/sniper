import {
  Quote,
  SwapOptions,
  SwapSummary,
  SwapTxnType,
  TokenSwapper,
} from "./swapper";
import BN from "bn.js";
import { SplToken, toQuoteToken } from "../common/spl_token";
import {
  ParsedTransactionWithMeta,
  PublicKey,
  TokenBalance,
} from "@solana/web3.js";
import {
  Liquidity,
  LiquidityPoolInfo,
  LiquidityPoolKeysV4,
  Percent,
  TokenAmount,
} from "@raydium-io/raydium-sdk";
import sniperConfig from "../common/config";
import {
  getLiquidityPoolInfo,
  getSwapTransaction,
  toRaydiumToken,
} from "../common/raydium_utils";
import { SwapDryRunner } from "./dry_runner";
import Decimal from "decimal.js";
import { rawAmountToDecimal } from "../common/utils";
import { sniperPayer } from "../common/payer";
import { sendAndConfirmTransaction } from "../common/txn_utils";
import { QuoteToken } from "../common/types";

export interface RaydiumV4QuotePayload {
  poolKeys: LiquidityPoolKeysV4;
}

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

  async buyToken(quote: Quote, opts?: SwapOptions): Promise<SwapSummary> {
    if (sniperConfig.general.dryRun) {
      return this.swapDryRunner.buyToken(quote.amountIn, quote.minAmountOut);
    }
    return await this.swapToken(this.quoteToken, this.baseToken, quote, opts);
  }

  async sellToken(quote: Quote, opts?: SwapOptions): Promise<SwapSummary> {
    if (sniperConfig.general.dryRun) {
      return this.swapDryRunner.sellToken(quote.amountIn, quote.minAmountOut);
    }
    return await this.swapToken(this.baseToken, this.quoteToken, quote, opts);
  }

  private async swapToken(
    tokenIn: SplToken,
    tokenOut: SplToken,
    quote: Quote,
    opts?: SwapOptions,
  ): Promise<SwapSummary> {
    const swapType =
      tokenIn === this.quoteToken ? SwapTxnType.BUY : SwapTxnType.SELL;
    if (!opts) {
      opts = {
        skipPreflight: false,
        priorityFeeInMicroLamports:
          swapType === SwapTxnType.BUY
            ? sniperConfig.strategy.buyFeeMicroLamports
            : sniperConfig.strategy.sellFeeMicroLamports,
      };
    }
    const { poolKeys } =
      quote.protocolSpecificPayload as unknown as RaydiumV4QuotePayload;
    const txn = await getSwapTransaction({
      poolKeys,
      tokenIn,
      tokenOut,
      amountIn: quote.amountIn,
      minAmountOut: quote.minAmountOut,
      payer: sniperPayer.publicKey,
      priorityFeeMicroLamports: opts.priorityFeeInMicroLamports,
    });
    const parsedTxn = await sendAndConfirmTransaction(txn, opts.skipPreflight);
    return this.parseSwapSummary(parsedTxn, tokenIn);
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
      amountIn: amount,
      minAmountOut: result.minAmountOut.raw,
      baseTokenPrice: this.getBaseTokenPrice(liquidityPoolInfo),
      protocolSpecificPayload: {
        poolKeys: poolKeys,
      } as RaydiumV4QuotePayload,
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

  private getTokenBalance(token: SplToken, tokenBalances: TokenBalance[]): BN {
    const baseTokenBalanceIndex = tokenBalances.findIndex((balance) => {
      return (
        balance.mint == token.mintAddress.toBase58() &&
        balance.owner == sniperPayer.publicKey.toBase58()
      );
    });
    if (baseTokenBalanceIndex == -1) {
      return new BN(0);
    }
    return new BN(tokenBalances[baseTokenBalanceIndex].uiTokenAmount.amount);
  }

  private parseSwapSummary(
    txn: ParsedTransactionWithMeta,
    tokenIn: SplToken,
  ): SwapSummary {
    const quoteToken = toQuoteToken(this.quoteToken);
    const txnType =
      tokenIn === this.quoteToken ? SwapTxnType.BUY : SwapTxnType.SELL;
    const txnSignature = txn.transaction.signatures[0];

    let preQuoteTokenAmount: BN;
    let postQuoteTokenAmount: BN;
    if (quoteToken === QuoteToken.SOL) {
      const payerIndex = txn.transaction.message.accountKeys.findIndex(
        (account) => {
          return sniperPayer.publicKey.equals(account.pubkey);
        },
      );
      preQuoteTokenAmount = new BN(txn.meta.preBalances[payerIndex]);
      postQuoteTokenAmount = new BN(txn.meta.postBalances[payerIndex]);
    } else {
      preQuoteTokenAmount = this.getTokenBalance(
        this.quoteToken,
        txn.meta.preTokenBalances,
      );
      postQuoteTokenAmount = this.getTokenBalance(
        this.quoteToken,
        txn.meta.postTokenBalances,
      );
    }
    const preBaseTokenAmount = this.getTokenBalance(
      this.baseToken,
      txn.meta.preTokenBalances,
    );
    const postBaseTokenAmount = this.getTokenBalance(
      this.baseToken,
      txn.meta.postTokenBalances,
    );

    return {
      txnSignature,
      txnType,
      preBaseTokenAmount,
      postBaseTokenAmount,
      preQuoteTokenAmount,
      postQuoteTokenAmount,
    };
  }
}

export function raydiumV4SwapperFactory(
  poolId: PublicKey,
  baseToken: SplToken,
  quoteToken: SplToken,
): TokenSwapper {
  return new RaydiumV4Swapper(poolId, baseToken, quoteToken);
}
