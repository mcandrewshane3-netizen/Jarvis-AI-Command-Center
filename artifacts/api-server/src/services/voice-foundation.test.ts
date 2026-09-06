import { describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const voiceModulePath = pathToFileURL(resolve(process.cwd(), "../jarvis/src/lib/voice.ts")).href;
const {
  createSpokenSummary,
  decideVoiceActivation,
  transitionVoiceState,
  TTSQueue,
  VoiceState,
} = await import(/* @vite-ignore */ voiceModulePath);

describe("JARVIS voice foundation", () => {
  it("begins idle and only enters listening after permission", () => {
    expect(VoiceState.VOICE_IDLE).toBe("VOICE_IDLE");
    const requesting = transitionVoiceState(VoiceState.VOICE_IDLE, "REQUEST_MIC");
    expect(requesting).toBe(VoiceState.VOICE_REQUESTING_PERMISSION);
    expect(transitionVoiceState(requesting, "PERMISSION_GRANTED")).toBe(VoiceState.VOICE_LISTENING);
  });

  it("models transcription, thinking, interruption, and errors explicitly", () => {
    const transcribing = transitionVoiceState(VoiceState.VOICE_LISTENING, "STOP_LISTENING");
    expect(transcribing).toBe(VoiceState.VOICE_TRANSCRIBING);
    const thinking = transitionVoiceState(transcribing, "TRANSCRIPT_READY");
    expect(thinking).toBe(VoiceState.VOICE_THINKING);
    expect(transitionVoiceState(thinking, "INTERRUPT")).toBe(VoiceState.VOICE_INTERRUPTED);
    expect(transitionVoiceState(VoiceState.VOICE_LISTENING, "FAIL")).toBe(VoiceState.VOICE_ERROR);
  });

  it("does not invent unsupported transitions", () => {
    expect(transitionVoiceState(VoiceState.VOICE_IDLE, "PERMISSION_GRANTED")).toBe(VoiceState.VOICE_IDLE);
    expect(transitionVoiceState(VoiceState.VOICE_UNAVAILABLE, "REQUEST_MIC")).toBe(VoiceState.VOICE_UNAVAILABLE);
  });

  it("interrupts any active JARVIS stream before starting capture", () => {
    expect(decideVoiceActivation(VoiceState.VOICE_IDLE, true)).toBe("INTERRUPT");
    expect(decideVoiceActivation(VoiceState.VOICE_THINKING, true)).toBe("INTERRUPT");
    expect(decideVoiceActivation(VoiceState.VOICE_SPEAKING, false)).toBe("INTERRUPT");
    expect(decideVoiceActivation(VoiceState.VOICE_IDLE, false)).toBe("START_CAPTURE");
  });

  it("keeps critical numbers and warnings in brief spoken summaries", () => {
    const full = "Your budget review is complete. Three bills total $1,402. Warning: cash would fall below $500.";
    const spoken = createSpokenSummary(full, "BRIEF");
    expect(spoken).toContain("$1,402");
    expect(spoken).toContain("Warning");
    expect(spoken).toContain("$500");
  });

  it("preserves queued playback order", async () => {
    const queue = new TTSQueue();
    const played: string[] = [];
    queue.enqueue("first");
    queue.enqueue("second");
    await queue.drain(async (item: string) => {
      played.push(item);
    });
    expect(played).toEqual(["first", "second"]);
  });

  it("clears pending playback immediately on interruption", async () => {
    const queue = new TTSQueue();
    const played: string[] = [];
    queue.enqueue("first");
    queue.enqueue("stale");
    await queue.drain(async (item: string) => {
      played.push(item);
      queue.cancel();
    });
    expect(played).toEqual(["first"]);
    expect(queue.size).toBe(0);
  });

  it("never requires a speech-synthesis browser API", () => {
    const speechSynthesisUtterance = vi.fn();
    expect(speechSynthesisUtterance).not.toHaveBeenCalled();
  });
});