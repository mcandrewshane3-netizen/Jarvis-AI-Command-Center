import type { AssetClass, TradableAsset } from "./types";
export const AUTONOMOUS_CRYPTO_CORE_UNIVERSE = [
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "XRP/USD",
  "ADA/USD",
  "DOGE/USD",
  "AVAX/USD",
  "LINK/USD",
] as const;

export interface LiquidityRules {
  minimumAverageDailyVolume: number;
  minimumAverageDailyDollarVolume: number;
  maximumSpreadBps: number;
}

export interface UniverseConfig {
  id: string;
  name: string;
  assetClasses: readonly AssetClass[];
  symbols?: readonly string[];
  liquidity: LiquidityRules;
}

export interface UniverseMembership {
  asset: TradableAsset;
  included: boolean;
  reasons: readonly string[];
}

export class TradingUniverse {
  constructor(readonly config: UniverseConfig) {
    if (!config.id || !config.name || !config.assetClasses.length) throw new Error("Universe identity and asset classes are required");
    if (Object.values(config.liquidity).some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("Liquidity rules must be finite and non-negative");
    }
  }

  inspect(assets: readonly TradableAsset[]): readonly UniverseMembership[] {
    return assets.map((asset) => {
      const reasons: string[] = [];
      if (!this.config.assetClasses.includes(asset.assetClass)) reasons.push("ASSET_CLASS_EXCLUDED");
      if (this.config.symbols && !this.config.symbols.includes(asset.symbol)) reasons.push("SYMBOL_EXCLUDED");
      const liquidity = asset.liquidityData;
      if (!liquidity) reasons.push("LIQUIDITY_DATA_REQUIRED");
      else {
        if ((liquidity.averageDailyVolume ?? -1) < this.config.liquidity.minimumAverageDailyVolume) reasons.push("VOLUME_TOO_LOW");
        if ((liquidity.averageDailyDollarVolume ?? -1) < this.config.liquidity.minimumAverageDailyDollarVolume) {
          reasons.push("DOLLAR_VOLUME_TOO_LOW");
        }
        if ((liquidity.spreadBps ?? Infinity) > this.config.liquidity.maximumSpreadBps) reasons.push("SPREAD_TOO_WIDE");
      }
      return { asset, included: reasons.length === 0, reasons };
    });
  }

  members(assets: readonly TradableAsset[]): readonly TradableAsset[] {
    return this.inspect(assets).filter((item) => item.included).map((item) => item.asset);
  }
}