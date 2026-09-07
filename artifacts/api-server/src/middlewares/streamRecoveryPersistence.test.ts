import { describe, expect, it } from "vitest";
import { consumeJarvisStreamEvents, interruptedAssistantContent } from "./streamRecoveryPersistence";

describe("JARVIS interrupted stream recovery", () => {
  it("collects streamed assistant content and recognizes completion", () => {
    const first = consumeJarvisStreamEvents("", 'data: {"content":"Hello "}\n\n');
    const second = consumeJarvisStreamEvents(first.remaining, 'data: {"content":"Shane"}\n\ndata: {"done":true}\n\n');

    expect(first.content + second.content).toBe("Hello Shane");
    expect(second.done).toBe(true);
    expect(second.remaining).toBe("");
  });

  it("keeps incomplete SSE data buffered until the event is complete", () => {
    const first = consumeJarvisStreamEvents("", 'data: {"content":"Part');
    const second = consumeJarvisStreamEvents(first.remaining, 'ial"}\n\n');

    expect(first.content).toBe("");
    expect(second.content).toBe("Partial");
  });

  it("marks partial assistant text without duplicating the marker", () => {
    const marked = interruptedAssistantContent("A partial answer.   ");
    expect(marked).toBe("A partial answer.\n\n[Response interrupted — partial response preserved.]");
    expect(interruptedAssistantContent(marked ?? "")).toBe(marked);
    expect(interruptedAssistantContent("   ")).toBeNull();
  });
});
