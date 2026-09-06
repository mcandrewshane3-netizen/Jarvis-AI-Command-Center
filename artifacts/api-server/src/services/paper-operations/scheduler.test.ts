import { describe, expect, it } from "vitest";
import { scheduledCycleHeaders, scheduledCycleKey } from "./scheduler";

describe("PAPER operations scheduler", () => {
  it("creates a stable cycle key for retry-safe scheduled invocations", () => {
    const dueAt = new Date("2026-09-06T20:00:00.000Z");
    expect(scheduledCycleKey("session-1", dueAt))
      .toBe("paper-session:session-1:2026-09-06T20:00:00.000Z");
  });

  it("keeps scheduler identity and idempotency in server-only headers", () => {
    expect(scheduledCycleHeaders("secret", "clerk-user", "cycle-key")).toEqual({
      "content-type": "application/json",
      "x-jarvis-scheduler-secret": "secret",
      "x-jarvis-scheduler-user": "clerk-user",
      "x-idempotency-key": "cycle-key",
    });
  });
});