import { useCallback, useEffect, useRef, useState } from 'react';
import { transitionVoiceState, VoiceEvent, VoiceState } from '@/lib/voice';

interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionErrorLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): RecognitionConstructor | undefined {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export function browserVoiceSupport() {
  return {
    stt: typeof window !== 'undefined' && Boolean(recognitionConstructor()),
    microphone: typeof navigator !== 'undefined'
      && Boolean(navigator.mediaDevices?.getUserMedia)
      && typeof MediaRecorder !== 'undefined',
    tts: false as const,
  };
}

export function useVoice({
  enabled,
  isThinking,
  onTranscript,
  onCancelThinking,
}: {
  enabled: boolean;
  isThinking: boolean;
  onTranscript: (transcript: string) => void | Promise<void>;
  onCancelThinking: () => void;
}) {
  const support = browserVoiceSupport();
  const available = support.stt && support.microphone;
  const [state, setState] = useState<VoiceState>(available ? VoiceState.VOICE_IDLE : VoiceState.VOICE_UNAVAILABLE);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const finalTranscriptRef = useRef('');
  const submitRef = useRef(onTranscript);

  useEffect(() => { submitRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { stateRef.current = state; }, [state]);

  const move = useCallback((event: VoiceEvent) => {
    setState((current) => {
      const next = transitionVoiceState(current, event);
      stateRef.current = next;
      return next;
    });
  }, []);

  const releaseCapture = useCallback((abortRecognition = false) => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { abortRecognition ? recognition.abort() : recognition.stop(); } catch { /* already stopped */ }
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* already stopped */ }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const fail = useCallback((message: string) => {
    releaseCapture(true);
    setError(message);
    move('FAIL');
  }, [move, releaseCapture]);

  const submitTranscript = useCallback(() => {
    const final = finalTranscriptRef.current.trim();
    releaseCapture();
    if (!final) {
      fail('No speech was recognized. Check microphone access and try again.');
      return;
    }
    setTranscript(final);
    move('TRANSCRIPT_READY');
    void submitRef.current(final);
  }, [fail, move, releaseCapture]);

  const start = useCallback(async () => {
    if (!enabled) {
      setError('Voice input is disabled in Settings.');
      return;
    }
    const Constructor = recognitionConstructor();
    if (!available || !Constructor) {
      stateRef.current = VoiceState.VOICE_UNAVAILABLE;
      setState(VoiceState.VOICE_UNAVAILABLE);
      setError('Browser speech recognition or microphone capture is unavailable.');
      return;
    }
    setError(null);
    setTranscript('');
    finalTranscriptRef.current = '';
    move('REQUEST_MIC');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (stateRef.current !== VoiceState.VOICE_REQUESTING_PERMISSION) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      // MediaRecorder verifies genuine capture. No data handler, Blob, persistence, or upload exists.
      recorderRef.current = recorder;
      recorder.start();

      const recognition = new Constructor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';
      recognition.onresult = (event) => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result.isFinal) finalTranscriptRef.current += `${result[0].transcript} `;
          else interim += result[0].transcript;
        }
        setTranscript(`${finalTranscriptRef.current}${interim}`.trim());
      };
      recognition.onerror = (event) => {
        if (event.error === 'aborted') return;
        const permission = event.error === 'not-allowed' || event.error === 'service-not-allowed';
        fail(permission ? 'Microphone or speech recognition permission was denied.' : `Speech recognition failed: ${event.message || event.error}.`);
      };
      recognition.onend = () => {
        if (stateRef.current === VoiceState.VOICE_LISTENING || stateRef.current === VoiceState.VOICE_TRANSCRIBING) {
          stateRef.current = VoiceState.VOICE_TRANSCRIBING;
          setState(VoiceState.VOICE_TRANSCRIBING);
          submitTranscript();
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      move('PERMISSION_GRANTED');
    } catch (caught) {
      const denied = caught instanceof DOMException && (caught.name === 'NotAllowedError' || caught.name === 'SecurityError');
      fail(denied ? 'Microphone permission was denied. Allow access, then retry.' : 'The microphone could not be started.');
    }
  }, [available, enabled, fail, move, submitTranscript]);

  const stop = useCallback(() => {
    if (stateRef.current !== VoiceState.VOICE_LISTENING) return;
    move('STOP_LISTENING');
    try { recognitionRef.current?.stop(); } catch { submitTranscript(); }
  }, [move, submitTranscript]);

  const interrupt = useCallback(() => {
    releaseCapture(true);
    onCancelThinking();
    move('INTERRUPT');
  }, [move, onCancelThinking, releaseCapture]);

  const activate = useCallback(() => {
    if (state === VoiceState.VOICE_LISTENING) stop();
    else if (state === VoiceState.VOICE_THINKING || state === VoiceState.VOICE_SPEAKING) interrupt();
    else if (state !== VoiceState.VOICE_REQUESTING_PERMISSION && state !== VoiceState.VOICE_TRANSCRIBING && state !== VoiceState.VOICE_UNAVAILABLE) void start();
  }, [interrupt, start, state, stop]);

  useEffect(() => {
    if (isThinking && stateRef.current === VoiceState.VOICE_THINKING) move('RESPONSE_STARTED');
    if (!isThinking && stateRef.current === VoiceState.VOICE_THINKING) move('RESPONSE_FINISHED');
  }, [isThinking, move]);

  useEffect(() => {
    const suspend = (force = false) => {
      if ((force || document.visibilityState === 'hidden') && [VoiceState.VOICE_REQUESTING_PERMISSION, VoiceState.VOICE_LISTENING, VoiceState.VOICE_TRANSCRIBING].includes(stateRef.current)) {
        releaseCapture(true);
        move('INTERRUPT');
      }
    };
    const onVisibilityChange = () => suspend();
    const onPageHide = () => suspend(true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      releaseCapture(true);
    };
  }, [move, releaseCapture]);

  return { state, transcript, error, support, available, activate };
}