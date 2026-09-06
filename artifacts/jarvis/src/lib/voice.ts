export enum VoiceState {
  VOICE_IDLE = 'VOICE_IDLE',
  VOICE_REQUESTING_PERMISSION = 'VOICE_REQUESTING_PERMISSION',
  VOICE_LISTENING = 'VOICE_LISTENING',
  VOICE_TRANSCRIBING = 'VOICE_TRANSCRIBING',
  VOICE_THINKING = 'VOICE_THINKING',
  VOICE_SPEAKING = 'VOICE_SPEAKING',
  VOICE_INTERRUPTED = 'VOICE_INTERRUPTED',
  VOICE_ERROR = 'VOICE_ERROR',
  VOICE_UNAVAILABLE = 'VOICE_UNAVAILABLE',
}

export type VoiceEvent =
  | 'REQUEST_MIC'
  | 'PERMISSION_GRANTED'
  | 'STOP_LISTENING'
  | 'TRANSCRIPT_READY'
  | 'RESPONSE_STARTED'
  | 'PLAYBACK_STARTED'
  | 'RESPONSE_FINISHED'
  | 'INTERRUPT'
  | 'FAIL'
  | 'RESET'
  | 'UNSUPPORTED';

const transitions: Partial<Record<VoiceState, Partial<Record<VoiceEvent, VoiceState>>>> = {
  [VoiceState.VOICE_IDLE]: {
    REQUEST_MIC: VoiceState.VOICE_REQUESTING_PERMISSION,
    RESPONSE_STARTED: VoiceState.VOICE_THINKING,
    UNSUPPORTED: VoiceState.VOICE_UNAVAILABLE,
    FAIL: VoiceState.VOICE_ERROR,
  },
  [VoiceState.VOICE_REQUESTING_PERMISSION]: {
    PERMISSION_GRANTED: VoiceState.VOICE_LISTENING,
    INTERRUPT: VoiceState.VOICE_INTERRUPTED,
    FAIL: VoiceState.VOICE_ERROR,
  },
  [VoiceState.VOICE_LISTENING]: {
    STOP_LISTENING: VoiceState.VOICE_TRANSCRIBING,
    INTERRUPT: VoiceState.VOICE_INTERRUPTED,
    FAIL: VoiceState.VOICE_ERROR,
  },
  [VoiceState.VOICE_TRANSCRIBING]: {
    TRANSCRIPT_READY: VoiceState.VOICE_THINKING,
    INTERRUPT: VoiceState.VOICE_INTERRUPTED,
    FAIL: VoiceState.VOICE_ERROR,
  },
  [VoiceState.VOICE_THINKING]: {
    RESPONSE_STARTED: VoiceState.VOICE_THINKING,
    PLAYBACK_STARTED: VoiceState.VOICE_SPEAKING,
    RESPONSE_FINISHED: VoiceState.VOICE_IDLE,
    INTERRUPT: VoiceState.VOICE_INTERRUPTED,
    FAIL: VoiceState.VOICE_ERROR,
  },
  [VoiceState.VOICE_SPEAKING]: {
    RESPONSE_FINISHED: VoiceState.VOICE_IDLE,
    INTERRUPT: VoiceState.VOICE_INTERRUPTED,
    FAIL: VoiceState.VOICE_ERROR,
  },
  [VoiceState.VOICE_INTERRUPTED]: { RESET: VoiceState.VOICE_IDLE, REQUEST_MIC: VoiceState.VOICE_REQUESTING_PERMISSION },
  [VoiceState.VOICE_ERROR]: { RESET: VoiceState.VOICE_IDLE, REQUEST_MIC: VoiceState.VOICE_REQUESTING_PERMISSION },
  [VoiceState.VOICE_UNAVAILABLE]: {},
};

export function transitionVoiceState(state: VoiceState, event: VoiceEvent): VoiceState {
  return transitions[state]?.[event] ?? state;
}

export type VoiceActivation = 'START_CAPTURE' | 'STOP_CAPTURE' | 'INTERRUPT' | 'NONE';

export function decideVoiceActivation(state: VoiceState, externalThinking: boolean): VoiceActivation {
  if (externalThinking || state === VoiceState.VOICE_THINKING || state === VoiceState.VOICE_SPEAKING) {
    return 'INTERRUPT';
  }
  if (state === VoiceState.VOICE_LISTENING) return 'STOP_CAPTURE';
  if (
    state === VoiceState.VOICE_REQUESTING_PERMISSION ||
    state === VoiceState.VOICE_TRANSCRIBING ||
    state === VoiceState.VOICE_UNAVAILABLE
  ) {
    return 'NONE';
  }
  return 'START_CAPTURE';
}

export type SpokenDetail = 'BRIEF' | 'STANDARD' | 'DETAILED';

// Playback is intentionally unavailable, but summaries remain safe for a future provider:
// warnings and number-bearing sentences are never removed.
export function createSpokenSummary(text: string, detail: SpokenDetail): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || detail === 'DETAILED') return clean;
  const sentences = clean.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  const required = sentences.filter((sentence) =>
    /\d|[$%]|warning|warn|danger|risk|urgent|critical|error|do not|never/i.test(sentence),
  );
  const limit = detail === 'BRIEF' ? 1 : 3;
  return [...new Set([...sentences.slice(0, limit), ...required])].join(' ');
}

export class TTSQueue<T> {
  private queue: T[] = [];
  private cancelled = false;

  enqueue(item: T) {
    this.queue.push(item);
  }

  cancel() {
    this.cancelled = true;
    this.queue = [];
  }

  async drain(play: (item: T) => Promise<void>) {
    this.cancelled = false;
    while (this.queue.length && !this.cancelled) {
      const item = this.queue.shift();
      if (item !== undefined) await play(item);
    }
  }

  get size() {
    return this.queue.length;
  }
}