import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSpokenSummary,
  decideVoiceActivation,
  transitionVoiceState,
  type SpokenDetail,
  type VoiceEvent,
  VoiceState,
} from '@/lib/voice';

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
  const browserTts = typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof SpeechSynthesisUtterance !== 'undefined';

  return {
    stt: typeof window !== 'undefined' && Boolean(recognitionConstructor()),
    microphone: typeof navigator !== 'undefined'
      && Boolean(navigator.mediaDevices?.getUserMedia)
      && typeof MediaRecorder !== 'undefined',
    tts: typeof Audio !== 'undefined' || browserTts,
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const fallbackUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechAbortRef = useRef<AbortController | null>(null);
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

  const releasePlayback = useCallback(() => {
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    fallbackUtteranceRef.current = null;
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
    releasePlayback();
    setError(message);
    move('FAIL');
  }, [move, releaseCapture, releasePlayback]);

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
    releasePlayback();
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
  }, [available, enabled, fail, move, releasePlayback, submitTranscript]);

  const stop = useCallback(() => {
    if (stateRef.current !== VoiceState.VOICE_LISTENING) return;
    move('STOP_LISTENING');
    try { recognitionRef.current?.stop(); } catch { submitTranscript(); }
  }, [move, submitTranscript]);

  const interrupt = useCallback(() => {
    releaseCapture(true);
    releasePlayback();
    onCancelThinking();
    move('INTERRUPT');
  }, [move, onCancelThinking, releaseCapture, releasePlayback]);

  const activate = useCallback(() => {
    const action = decideVoiceActivation(state, isThinking);
    if (action === 'STOP_CAPTURE') stop();
    else if (action === 'INTERRUPT') interrupt();
    else if (action === 'START_CAPTURE') void start();
  }, [interrupt, isThinking, start, state, stop]);

  const speakWithDevice = useCallback((spoken: string, speechRate: number) => new Promise<void>((resolve, reject) => {
    if (
      typeof window === 'undefined'
      || !('speechSynthesis' in window)
      || typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      reject(new Error('Device voice synthesis is unavailable.'));
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    fallbackUtteranceRef.current = utterance;
    utterance.lang = navigator.language || 'en-US';
    utterance.rate = Math.min(1.3, Math.max(0.7, speechRate));
    utterance.onstart = () => move('PLAYBACK_STARTED');
    utterance.onend = () => {
      fallbackUtteranceRef.current = null;
      move('RESPONSE_FINISHED');
      resolve();
    };
    utterance.onerror = () => {
      fallbackUtteranceRef.current = null;
      reject(new Error('Device voice playback failed.'));
    };
    window.speechSynthesis.speak(utterance);
  }), [move]);

  const speak = useCallback(async (text: string, detail: SpokenDetail, speechRate: number) => {
    const spoken = createSpokenSummary(text, detail);
    if (!enabled || !spoken) return;
    releaseCapture(true);
    releasePlayback();
    setError(null);
    stateRef.current = VoiceState.VOICE_THINKING;
    setState(VoiceState.VOICE_THINKING);
    const controller = new AbortController();
    speechAbortRef.current = controller;
    try {
      const response = await fetch('/api/voice/speech', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spoken }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Voice synthesis is unavailable.');
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('Voice synthesis returned no audio.');
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.playbackRate = Math.min(1.3, Math.max(0.7, speechRate));
      audio.onplay = () => move('PLAYBACK_STARTED');
      audio.onended = () => {
        releasePlayback();
        move('RESPONSE_FINISHED');
      };
      audio.onerror = () => fail('Cloud voice playback failed. The full text response remains available.');
      await audio.play();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      const cloudError = caught instanceof Error ? caught.message : 'Cloud voice synthesis is unavailable.';
      speechAbortRef.current = null;
      try {
        setError('Cloud voice is temporarily unavailable. Using the iPad/device voice instead.');
        await speakWithDevice(spoken, speechRate);
      } catch {
        fail(`${cloudError} Device voice is also unavailable. The full text response remains available.`);
      }
    }
  }, [enabled, fail, move, releaseCapture, releasePlayback, speakWithDevice]);

  useEffect(() => {
    if (isThinking && stateRef.current === VoiceState.VOICE_IDLE) move('RESPONSE_STARTED');
    if (isThinking && stateRef.current === VoiceState.VOICE_THINKING) move('RESPONSE_STARTED');
    if (!isThinking && stateRef.current === VoiceState.VOICE_THINKING) move('RESPONSE_FINISHED');
  }, [isThinking, move]);

  useEffect(() => {
    const suspend = (force = false) => {
      if ((force || document.visibilityState === 'hidden') && [
        VoiceState.VOICE_REQUESTING_PERMISSION,
        VoiceState.VOICE_LISTENING,
        VoiceState.VOICE_TRANSCRIBING,
        VoiceState.VOICE_SPEAKING,
      ].includes(stateRef.current)) {
        releaseCapture(true);
        releasePlayback();
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
      releasePlayback();
    };
  }, [move, releaseCapture, releasePlayback]);

  return { state, transcript, error, support, available, activate, speak };
}