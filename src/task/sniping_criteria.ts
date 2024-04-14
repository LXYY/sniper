import sniperConfig, { SniperConfig } from "../common/config";
import { SnipingCriteriaInput } from "./types";
import { getAccount } from "@solana/spl-token";
import solConnection from "../common/sol_connection";
import { rawAmountToDecimal } from "../common/utils";
import BN from "bn.js";
import { ErrSnipingCriteriaNotMet } from "./errors";
import { backOff } from "exponential-backoff";

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

    if (poolConfig.requireImage && !input.baseToken.image) {
      throw new ErrSnipingCriteriaNotMet(`Base token image required.`);
    }

    if (poolConfig.requireMintDisabled && !input.baseToken.mintDisabled) {
      throw new ErrSnipingCriteriaNotMet(`Base token mint not disabled.`);
    }

    if (poolConfig.requireFreezeDisabled && !input.baseToken.freezeDisabled) {
      throw new ErrSnipingCriteriaNotMet(`Base token freeze not disabled.`);
    }

    const quoteVault = await getAccount(
      solConnection,
      input.quoteVault,
      "processed",
    );
    const quoteUiAmount = rawAmountToDecimal(
      new BN(quoteVault.amount.toString()),
      input.quoteToken.decimals,
    );
    if (
      quoteUiAmount.lt(poolConfig.minQuoteTokenInPool) ||
      quoteUiAmount.gt(poolConfig.maxQuoteTokenInPool)
    ) {
      throw new ErrSnipingCriteriaNotMet(`Quote token amount not in range.`);
    }
  }
}
