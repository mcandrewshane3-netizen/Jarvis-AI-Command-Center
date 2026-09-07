import express, { type Express, type Request } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { streamRecoveryPersistence } from "./middlewares/streamRecoveryPersistence";

const app: Express = express();

const productionOrigin = "https://jarvis-ai-command-center.replit.app";
const configuredOrigins = (process.env.JARVIS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set<string>([productionOrigin, ...configuredOrigins]);

if (process.env.NODE_ENV !== "production") {
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) {
    allowedOrigins.add(`https://${devDomain}`);
  }
}

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.has(origin)) return true;

  if (process.env.NODE_ENV !== "production") {
    try {
      const url = new URL(origin);
      return (
        url.protocol === "http:" &&
        (url.hostname === "127.0.0.1" || url.hostname === "localhost")
      );
    } catch {
      return false;
    }
  }

  return false;
}

function isStateChanging(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function hasCookieCredentials(req: Request): boolean {
  return typeof req.headers.cookie === "string" && req.headers.cookie.length > 0;
}

function hasNonCookieServiceAuth(req: Request): boolean {
  const authorization = req.headers.authorization;
  if (authorization?.toLowerCase().startsWith("bearer ")) return true;

  return Boolean(
    req.headers["x-paper-scheduler-secret"] ||
      req.headers["x-scheduler-secret"] ||
      req.headers["x-jarvis-scheduler-secret"],
  );
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && !isAllowedOrigin(origin)) {
    res.status(403).json({ error: "CROSS_ORIGIN_REQUEST_BLOCKED" });
    return;
  }

  if (
    process.env.NODE_ENV === "production" &&
    isStateChanging(req.method) &&
    !origin &&
    hasCookieCredentials(req) &&
    !hasNonCookieServiceAuth(req)
  ) {
    res.status(403).json({ error: "REQUEST_ORIGIN_REQUIRED" });
    return;
  }

  next();
});

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);
app.use(streamRecoveryPersistence);

app.use("/api", router);

export default app;
