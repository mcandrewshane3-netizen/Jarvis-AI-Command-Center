import type { NextFunction, Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import { conversations, db, messages } from "@workspace/db";
import { logger } from "../lib/logger";

const STREAM_PATH = /^\/api\/conversations\/([0-9a-f-]+)\/messages\/stream$/i;
const INTERRUPTED_MARKER = "[Response interrupted — partial response preserved.]";

type StreamCapture = {
  remaining: string;
  content: string;
  done: boolean;
};

export function consumeJarvisStreamEvents(buffer: string, chunk: string): StreamCapture {
  const combined = buffer + chunk;
  const events = combined.split("\n\n");
  const remaining = events.pop() ?? "";
  let content = "";
  let done = false;

  for (const event of events) {
    const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) continue;
    try {
      const data = JSON.parse(dataLine.slice(6)) as { content?: unknown; done?: unknown };
      if (typeof data.content === "string") content += data.content;
      if (data.done === true) done = true;
    } catch {
      // Ignore malformed/non-JARVIS SSE events. The route remains authoritative.
    }
  }

  return { remaining, content, done };
}

export function interruptedAssistantContent(content: string): string | null {
  const partial = content.trimEnd();
  if (!partial.trim()) return null;
  if (partial.endsWith(INTERRUPTED_MARKER)) return partial;
  return `${partial}\n\n${INTERRUPTED_MARKER}`;
}

function chunkToText(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString("utf8");
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString("utf8");
  return "";
}

async function persistInterruptedConversation(conversationId: string, capturedContent: string) {
  const interrupted = interruptedAssistantContent(capturedContent);
  if (!interrupted) return;

  const [conversation] = await db
    .select({ id: conversations.id, domain: conversations.domain })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conversation) return;

  const [latest] = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(desc(messages.createdAt))
    .limit(1);

  const exactPartial = capturedContent.trimEnd();
  if (latest?.role === "assistant" && (latest.content === exactPartial || latest.content === interrupted)) {
    return;
  }

  await db.insert(messages).values({
    conversationId: conversation.id,
    role: "assistant",
    content: interrupted,
    domain: conversation.domain,
  });
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
}

/**
 * Safety net for interrupted SSE responses. The JARVIS route is still responsible
 * for normal persistence. This middleware only records streamed assistant text when
 * a response terminates before its explicit `done` event, so an iPad refresh or a
 * dropped connection cannot erase text the user already saw.
 */
export function streamRecoveryPersistence(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "POST") {
    next();
    return;
  }

  const match = STREAM_PATH.exec(req.path);
  if (!match) {
    next();
    return;
  }

  const conversationId = match[1];
  let eventBuffer = "";
  let capturedContent = "";
  let sawDone = false;
  let persistenceStarted = false;

  const originalWrite = res.write.bind(res);
  res.write = ((chunk: unknown, ...args: unknown[]) => {
    const text = chunkToText(chunk);
    if (text) {
      const capture = consumeJarvisStreamEvents(eventBuffer, text);
      eventBuffer = capture.remaining;
      capturedContent += capture.content;
      sawDone ||= capture.done;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(chunk, ...args);
  }) as typeof res.write;

  const persistIfInterrupted = () => {
    if (persistenceStarted || sawDone || !capturedContent.trim()) return;
    persistenceStarted = true;
    void persistInterruptedConversation(conversationId, capturedContent).catch((error) => {
      logger.warn({ err: error, conversationId }, "failed to persist interrupted JARVIS response");
    });
  };

  res.once("finish", persistIfInterrupted);
  res.once("close", persistIfInterrupted);
  next();
}
