import sniperConfig, { SniperConfig } from "../common/config";
import { SnipingCriteriaInput } from "./types";
import {
  Account,
  getAccount,
  Mint,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token";
import solConnection from "../common/sol_connection";
import { rawAmountToDecimal } from "../common/utils";
import BN from "bn.js";
import { ErrRuntimeError, ErrSnipingCriteriaNotMet } from "./errors";
import { backOff } from "exponential-backoff";
import {
  LIQUIDITY_STATE_LAYOUT_V4,
  LiquidityStateV4,
} from "@raydium-io/raydium-sdk";

interface TokenStatesForSnipingCriteria {
  liquidityState: LiquidityStateV4;
  baseTokenMint: Mint;
  baseVault: Account;
  quoteVault: Account;
}

export interface SnipingCriteria {
  waitUntilSatisfied(input: SnipingCriteriaInput): Promise<void>;
}

export class RaydiumV4SnipingCriteria implements SnipingCriteria {
  private readonly config: SniperConfig;

  constructor() {
    this.config = sniperConfig;
  }

  async waitUntilSatisfied(input: SnipingCriteriaInput) {
    const poolConfig = this.config.pool;
    if (poolConfig.requireSymbol && !input.baseToken.symbol) {
      throw new ErrSnipingCriteriaNotMet(`Base token symbol required.`);
    }

    // if (poolConfig.requireImage && !input.baseToken.image) {
    //   throw new ErrSnipingCriteriaNotMet(`Base token image required.`);
    // }

    const { liquidityState, baseTokenMint, baseVault, quoteVault } =
      await this.getTokenStatesForSnipingCriteria(input);

    const poolOpenTime = liquidityState.poolOpenTime.toNumber();
    const now = Date.now() / 1000;
    if (now < poolOpenTime) {
      throw new ErrSnipingCriteriaNotMet(`Pool has timer.`);
    }

    if (poolConfig.requireMintDisabled && !!baseTokenMint.mintAuthority) {
      throw new ErrSnipingCriteriaNotMet(`Base token mint not disabled.`);
    }

    if (poolConfig.requireFreezeDisabled && !!baseTokenMint.freezeAuthority) {
      throw new ErrSnipingCriteriaNotMet(`Base token freeze not disabled.`);
    }

    const initialQuoteTokenAmount = this.getInitialQuoteTokenAmount(
      liquidityState,
      quoteVault,
    );
    const initialQuoteUiAmount = rawAmountToDecimal(
      initialQuoteTokenAmount,
      input.quoteToken.decimals,
    );
    if (
      initialQuoteUiAmount.lt(poolConfig.minQuoteTokenInPool) ||
      initialQuoteUiAmount.gt(poolConfig.maxQuoteTokenInPool)
    ) {
      throw new ErrSnipingCriteriaNotMet(
        `Quote token amount not in range. Details:\n` +
          `current amount: ${rawAmountToDecimal(new BN(quoteVault.amount.toString()), input.quoteToken.decimals).toFixed(2)}\n` +
          `swap out: ${rawAmountToDecimal(liquidityState.swapQuoteOutAmount, input.quoteToken.decimals).toFixed(2)}\n` +
          `swap in: ${rawAmountToDecimal(liquidityState.swapQuoteInAmount, input.quoteToken.decimals).toFixed(2)}\n` +
          `calculated initial amount (current + swap_out - swap_in): ${initialQuoteUiAmount.toFixed(2)}`,
      );
    }

    // Check base token pool percentage.
    const baseTokenVaultAmount = rawAmountToDecimal(
      new BN(baseVault.amount.toString()),
      input.baseToken.decimals,
    );
    const baseTokenSupply = rawAmountToDecimal(
      new BN(baseTokenMint.supply.toString()),
      input.baseToken.decimals,
    );
    const baseTokenPoolPercentage = baseTokenVaultAmount
      .div(baseTokenSupply)
      .mul(100);
    if (
      baseTokenPoolPercentage.lt(sniperConfig.monitor.minPooledTokenPercentage)
    ) {
      throw new ErrSnipingCriteriaNotMet(
        `Base token pool percentage too low: ${baseTokenPoolPercentage.toFixed(2)}%.`,
      );
    }
  }

  private getInitialQuoteTokenAmount(
    liquidityState: LiquidityStateV4,
    quoteVault: Account,
  ): BN {
    // initial_amount = current_amount + swap_out - swap_in
    return new BN(quoteVault.amount.toString())
      .add(liquidityState.swapQuoteOutAmount)
      .sub(liquidityState.swapQuoteInAmount);
  }

  private async getTokenStatesForSnipingCriteria(
    input: SnipingCriteriaInput,
  ): Promise<TokenStatesForSnipingCriteria> {
    const [
      liquidityStateAccount,
      baseTokenMintAccount,
      baseVaultAccount,
      quoteVaultAccount,
    ] = await backOff(() => {
      return solConnection.getMultipleAccountsInfo(
        [
          input.poolId,
          input.baseToken.mintAddress,
          input.baseVault,
          input.quoteVault,
        ],
        "processed",
      );
    });

    if (
      !liquidityStateAccount ||
      !baseTokenMintAccount ||
      !baseVaultAccount ||
      !quoteVaultAccount
    ) {
      throw new ErrRuntimeError("Failed to fetch liquidity & token state.");
    }

    // Check initial quote token amount.
    const liquidityState = LIQUIDITY_STATE_LAYOUT_V4.decode(
      liquidityStateAccount.data,
    ) as LiquidityStateV4;
    const baseTokenMint = unpackMint(
      input.baseToken.mintAddress,
      baseTokenMintAccount,
    );
    const baseVault = unpackAccount(input.baseVault, baseVaultAccount);
    const quoteVault = unpackAccount(input.quoteVault, quoteVaultAccount);
    return {
      liquidityState,
      baseTokenMint,
      baseVault,
      quoteVault,
    };
  }
}
