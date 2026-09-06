export type PaperAssetClass = "STOCK" | "ETF" | "CRYPTO";
export type PaperSide = "BUY" | "SELL";
export type PaperOrderType = "MARKET" | "LIMIT";
export type PaperOrderStatus = "PENDING" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED";
export type ExitReason =
  | "STOP" | "TARGET" | "TRAIL" | "INVALIDATION" | "TIME_EXIT"
  | "REGIME_CHANGE" | "SIGNAL_DETERIORATION" | "CAPITAL_GOVERNOR"
  | "MANUAL_PAPER_CLOSE";
export type EvaluationStage = "BACKTEST" | "OUT_OF_SAMPLE" | "PAPER";

export interface PaperOrderRequest {
  symbol: string;
  assetClass: PaperAssetClass;
  strategyId: string;
  strategyVersion: string;
  side: PaperSide;
  quantity: number;
  orderType: PaperOrderType;
  limitPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  submittedAt: string;
}

export interface PaperFill {
  id: string;
  orderId: string;
  mode: "PAPER";
  quantity: number;
  referencePrice: number;
  price: number;
  grossNotional: number;
  fee: number;
  spreadCost: number;
  slippageCost: number;
  timestamp: string;
}

export interface PaperOrder extends PaperOrderRequest {
  id: string;
  mode: "PAPER";
  status: PaperOrderStatus;
  filledQuantity: number;
  averageFillPrice: number | null;
  fills: PaperFill[];
  rejectionReason?: string;
}

export interface PaperPosition {
  symbol: string;
  assetClass: PaperAssetClass;
  strategyId: string;
  strategyVersion: string;
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  openedAt: string;
  highestPrice: number;
  stopPrice?: number;
  targetPrice?: number;
  trailingStopPercent?: number;
  invalidated?: boolean;
  regimeChanged?: boolean;
  signalStrength?: number;
  maxHoldingMs?: number;
  entryFees: number;
  entrySlippage: number;
}

export interface ClosedPaperTrade {
  id: string;
  mode: "PAPER";
  symbol: string;
  assetClass: PaperAssetClass;
  strategyId: string;
  strategyVersion: string;
  openedAt: string;
  closedAt: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  grossPnl: number;
  fees: number;
  slippage: number;
  netPnl: number;
  exitReason: ExitReason;
  regime?: string;
}