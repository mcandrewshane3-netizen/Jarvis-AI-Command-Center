import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";

export type AuthenticatedRequest = Request & { clerkUserId: string };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const schedulerSecret = req.header("x-jarvis-scheduler-secret");
  const expectedSecret = process.env.PAPER_SCHEDULER_SECRET;
  const schedulerUser = req.header("x-jarvis-scheduler-user");
  const schedulerRoute = req.method === "POST" &&
    req.path === "/economic-engine/paper/autonomous-cycle";
  if (schedulerRoute && schedulerSecret && expectedSecret && schedulerUser) {
    const supplied = Buffer.from(schedulerSecret);
    const expected = Buffer.from(expectedSecret);
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
      (req as unknown as AuthenticatedRequest).clerkUserId = schedulerUser;
      next();
      return;
    }
  }
  const auth = getAuth(req);
  const userId = auth.sessionClaims?.sub ?? auth.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as unknown as AuthenticatedRequest).clerkUserId = userId;
  next();
}