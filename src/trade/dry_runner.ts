import { SwapOptions, SwapSummary, SwapTxnType, TokenSwapper } from "./swapper";
import { DefaultPositionManager, PositionManager } from "./position_manager";
import BN from "bn.js";
import { SplToken } from "../common/spl_token";
import { bnToDecimal, decimalToBN } from "../common/utils";
import { PublicKey } from "@solana/web3.js";

export class SwapDryRunner {
  private readonly positionManager: PositionManager;

  constructor() {
    this.positionManager = new DefaultPositionManager();
  }

  buyToken(buyAmount: BN, expectedAmount: BN): SwapSummary {
    this.positionManager.buy(
      bnToDecimal(buyAmount),
      bnToDecimal(expectedAmount),
    );
    return {
      txnSignature: "dry_run_txn_signature",
      txnType: SwapTxnType.BUY,
      preBaseTokenAmount: new BN(0),
      postBaseTokenAmount: expectedAmount,
      preQuoteTokenAmount: buyAmount,
      postQuoteTokenAmount: new BN(0),
      blockTimestamp: 0,
    };
  }

  sellToken(sellAmount: BN, expectedAmount: BN): SwapSummary {
    const preBaseTokenAmount = this.positionManager.getCurrentPosition();
    const preQuoteTokenAmount = this.positionManager.getTotalReturn();
    this.positionManager.sell(
      bnToDecimal(sellAmount),
      bnToDecimal(expectedAmount),
    );
    return {
      txnSignature: "dry_run_txn_signature",
      txnType: SwapTxnType.SELL,
      preBaseTokenAmount: decimalToBN(preBaseTokenAmount),
      postBaseTokenAmount: decimalToBN(
        this.positionManager.getCurrentPosition(),
      ),
      preQuoteTokenAmount: decimalToBN(preQuoteTokenAmount),
      postQuoteTokenAmount: decimalToBN(this.positionManager.getTotalReturn()),
      blockTimestamp: 0,
    };
  }
}
