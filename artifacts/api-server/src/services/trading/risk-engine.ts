export type ExecutionMode = "RESEARCH_ONLY" | "APPROVAL_REQUIRED" | "AGENTIC_AUTO";
export type AssetClass = "EQUITY" | "OPTION" | "CRYPTO";

export type OrderIntent = {
  symbol: string;
  assetType: AssetClass;
  side: "BUY" | "SELL";
  quantity: number;
  notional: number;
  orderType: "MARKET" | "LIMIT" | "STOP";
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: "DAY" | "GTC";
  reason: string;
  confidence: number;
};

export type AccountState = {
  equity: number;
  cash: number;
  dailyPnl: number;
  openPositions: number;
  tradesToday: number;
  totalExposure: number;
  now: Date;
};

export type RiskProfile = {
  maxPositionDollars: number;
  maxPositionPercent: number;
  maxRiskPerTradeDollars: number;
  maxRiskPerTradePercent: number;
  maxDailyLossDollars: number;
  maxDailyLossPercent: number;
  maxOpenPositions: number;
  maxTradesPerDay: number;
  maxTotalExposure: number;
  minimumCashReserve: number;
  allowedAssetClasses: AssetClass[];
  allowedSymbols: string[];
  blockedSymbols: string[];
  allowedTradingHours: { startUtcHour: number; endUtcHour: number };
  requireStopLoss: boolean;
  killSwitch: boolean;
};

export type RiskDecision = {
  approved: boolean;
  evaluations: Array<{ rule: string; passed: boolean; detail: string }>;
};

export function validateOrderIntent(value: unknown): OrderIntent {
  if (!value || typeof value !== "object") throw new Error("OrderIntent must be an object");
  const intent = value as Partial<OrderIntent>;
  if (!intent.symbol || !/^[A-Z0-9.-]{1,15}$/.test(intent.symbol)) throw new Error("Invalid symbol");
  if (!["EQUITY", "OPTION", "CRYPTO"].includes(intent.assetType ?? "")) throw new Error("Invalid asset type");
  if (!["BUY", "SELL"].includes(intent.side ?? "")) throw new Error("Invalid side");
  if (!(Number.isFinite(intent.quantity) && Number(intent.quantity) > 0)) throw new Error("Invalid quantity");
  if (!(Number.isFinite(intent.notional) && Number(intent.notional) > 0)) throw new Error("Invalid notional");
  if (!["MARKET", "LIMIT", "STOP"].includes(intent.orderType ?? "")) throw new Error("Invalid order type");
  if (!["DAY", "GTC"].includes(intent.timeInForce ?? "")) throw new Error("Invalid time in force");
  if (!intent.reason || typeof intent.reason !== "string") throw new Error("Reason is required");
  if (!(Number.isFinite(intent.confidence) && Number(intent.confidence) >= 0 && Number(intent.confidence) <= 1)) throw new Error("Invalid confidence");
  return intent as OrderIntent;
}

export class RiskEngine {
  static validate(intentInput: unknown, account: AccountState, profile: RiskProfile): RiskDecision {
    const intent = validateOrderIntent(intentInput);
    const positionPercent = account.equity > 0 ? intent.notional / account.equity : 1;
    const riskDollars = intent.stopPrice && intent.quantity
      ? Math.abs(intent.notional / intent.quantity - intent.stopPrice) * intent.quantity
      : intent.notional;
    const riskPercent = account.equity > 0 ? riskDollars / account.equity : 1;
    const projectedExposure = account.totalExposure + (intent.side === "BUY" ? intent.notional : 0);
    const hour = account.now.getUTCHours();
    const checks: RiskDecision["evaluations"] = [
      { rule: "killSwitch", passed: !profile.killSwitch, detail: profile.killSwitch ? "Trading is paused" : "Trading enabled" },
      { rule: "positionDollars", passed: intent.notional <= profile.maxPositionDollars, detail: `${intent.notional} <= ${profile.maxPositionDollars}` },
      { rule: "positionPercent", passed: positionPercent <= profile.maxPositionPercent, detail: `${positionPercent} <= ${profile.maxPositionPercent}` },
      { rule: "riskDollars", passed: riskDollars <= profile.maxRiskPerTradeDollars, detail: `${riskDollars} <= ${profile.maxRiskPerTradeDollars}` },
      { rule: "riskPercent", passed: riskPercent <= profile.maxRiskPerTradePercent, detail: `${riskPercent} <= ${profile.maxRiskPerTradePercent}` },
      { rule: "dailyLossDollars", passed: account.dailyPnl > -profile.maxDailyLossDollars, detail: `${account.dailyPnl}` },
      { rule: "dailyLossPercent", passed: account.equity <= 0 || account.dailyPnl / account.equity > -profile.maxDailyLossPercent, detail: `${account.dailyPnl / account.equity}` },
      { rule: "openPositions", passed: account.openPositions < profile.maxOpenPositions, detail: `${account.openPositions} < ${profile.maxOpenPositions}` },
      { rule: "tradesPerDay", passed: account.tradesToday < profile.maxTradesPerDay, detail: `${account.tradesToday} < ${profile.maxTradesPerDay}` },
      { rule: "totalExposure", passed: projectedExposure <= profile.maxTotalExposure, detail: `${projectedExposure} <= ${profile.maxTotalExposure}` },
      { rule: "cashReserve", passed: intent.side === "SELL" || account.cash - intent.notional >= profile.minimumCashReserve, detail: `${account.cash - intent.notional} >= ${profile.minimumCashReserve}` },
      { rule: "assetClass", passed: profile.allowedAssetClasses.includes(intent.assetType), detail: intent.assetType },
      { rule: "allowedSymbol", passed: profile.allowedSymbols.length === 0 || profile.allowedSymbols.includes(intent.symbol), detail: intent.symbol },
      { rule: "blockedSymbol", passed: !profile.blockedSymbols.includes(intent.symbol), detail: intent.symbol },
      { rule: "tradingHours", passed: hour >= profile.allowedTradingHours.startUtcHour && hour < profile.allowedTradingHours.endUtcHour, detail: `${hour} UTC` },
      { rule: "stopLoss", passed: !profile.requireStopLoss || typeof intent.stopPrice === "number", detail: profile.requireStopLoss ? "Required" : "Optional" },
    ];
    return { approved: checks.every((check) => check.passed), evaluations: checks };
  }
}

export function canSubmit(mode: ExecutionMode, approved: boolean, userApproved: boolean, killSwitch: boolean) {
  if (killSwitch || !approved || mode === "RESEARCH_ONLY") return false;
  if (mode === "APPROVAL_REQUIRED") return userApproved;
  return mode === "AGENTIC_AUTO";
}