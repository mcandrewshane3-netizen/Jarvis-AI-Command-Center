import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { getProviderCatalog, type ProviderStatus } from "../services/ai/provider";

const router: IRouter = Router();

const DEFAULT_READINESS_TIMEOUT_MS = 1_500;

type ReadinessDependencies = {
  pingDatabase: () => Promise<unknown>;
  getProviders: () => Promise<ProviderStatus[]>;
  now: () => Date;
  timeoutMs: number;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("READINESS_CHECK_TIMEOUT")), timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function getReadinessSnapshot(
  overrides: Partial<ReadinessDependencies> = {},
) {
  const dependencies: ReadinessDependencies = {
    pingDatabase: () => pool.query("select 1"),
    getProviders: () => getProviderCatalog(),
    now: () => new Date(),
    timeoutMs: DEFAULT_READINESS_TIMEOUT_MS,
    ...overrides,
  };

  const [databaseResult, providersResult] = await Promise.allSettled([
    withTimeout(Promise.resolve().then(dependencies.pingDatabase), dependencies.timeoutMs),
    withTimeout(Promise.resolve().then(dependencies.getProviders), dependencies.timeoutMs),
  ]);

  const databaseReady = databaseResult.status === "fulfilled";
  const configuredProviderCount = providersResult.status === "fulfilled"
    ? providersResult.value.filter((provider) =>
      (provider.id === "openai" || provider.id === "grok") && provider.configured,
    ).length
    : 0;
  const aiProviderReady = configuredProviderCount > 0;
  const status = databaseReady && aiProviderReady ? "ok" : "degraded";

  return {
    status,
    checks: {
      database: databaseReady ? "ok" : "unavailable",
      aiProvider: aiProviderReady ? "configured" : "unavailable",
      configuredProviderCount,
    },
    timestamp: dependencies.now().toISOString(),
  } as const;
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  const data = await getReadinessSnapshot();
  res.status(data.status === "ok" ? 200 : 503).json(data);
});

export default router;
