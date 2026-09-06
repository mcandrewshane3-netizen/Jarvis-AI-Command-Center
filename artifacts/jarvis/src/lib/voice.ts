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

const SPOKEN_SUMMARY_MAX_CHARS = 900;
const SPOKEN_SUMMARY_NOTICE = 'Additional details are shown on screen.';

function capSpokenSummary(summary: string, sentences: readonly string[], leadingCount: number): string {
  if (summary.length <= SPOKEN_SUMMARY_MAX_CHARS) return summary;
  const safety = sentences.filter((sentence) =>
    /warning|warn|danger|risk|urgent|critical|error|do not|never/i.test(sentence),
  );
  const prioritized = [...new Set([...sentences.slice(0, Math.min(leadingCount, 1)), ...safety])];
  const selected: string[] = [];
  for (const sentence of prioritized) {
    const candidate = [...selected, sentence, SPOKEN_SUMMARY_NOTICE].join(' ');
    if (candidate.length <= SPOKEN_SUMMARY_MAX_CHARS) selected.push(sentence);
  }
  const spoken = [...selected, SPOKEN_SUMMARY_NOTICE].join(' ');
  return spoken.length <= SPOKEN_SUMMARY_MAX_CHARS
    ? spoken
    : `${spoken.slice(0, SPOKEN_SUMMARY_MAX_CHARS - SPOKEN_SUMMARY_NOTICE.length - 1).trimEnd()} ${SPOKEN_SUMMARY_NOTICE}`;
}

// Short summaries preserve warnings and number-bearing sentences. Overlong
// speech is reduced to a lead and safety statements; full detail stays on screen.
export function createSpokenSummary(text: string, detail: SpokenDetail): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return clean;
  const sentences = clean
    .split(/(?<=[!?])\s+|(?<=\.)\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const required = sentences.filter((sentence) =>
    /\d|[$%]|warning|warn|danger|risk|urgent|critical|error|do not|never/i.test(sentence),
  );
  const limit = detail === 'BRIEF' ? 1 : detail === 'STANDARD' ? 3 : sentences.length;
  const summary = detail === 'DETAILED'
    ? clean
    : [...new Set([...sentences.slice(0, limit), ...required])].join(' ');
  return capSpokenSummary(summary, sentences, detail === 'DETAILED' ? 3 : limit);
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