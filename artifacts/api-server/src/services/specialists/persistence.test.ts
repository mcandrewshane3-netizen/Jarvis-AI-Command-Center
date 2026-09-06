import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, specialistRecords, users } from "@workspace/db";

describe("specialist record persistence", () => {
  const clerkUserA = `specialist-test-a-${randomUUID()}`;
  const clerkUserB = `specialist-test-b-${randomUUID()}`;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;

  beforeAll(async () => {
    [userA] = await db.insert(users).values({ clerkUserId: clerkUserA }).returning();
    [userB] = await db.insert(users).values({ clerkUserId: clerkUserB }).returning();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.clerkUserId, clerkUserA));
    await db.delete(users).where(eq(users.clerkUserId, clerkUserB));
  });

  it("persists manual finance data without inventing a connected source", async () => {
    const [inserted] = await db.insert(specialistRecords).values({
      userId: userA.id,
      specialist: "FINANCE",
      recordType: "FINANCIAL_ACCOUNT",
      title: "Manual cash",
      source: "MANUAL",
      data: { name: "Manual cash", type: "CASH", currency: "USD", balanceCents: 12_345 },
    }).returning();

    const [stored] = await db
      .select()
      .from(specialistRecords)
      .where(and(eq(specialistRecords.id, inserted.id), eq(specialistRecords.userId, userA.id)));

    expect(stored.source).toBe("MANUAL");
    expect(stored.data).toMatchObject({ balanceCents: 12_345, currency: "USD" });
  });

  it.each([
    ["CAREER", "CAREER_PROFILE", { source: "USER_PROVIDED", skills: ["TypeScript"] }],
    ["BUSINESS", "BUSINESS_TASK", { description: "Validate demand", status: "PLANNED" }],
    ["SOFTWARE", "REQUIREMENT", { description: "Preserve auth", priority: "MUST" }],
  ])("persists %s records for the owning user", async (specialist, recordType, data) => {
    const [inserted] = await db.insert(specialistRecords).values({
      userId: userA.id,
      specialist,
      recordType,
      title: `${specialist} record`,
      source: "MANUAL",
      data,
    }).returning();

    const visibleToOwner = await db
      .select()
      .from(specialistRecords)
      .where(and(eq(specialistRecords.id, inserted.id), eq(specialistRecords.userId, userA.id)));
    const visibleToOtherUser = await db
      .select()
      .from(specialistRecords)
      .where(and(eq(specialistRecords.id, inserted.id), eq(specialistRecords.userId, userB.id)));

    expect(visibleToOwner).toHaveLength(1);
    expect(visibleToOtherUser).toHaveLength(0);
    expect(visibleToOwner[0]?.data).toMatchObject(data);
  });
});