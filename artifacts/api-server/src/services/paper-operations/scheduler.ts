import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  db,
  operationsNotificationEvents,
  paperOperationsSessions,
  users,
} from "@workspace/db";

const CYCLE_INTERVAL_MS = 60 * 60_000;
const LEASE_MS = 20 * 60_000;

export function scheduledCycleKey(sessionId: string, dueAt: Date): string {
  return `paper-session:${sessionId}:${dueAt.toISOString()}`;
}

export function scheduledCycleHeaders(
  secret: string,
  clerkUserId: string,
  idempotencyKey: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-jarvis-scheduler-secret": secret,
    "x-jarvis-scheduler-user": clerkUserId,
    "x-idempotency-key": idempotencyKey,
  };
}

export async function runDuePaperOperations(input: {
  apiUrl: string;
  secret: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}) {
  const now = input.now ?? new Date();
  const fetchImpl = input.fetchImpl ?? fetch;
  const due = await db.select({
    session: paperOperationsSessions,
    clerkUserId: users.clerkUserId,
  }).from(paperOperationsSessions)
    .innerJoin(users, eq(users.id, paperOperationsSessions.userId))
    .where(and(
      eq(paperOperationsSessions.status, "RUNNING"),
      lte(paperOperationsSessions.nextExpectedCycleAt, now),
      or(
        isNull(paperOperationsSessions.cycleLeaseUntil),
        lt(paperOperationsSessions.cycleLeaseUntil, now),
      ),
    ));

  const results: Array<{ sessionId: string; status: string; httpStatus?: number }> = [];
  for (const row of due) {
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const [leased] = await db.update(paperOperationsSessions).set({
      cycleLeaseUntil: leaseUntil,
      updatedAt: now,
    }).where(and(
      eq(paperOperationsSessions.id, row.session.id),
      eq(paperOperationsSessions.status, "RUNNING"),
      or(
        isNull(paperOperationsSessions.cycleLeaseUntil),
        lt(paperOperationsSessions.cycleLeaseUntil, now),
      ),
    )).returning();
    if (!leased) {
      results.push({ sessionId: row.session.id, status: "SKIPPED_OVERLAP" });
      continue;
    }

    const dueAt = row.session.nextExpectedCycleAt ?? now;
    try {
      const response = await fetchImpl(
        `${input.apiUrl.replace(/\/$/, "")}/api/economic-engine/paper/autonomous-cycle`,
        {
          method: "POST",
          headers: scheduledCycleHeaders(
            input.secret,
            row.clerkUserId,
            scheduledCycleKey(row.session.id, dueAt),
          ),
          body: "{}",
          signal: AbortSignal.timeout(15 * 60_000),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: string };
        if (response.status === 409 && error.error === "PAPER_CYCLE_ALREADY_RUNNING") {
          await db.update(paperOperationsSessions).set({
            cycleLeaseUntil: null,
            updatedAt: new Date(),
          }).where(eq(paperOperationsSessions.id, row.session.id));
          results.push({
            sessionId: row.session.id,
            status: "SKIPPED_OVERLAP",
            httpStatus: response.status,
          });
          continue;
        }
        throw new Error(error.error ?? `SCHEDULER_HTTP_${response.status}`);
      }
      await db.update(paperOperationsSessions).set({
        cycleLeaseUntil: null,
        nextExpectedCycleAt: new Date(now.getTime() + CYCLE_INTERVAL_MS),
        updatedAt: new Date(),
      }).where(eq(paperOperationsSessions.id, row.session.id));
      results.push({ sessionId: row.session.id, status: "SUCCESS", httpStatus: response.status });
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 120) : "SYSTEM_ERROR";
      await db.transaction(async (tx) => {
        await tx.update(paperOperationsSessions).set({
          cycleLeaseUntil: null,
          failedCycles: sql`${paperOperationsSessions.failedCycles} + 1`,
          lastCycleAt: new Date(),
          lastOutcome: "SYSTEM_ERROR",
          lastErrorCode: code,
          updatedAt: new Date(),
        }).where(eq(paperOperationsSessions.id, row.session.id));
        await tx.insert(operationsNotificationEvents).values({
          userId: row.session.userId,
          eventType: "PAPER_SCHEDULER_FAILURE",
          severity: "ERROR",
          payload: { code, mode: "PAPER" },
        });
      });
      results.push({ sessionId: row.session.id, status: code });
    }
  }
  return { checkedAt: now.toISOString(), due: due.length, results };
}