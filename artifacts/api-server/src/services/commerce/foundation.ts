export type CommerceChannel = "TIKTOK_SHOP" | "DROPSHIPPING" | "DIRECT_ECOMMERCE";
export type AdapterStatus = "NOT_CONFIGURED";

export interface CommerceAdapter {
  readonly name: string;
  readonly status: AdapterStatus;
  readonly canExecute: false;
}

abstract class NotConfiguredAdapter implements CommerceAdapter {
  readonly status = "NOT_CONFIGURED" as const;
  readonly canExecute = false as const;
  abstract readonly name: string;
}

export class TikTokShopAdapter extends NotConfiguredAdapter { readonly name = "TikTokShopAdapter"; }
export class SupplierAdapter extends NotConfiguredAdapter { readonly name = "SupplierAdapter"; }
export class StorefrontAdapter extends NotConfiguredAdapter { readonly name = "StorefrontAdapter"; }
export class OrderManagementAdapter extends NotConfiguredAdapter { readonly name = "OrderManagementAdapter"; }
export class FulfillmentAdapter extends NotConfiguredAdapter { readonly name = "FulfillmentAdapter"; }
export class CustomerServiceAdapter extends NotConfiguredAdapter { readonly name = "CustomerServiceAdapter"; }
export class AdvertisingAdapter extends NotConfiguredAdapter { readonly name = "AdvertisingAdapter"; }
export class AnalyticsAdapter extends NotConfiguredAdapter { readonly name = "AnalyticsAdapter"; }
export class ContentPublishingAdapter extends NotConfiguredAdapter { readonly name = "ContentPublishingAdapter"; }

export class CommerceOperator {
  readonly mode = "FOUNDATION_ONLY" as const;
  readonly connected = false;
  readonly spendingEnabled = false;
  readonly adapters: readonly CommerceAdapter[];

  constructor() {
    this.adapters = Object.freeze([
      new TikTokShopAdapter(), new SupplierAdapter(), new StorefrontAdapter(),
      new OrderManagementAdapter(), new FulfillmentAdapter(), new CustomerServiceAdapter(),
      new AdvertisingAdapter(), new AnalyticsAdapter(), new ContentPublishingAdapter(),
    ]);
  }

  getStatus() {
    return {
      mode: this.mode,
      connected: this.connected,
      spendingEnabled: this.spendingEnabled,
      adapters: this.adapters.map(({ name, status, canExecute }) => ({ name, status, canExecute })),
    };
  }

  execute(): never {
    throw new Error("COMMERCE_EXECUTION_NOT_CONFIGURED");
  }
}

export type ProductLifecycleStage =
  | "DISCOVERED" | "RESEARCHING" | "UNIT_ECONOMICS_VALIDATED" | "READY_FOR_TEST"
  | "LIMITED_TEST" | "VALIDATING" | "SCALING" | "WATCH" | "PAUSED" | "KILLED";

const LIFECYCLE_TRANSITIONS: Record<ProductLifecycleStage, readonly ProductLifecycleStage[]> = {
  DISCOVERED: ["RESEARCHING", "PAUSED", "KILLED"],
  RESEARCHING: ["UNIT_ECONOMICS_VALIDATED", "PAUSED", "KILLED"],
  UNIT_ECONOMICS_VALIDATED: ["READY_FOR_TEST", "RESEARCHING", "PAUSED", "KILLED"],
  READY_FOR_TEST: ["LIMITED_TEST", "PAUSED", "KILLED"],
  LIMITED_TEST: ["VALIDATING", "WATCH", "PAUSED", "KILLED"],
  VALIDATING: ["SCALING", "WATCH", "PAUSED", "KILLED"],
  SCALING: ["WATCH", "PAUSED", "KILLED"],
  WATCH: ["VALIDATING", "SCALING", "PAUSED", "KILLED"],
  PAUSED: ["RESEARCHING", "READY_FOR_TEST", "LIMITED_TEST", "KILLED"],
  KILLED: [],
};

export type LifecycleTransitionDecision =
  | { allowed: true; from: ProductLifecycleStage; to: ProductLifecycleStage }
  | { allowed: false; from: ProductLifecycleStage; requested: unknown; reason: string };

export function validateProductLifecycleTransition(
  from: ProductLifecycleStage,
  requested: unknown,
): LifecycleTransitionDecision {
  if (!Object.hasOwn(LIFECYCLE_TRANSITIONS, from)) {
    return { allowed: false, from, requested, reason: "INVALID_CURRENT_STAGE" };
  }
  if (typeof requested !== "string" || !Object.hasOwn(LIFECYCLE_TRANSITIONS, requested)) {
    return { allowed: false, from, requested, reason: "INVALID_TARGET_STAGE" };
  }
  if (!LIFECYCLE_TRANSITIONS[from].includes(requested as ProductLifecycleStage)) {
    return { allowed: false, from, requested, reason: from === "KILLED" ? "KILL_IS_FINAL" : "LIFECYCLE_STAGES_MUST_NOT_BE_SKIPPED" };
  }
  return { allowed: true, from, to: requested as ProductLifecycleStage };
}