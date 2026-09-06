import type { ClosedPaperTrade, ExitReason, PaperAssetClass, PaperOrder, PaperPosition } from "./contracts.js";

export interface PaperPortfolioSnapshot {
  mode: "PAPER";
  startingCapital: number;
  cash: number;
  equity: number;
  positions: PaperPosition[];
  realizedPnL: number;
  unrealizedPnL: number;
  highWaterMark: number;
  currentDrawdown: number;
  maxDrawdown: number;
  grossExposure: number;
  stockExposure: number;
  etfExposure: number;
  cryptoExposure: number;
  strategyExposure: Record<string, number>;
}

export class PaperPortfolio {
  readonly mode = "PAPER" as const;
  private cash: number;
  private realizedPnL = 0;
  private highWaterMark: number;
  private maxDrawdown = 0;
  private positions = new Map<string, PaperPosition>();
  private closed: ClosedPaperTrade[] = [];
  private closeSequence = 0;

  constructor(readonly userId: string, readonly startingCapital: number) {
    if (!userId.trim() || !Number.isFinite(startingCapital) || startingCapital <= 0) {
      throw new Error("User and positive starting paper capital are required");
    }
    this.cash = startingCapital;
    this.highWaterMark = startingCapital;
  }

  applyBuy(order: PaperOrder): void {
    if (order.mode !== "PAPER" || order.side !== "BUY" || order.fills.length === 0) {
      throw new Error("A filled PAPER buy order is required");
    }
    const totalQuantity = order.fills.reduce((sum, fill) => sum + fill.quantity, 0);
    const notional = order.fills.reduce((sum, fill) => sum + fill.grossNotional, 0);
    const fees = order.fills.reduce((sum, fill) => sum + fill.fee, 0);
    if (notional + fees > this.cash + 1e-9) throw new Error("Insufficient paper cash");
    const existing = this.positions.get(order.symbol);
    if (existing && (existing.strategyId !== order.strategyId || existing.assetClass !== order.assetClass)) {
      throw new Error("A symbol cannot be mixed across strategy or asset class");
    }
    const oldQuantity = existing?.quantity ?? 0;
    const quantity = oldQuantity + totalQuantity;
    const averageEntryPrice = ((existing?.averageEntryPrice ?? 0) * oldQuantity + notional) / quantity;
    this.positions.set(order.symbol, {
      symbol: order.symbol,
      assetClass: order.assetClass,
      strategyId: order.strategyId,
      strategyVersion: order.strategyVersion,
      quantity,
      averageEntryPrice,
      currentPrice: order.averageFillPrice!,
      openedAt: existing?.openedAt ?? order.fills[0].timestamp,
      highestPrice: Math.max(existing?.highestPrice ?? 0, order.averageFillPrice!),
      ...(order.stopPrice !== undefined ? { stopPrice: order.stopPrice } : {}),
      ...(order.targetPrice !== undefined ? { targetPrice: order.targetPrice } : {}),
      entryFees: (existing?.entryFees ?? 0) + fees,
      entrySlippage: (existing?.entrySlippage ?? 0) +
        order.fills.reduce((sum, fill) => sum + fill.slippageCost + fill.spreadCost, 0),
    });
    this.cash -= notional + fees;
    this.revalue();
  }

  applySell(order: PaperOrder, reason: ExitReason): ClosedPaperTrade {
    if (order.mode !== "PAPER" || order.side !== "SELL" || order.fills.length === 0) {
      throw new Error("A filled PAPER sell order is required");
    }
    const position = this.positions.get(order.symbol);
    const quantity = order.fills.reduce((sum, fill) => sum + fill.quantity, 0);
    if (!position || quantity > position.quantity + 1e-9) throw new Error("Insufficient paper position");
    const proceeds = order.fills.reduce((sum, fill) => sum + fill.grossNotional, 0);
    const exitFees = order.fills.reduce((sum, fill) => sum + fill.fee, 0);
    const allocatedEntryFees = position.entryFees * quantity / position.quantity;
    const allocatedSlippage = position.entrySlippage * quantity / position.quantity;
    const exitSlippage = order.fills.reduce((sum, fill) => sum + fill.slippageCost + fill.spreadCost, 0);
    const grossPnl = proceeds - position.averageEntryPrice * quantity;
    const trade: ClosedPaperTrade = {
      id: `paper-trade-${++this.closeSequence}`,
      mode: "PAPER",
      symbol: position.symbol,
      assetClass: position.assetClass,
      strategyId: position.strategyId,
      strategyVersion: position.strategyVersion,
      openedAt: position.openedAt,
      closedAt: order.fills[order.fills.length - 1].timestamp,
      quantity,
      entryPrice: position.averageEntryPrice,
      exitPrice: order.averageFillPrice!,
      grossPnl,
      fees: allocatedEntryFees + exitFees,
      slippage: allocatedSlippage + exitSlippage,
      netPnl: grossPnl - allocatedEntryFees - exitFees,
      exitReason: reason,
    };
    this.cash += proceeds - exitFees;
    this.realizedPnL += trade.netPnl;
    if (quantity === position.quantity) this.positions.delete(order.symbol);
    else {
      position.quantity -= quantity;
      position.entryFees -= allocatedEntryFees;
      position.entrySlippage -= allocatedSlippage;
    }
    this.closed.push(trade);
    this.revalue();
    return structuredClone(trade);
  }

  mark(symbol: string, price: number): void {
    const position = this.positions.get(symbol);
    if (!position) throw new Error("Unknown paper position");
    if (!Number.isFinite(price) || price <= 0) throw new Error("Mark price must be positive");
    position.currentPrice = price;
    position.highestPrice = Math.max(position.highestPrice, price);
    this.revalue();
  }

  updatePosition(symbol: string, update: Partial<Pick<PaperPosition,
    "stopPrice" | "targetPrice" | "trailingStopPercent" | "invalidated" |
    "regimeChanged" | "signalStrength" | "maxHoldingMs">>): void {
    const position = this.positions.get(symbol);
    if (!position) throw new Error("Unknown paper position");
    Object.assign(position, update);
  }

  getPosition(symbol: string): PaperPosition | undefined {
    const value = this.positions.get(symbol);
    return value ? structuredClone(value) : undefined;
  }

  closedTrades(): ClosedPaperTrade[] { return structuredClone(this.closed); }

  snapshot(): PaperPortfolioSnapshot {
    const positions = [...this.positions.values()];
    const exposure = (assetClass?: PaperAssetClass) => positions
      .filter((position) => !assetClass || position.assetClass === assetClass)
      .reduce((sum, position) => sum + position.quantity * position.currentPrice, 0);
    const grossExposure = exposure();
    const unrealizedPnL = positions.reduce((sum, position) =>
      sum + (position.currentPrice - position.averageEntryPrice) * position.quantity - position.entryFees, 0);
    const equity = this.cash + grossExposure;
    const strategyExposure: Record<string, number> = {};
    for (const position of positions) {
      strategyExposure[position.strategyId] = (strategyExposure[position.strategyId] ?? 0) +
        position.quantity * position.currentPrice;
    }
    return {
      mode: "PAPER", startingCapital: this.startingCapital, cash: this.cash, equity,
      positions: structuredClone(positions), realizedPnL: this.realizedPnL, unrealizedPnL,
      highWaterMark: this.highWaterMark, currentDrawdown: this.highWaterMark === 0 ? 0 :
        (this.highWaterMark - equity) / this.highWaterMark,
      maxDrawdown: this.maxDrawdown, grossExposure,
      stockExposure: exposure("STOCK"), etfExposure: exposure("ETF"),
      cryptoExposure: exposure("CRYPTO"), strategyExposure,
    };
  }

  private revalue(): void {
    const equity = this.cash + [...this.positions.values()]
      .reduce((sum, position) => sum + position.quantity * position.currentPrice, 0);
    this.highWaterMark = Math.max(this.highWaterMark, equity);
    this.maxDrawdown = Math.max(this.maxDrawdown,
      this.highWaterMark === 0 ? 0 : (this.highWaterMark - equity) / this.highWaterMark);
  }
}

/** Explicit per-user boundary; storage adapters can replace this without changing accounting. */
export class PaperPortfolioStore {
  private readonly portfolios = new Map<string, PaperPortfolio>();
  create(userId: string, startingCapital: number): PaperPortfolio {
    if (this.portfolios.has(userId)) throw new Error("Paper portfolio already exists");
    const portfolio = new PaperPortfolio(userId, startingCapital);
    this.portfolios.set(userId, portfolio);
    return portfolio;
  }
  get(userId: string): PaperPortfolio | undefined { return this.portfolios.get(userId); }
}