import { describe, expect, it } from "vitest";
import { boundedProviderOutputTokens, outputBudgetForMode, providerOutputCeiling } from "./cost-controls";

describe("JARVIS provider cost controls", () => {
  it("uses a conservative default provider ceiling", () => {
    expect(providerOutputCeiling("")).toBe(3000);
  });

  it("clamps configured ceilings to safe bounds", () => {
    expect(providerOutputCeiling("100")).toBe(256);
    expect(providerOutputCeiling("99999")).toBe(8192);
    expect(providerOutputCeiling("not-a-number")).toBe(3000);
  });

  it("assigns smaller budgets to normal and smart operation", () => {
    expect(outputBudgetForMode("NORMAL", "8192")).toBe(900);
    expect(outputBudgetForMode("SMART", "8192")).toBe(1800);
    expect(outputBudgetForMode("MAX", "8192")).toBe(3000);
  });

  it("never lets an individual provider request exceed the configured ceiling", () => {
    expect(boundedProviderOutputTokens(7000, "3000")).toBe(3000);
    expect(boundedProviderOutputTokens(100, "3000")).toBe(256);
    expect(boundedProviderOutputTokens(undefined, "3000")).toBe(3000);
  });
});
