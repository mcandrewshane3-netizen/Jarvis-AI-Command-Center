import type { MarketBar } from "./types";

export interface BacktestStrategy {
  id: string;
  shouldEnter(historyThroughPreviousClose: readonly MarketBar[]): boolean;
  shouldExit(historyThroughPreviousClose: readonly MarketBar[], position: Readonly<{ entryPrice: number; entryTime: string }>): boolean;
  positionSize(cash: number, nextOpen: number): number;
}
export interface BacktestConfig {
  startingCapital: number;
  feePerOrder: number;
  feeRate: number;
  slippageBps: number;
  trainFraction: number;
  minimumTrades: number;
}
export interface BacktestTrade {
  entryTime: string; exitTime: string; entryPrice: number; exitPrice: number; quantity: number;
  grossPnl: number; netPnl: number; fees: number; slippage: number; holdingMs: number;
  sample: "TRAIN" | "OUT_OF_SAMPLE";
}
export interface BacktestMetrics {
  tradeCount: number; wins: number; losses: number; winRate: number; averageWinner: number;
  averageLoser: number; expectancy: number; profitFactor: number | null; grossReturn: number;
  netReturn: number; maxDrawdown: number; averageHoldingMs: number; estimatedFees: number;
  estimatedSlippage: number; riskAdjustedReturn: number | null; sampleStatus: "SUFFICIENT" | "INSUFFICIENT_SAMPLE";
}
export interface BacktestResult {
  strategyId: string; trainEndIndex: number; train: BacktestMetrics; outOfSample: BacktestMetrics;
  all: BacktestMetrics; trades: readonly BacktestTrade[]; equityCurve: readonly { timestamp: string; equity: number }[];
}
const DEFAULTS: BacktestConfig = {
  startingCapital: 100_000, feePerOrder: 0, feeRate: 0.0005, slippageBps: 5,
  trainFraction: 0.7, minimumTrades: 30,
};

export class BacktestEngine {
  constructor(private readonly config: BacktestConfig = DEFAULTS) {
    if (config.startingCapital <= 0 || config.feePerOrder < 0 || config.feeRate < 0 || config.slippageBps < 0 ||
        config.trainFraction <= 0 || config.trainFraction >= 1 || config.minimumTrades < 1) throw new Error("Invalid backtest configuration");
  }

  run(bars: readonly MarketBar[], strategy: BacktestStrategy): BacktestResult {
    validateBars(bars);
    if (bars.length < 3) throw new Error("At least three chronological bars are required");
    const trainEndIndex = Math.floor(bars.length * this.config.trainFraction);
    let cash = this.config.startingCapital;
    let position: { entryPrice: number; rawEntry: number; entryTime: string; quantity: number; entryFee: number; sample: "TRAIN" | "OUT_OF_SAMPLE" } | null = null;
    const trades: BacktestTrade[] = [];
    const equityCurve: Array<{ timestamp: string; equity: number }> = [{ timestamp: bars[0].timestamp, equity: cash }];
    for (let index = 1; index < bars.length; index++) {
      const knownHistory = Object.freeze(bars.slice(0, index).map((bar) => Object.freeze({ ...bar })));
      const bar = bars[index];
      if (position && strategy.shouldExit(knownHistory, position)) {
        const exitPrice = bar.open * (1 - this.config.slippageBps / 10_000);
        const grossPnl = (bar.open - position.rawEntry) * position.quantity;
        const exitFee = this.config.feePerOrder + exitPrice * position.quantity * this.config.feeRate;
        const exitProceeds = exitPrice * position.quantity - exitFee;
        cash += exitProceeds;
        const totalFees = position.entryFee + exitFee;
        const slippage = ((position.entryPrice - position.rawEntry) + (bar.open - exitPrice)) * position.quantity;
        trades.push({
          entryTime: position.entryTime, exitTime: bar.timestamp, entryPrice: position.entryPrice, exitPrice,
          quantity: position.quantity, grossPnl, netPnl: grossPnl - totalFees - slippage,
          fees: totalFees, slippage, holdingMs: Date.parse(bar.timestamp) - Date.parse(position.entryTime), sample: position.sample,
        });
        position = null;
      }
      if (!position && strategy.shouldEnter(knownHistory)) {
        const entryPrice = bar.open * (1 + this.config.slippageBps / 10_000);
        const requested = strategy.positionSize(cash, entryPrice);
        if (!Number.isFinite(requested) || requested < 0) throw new Error("Strategy returned invalid position size");
        const maxQuantity = cash / (entryPrice * (1 + this.config.feeRate));
        const quantity = Math.min(requested, maxQuantity);
        const fee = quantity > 0 ? this.config.feePerOrder + entryPrice * quantity * this.config.feeRate : 0;
        if (quantity > 0 && entryPrice * quantity + fee <= cash) {
          cash -= entryPrice * quantity + fee;
          position = {
            entryPrice, rawEntry: bar.open, entryTime: bar.timestamp, quantity, entryFee: fee,
            sample: index < trainEndIndex ? "TRAIN" : "OUT_OF_SAMPLE",
          };
        }
      }
      equityCurve.push({ timestamp: bar.timestamp, equity: cash + (position ? position.quantity * bar.close : 0) });
    }
    if (position) {
      const bar = bars[bars.length - 1];
      const exitPrice = bar.close * (1 - this.config.slippageBps / 10_000);
      const exitFee = this.config.feePerOrder + exitPrice * position.quantity * this.config.feeRate;
      const grossPnl = (bar.close - position.rawEntry) * position.quantity;
      const slippage = ((position.entryPrice - position.rawEntry) + (bar.close - exitPrice)) * position.quantity;
      trades.push({
        entryTime: position.entryTime, exitTime: bar.timestamp, entryPrice: position.entryPrice, exitPrice,
        quantity: position.quantity, grossPnl, netPnl: grossPnl - position.entryFee - exitFee - slippage,
        fees: position.entryFee + exitFee, slippage,
        holdingMs: Date.parse(bar.timestamp) - Date.parse(position.entryTime), sample: position.sample,
      });
    }
    return {
      strategyId: strategy.id, trainEndIndex,
      train: metrics(trades.filter((trade) => trade.sample === "TRAIN"), this.config),
      outOfSample: metrics(trades.filter((trade) => trade.sample === "OUT_OF_SAMPLE"), this.config),
      all: metrics(trades, this.config), trades, equityCurve,
    };
  }
}

function metrics(trades: readonly BacktestTrade[], config: BacktestConfig): BacktestMetrics {
  const winners = trades.filter((trade) => trade.netPnl > 0);
  const losers = trades.filter((trade) => trade.netPnl < 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.netPnl, 0));
  const grossPnl = trades.reduce((sum, trade) => sum + trade.grossPnl, 0);
  const netPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  let equity = config.startingCapital, peak = equity, maxDrawdown = 0;
  const tradeReturns: number[] = [];
  for (const trade of trades) {
    const before = equity;
    equity += trade.netPnl;
    tradeReturns.push(trade.netPnl / before);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
  }
  const mean = average(tradeReturns);
  const sd = tradeReturns.length > 1 ? Math.sqrt(average(tradeReturns.map((value) => (value - mean) ** 2))) : 0;
  return {
    tradeCount: trades.length, wins: winners.length, losses: losers.length,
    winRate: trades.length ? winners.length / trades.length : 0,
    averageWinner: winners.length ? grossProfit / winners.length : 0,
    averageLoser: losers.length ? -grossLoss / losers.length : 0,
    expectancy: trades.length ? netPnl / trades.length : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : null,
    grossReturn: grossPnl / config.startingCapital, netReturn: netPnl / config.startingCapital,
    maxDrawdown, averageHoldingMs: trades.length ? average(trades.map((trade) => trade.holdingMs)) : 0,
    estimatedFees: trades.reduce((sum, trade) => sum + trade.fees, 0),
    estimatedSlippage: trades.reduce((sum, trade) => sum + trade.slippage, 0),
    riskAdjustedReturn: sd > 0 ? mean / sd * Math.sqrt(trades.length) : null,
    sampleStatus: trades.length >= config.minimumTrades ? "SUFFICIENT" : "INSUFFICIENT_SAMPLE",
  };
}
function validateBars(bars: readonly MarketBar[]): void {
  let prior = -Infinity;
  for (const bar of bars) {
    const time = Date.parse(bar.timestamp);
    if (!Number.isFinite(time) || time <= prior || bar.open <= 0 || bar.low <= 0 || bar.high < bar.low ||
        bar.close <= 0 || bar.volume < 0 || [bar.open, bar.high, bar.low, bar.close, bar.volume].some((v) => !Number.isFinite(v))) {
      throw new Error("Backtest bars must be valid and strictly chronological");
    }
    prior = time;
  }
}
const average = (values: readonly number[]): number => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;