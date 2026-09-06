import type { PaperFill, PaperOrder, PaperOrderRequest } from "./contracts.js";

export interface PaperExecutionCosts {
  feeRate: number;
  minimumFee: number;
  spreadBps: Record<"STOCK" | "ETF" | "CRYPTO", number>;
  slippageBps: Record<"STOCK" | "ETF" | "CRYPTO", number>;
}

const DEFAULT_COSTS: PaperExecutionCosts = {
  feeRate: 0.0005,
  minimumFee: 0,
  spreadBps: { STOCK: 2, ETF: 1, CRYPTO: 10 },
  slippageBps: { STOCK: 3, ETF: 2, CRYPTO: 15 },
};

/** Deterministic simulation only. It has no live broker or network dependency. */
export class PaperBroker {
  readonly mode = "PAPER" as const;
  private sequence = 0;
  private readonly orders = new Map<string, PaperOrder>();

  constructor(private readonly costs: PaperExecutionCosts = DEFAULT_COSTS) {
    const values = [
      costs.feeRate, costs.minimumFee,
      ...Object.values(costs.spreadBps), ...Object.values(costs.slippageBps),
    ];
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("Execution costs must be finite and non-negative");
    }
  }

  submit(request: PaperOrderRequest): PaperOrder {
    this.validateRequest(request);
    const order: PaperOrder = {
      ...request,
      id: `paper-order-${++this.sequence}`,
      mode: "PAPER",
      status: "PENDING",
      filledQuantity: 0,
      averageFillPrice: null,
      fills: [],
    };
    this.orders.set(order.id, order);
    return structuredClone(order);
  }

  reject(orderId: string, reason: string): PaperOrder {
    const order = this.mutable(orderId);
    if (order.status !== "PENDING") throw new Error("Only pending orders may be rejected");
    if (!reason.trim()) throw new Error("Rejection reason is required");
    order.status = "REJECTED";
    order.rejectionReason = reason;
    return structuredClone(order);
  }

  cancel(orderId: string): PaperOrder {
    const order = this.mutable(orderId);
    if (!["PENDING", "PARTIALLY_FILLED"].includes(order.status)) {
      throw new Error("Order is not cancellable");
    }
    order.status = "CANCELLED";
    return structuredClone(order);
  }

  fill(orderId: string, quote: number, availableQuantity: number, timestamp: string): PaperOrder {
    const order = this.mutable(orderId);
    if (!["PENDING", "PARTIALLY_FILLED"].includes(order.status)) throw new Error("Order is not fillable");
    if (!Number.isFinite(quote) || quote <= 0 || !Number.isFinite(availableQuantity) || availableQuantity <= 0 ||
        !Number.isFinite(Date.parse(timestamp))) {
      throw new Error("Valid quote, liquidity, and timestamp are required");
    }
    if (order.orderType === "LIMIT") {
      const marketable = order.side === "BUY" ? quote <= order.limitPrice! : quote >= order.limitPrice!;
      if (!marketable) return structuredClone(order);
    }
    const quantity = Math.min(availableQuantity, order.quantity - order.filledQuantity);
    const direction = order.side === "BUY" ? 1 : -1;
    const spreadRate = this.costs.spreadBps[order.assetClass] / 20_000;
    const slippageRate = this.costs.slippageBps[order.assetClass] / 10_000;
    let price = quote * (1 + direction * (spreadRate + slippageRate));
    if (order.orderType === "LIMIT") {
      price = order.side === "BUY" ? Math.min(price, order.limitPrice!) : Math.max(price, order.limitPrice!);
    }
    const grossNotional = price * quantity;
    const fill: PaperFill = {
      id: `paper-fill-${++this.sequence}`,
      orderId,
      mode: "PAPER",
      quantity,
      referencePrice: quote,
      price,
      grossNotional,
      fee: Math.max(this.costs.minimumFee, grossNotional * this.costs.feeRate),
      spreadCost: quote * quantity * spreadRate,
      slippageCost: quote * quantity * slippageRate,
      timestamp,
    };
    order.fills.push(fill);
    order.filledQuantity += quantity;
    order.averageFillPrice = order.fills.reduce((sum, item) => sum + item.price * item.quantity, 0) /
      order.filledQuantity;
    order.status = order.filledQuantity === order.quantity ? "FILLED" : "PARTIALLY_FILLED";
    return structuredClone(order);
  }

  getOrder(id: string): PaperOrder | undefined {
    const order = this.orders.get(id);
    return order ? structuredClone(order) : undefined;
  }

  listOrders(): PaperOrder[] {
    return [...this.orders.values()].map((order) => structuredClone(order));
  }

  private mutable(id: string): PaperOrder {
    const order = this.orders.get(id);
    if (!order) throw new Error("Unknown paper order");
    return order;
  }

  private validateRequest(request: PaperOrderRequest): void {
    if (!request.symbol.trim() || !request.strategyId.trim() || !request.strategyVersion.trim() ||
        !Number.isFinite(request.quantity) || request.quantity <= 0 ||
        !Number.isFinite(Date.parse(request.submittedAt))) throw new Error("Invalid paper order request");
    if (request.orderType === "LIMIT" && (!Number.isFinite(request.limitPrice) || request.limitPrice! <= 0)) {
      throw new Error("Limit price is required");
    }
  }
}