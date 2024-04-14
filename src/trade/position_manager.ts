import Decimal from "decimal.js";

export interface PositionManager {
  buy(quoteAmount: Decimal, baseAmount: Decimal): void;

  sell(baseAmount: Decimal, quoteAmount: Decimal): void;

  getTotalInvestment(): Decimal;

  getTotalReturn(): Decimal;

  getCurrentPosition(): Decimal;

  getRoi(): number;

  getPnl(): Decimal;

  getUnrealizedRoi(quote: Decimal): number;

  getUnrealizedPnl(quote: Decimal): Decimal;
}

export class DefaultPositionManager implements PositionManager {
  private totalInvestment: Decimal;
  private totalReturn: Decimal;
  private currentPosition: Decimal;

  constructor() {
    this.totalInvestment = new Decimal(0);
    this.totalReturn = new Decimal(0);
    this.currentPosition = new Decimal(0);
  }

  buy(quoteAmount: Decimal, baseAmount: Decimal) {
    this.totalInvestment = this.totalInvestment.add(quoteAmount);
    this.currentPosition = this.currentPosition.add(baseAmount);
  }

  sell(baseAmount: Decimal, quoteAmount: Decimal) {
    this.totalReturn = this.totalReturn.add(quoteAmount);
    this.currentPosition = this.currentPosition.sub(baseAmount);
  }

  getTotalInvestment(): Decimal {
    return this.totalInvestment;
  }

  getTotalReturn(): Decimal {
    return this.totalReturn;
  }

  getCurrentPosition(): Decimal {
    return this.currentPosition;
  }

  getRoi(): number {
    if (this.totalInvestment.eq(0)) {
      return 0;
    }
    return this.getPnl().div(this.totalInvestment).toNumber();
  }

  getPnl(): Decimal {
    return this.totalReturn.sub(this.totalInvestment);
  }

  getUnrealizedRoi(quote: Decimal): number {
    if (this.totalInvestment.eq(0)) {
      return 0;
    }
    return this.getUnrealizedPnl(quote).div(this.totalInvestment).toNumber();
  }

  getUnrealizedPnl(quote: Decimal): Decimal {
    return this.totalReturn
      .add(this.currentPosition.mul(quote))
      .sub(this.totalInvestment);
  }
}
