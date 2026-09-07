import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSpokenSummary,
  decideVoiceActivation,
  transitionVoiceState,
  type SpokenDetail,
  type VoiceEvent,
  VoiceState,
} from '@/lib/voice';
import { getSharedAudioElement, waitForAudioPlaybackUnlock } from '@/lib/audio-playback';

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

const SILENCE_TO_SUBMIT_MS = 1_100;
const MAX_LISTENING_MS = 20_000;

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
  const playbackCancelRef = useRef<(() => void) | null>(null);
  const silenceTimerRef = useRef(0);
  const maxListeningTimerRef = useRef(0);
  const finalTranscriptRef = useRef('');
  const liveTranscriptRef = useRef('');
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
    const cancelPendingPlayback = playbackCancelRef.current;
    playbackCancelRef.current = null;
    cancelPendingPlayback?.();
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

  const clearCaptureTimers = useCallback(() => {
    window.clearTimeout(silenceTimerRef.current);
    window.clearTimeout(maxListeningTimerRef.current);
    silenceTimerRef.current = 0;
    maxListeningTimerRef.current = 0;
  }, []);

  const releaseCapture = useCallback((abortRecognition = false) => {
    clearCaptureTimers();
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
  }, [clearCaptureTimers]);

  const fail = useCallback((message: string) => {
    releaseCapture(true);
    releasePlayback();
    setError(message);
    move('FAIL');
  }, [move, releaseCapture, releasePlayback]);

  const submitTranscript = useCallback(() => {
    const final = (finalTranscriptRef.current.trim() || liveTranscriptRef.current.trim());
    releaseCapture();
    if (!final) {
      fail('No speech was recognized. Check microphone access and try again.');
      return;
    }
    finalTranscriptRef.current = final;
    liveTranscriptRef.current = final;
    setTranscript(final);
    move('TRANSCRIPT_READY');
    void submitRef.current(final);
  }, [fail, move, releaseCapture]);

  const stopRecognitionForSubmission = useCallback(() => {
    if (stateRef.current !== VoiceState.VOICE_LISTENING) return;
    move('STOP_LISTENING');
    try {
      recognitionRef.current?.stop();
    } catch {
      submitTranscript();
    }
  }, [move, submitTranscript]);

  const scheduleSpeechEndpoint = useCallback(() => {
    window.clearTimeout(silenceTimerRef.current);
    if (!liveTranscriptRef.current.trim()) return;
    silenceTimerRef.current = window.setTimeout(() => {
      stopRecognitionForSubmission();
    }, SILENCE_TO_SUBMIT_MS);
  }, [stopRecognitionForSubmission]);

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
    liveTranscriptRef.current = '';
    clearCaptureTimers();
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
        const live = `${finalTranscriptRef.current}${interim}`.trim();
        liveTranscriptRef.current = live;
        setTranscript(live);
        scheduleSpeechEndpoint();
      };
      recognition.onerror = (event) => {
        if (event.error === 'aborted') return;
        const permission = event.error === 'not-allowed' || event.error === 'service-not-allowed';
        fail(permission ? 'Microphone or speech recognition permission was denied.' : `Speech recognition failed: ${event.message || event.error}.`);
      };
      recognition.onend = () => {
        clearCaptureTimers();
        if (stateRef.current === VoiceState.VOICE_LISTENING || stateRef.current === VoiceState.VOICE_TRANSCRIBING) {
          stateRef.current = VoiceState.VOICE_TRANSCRIBING;
          setState(VoiceState.VOICE_TRANSCRIBING);
          submitTranscript();
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      move('PERMISSION_GRANTED');
      maxListeningTimerRef.current = window.setTimeout(() => {
        if (liveTranscriptRef.current.trim()) {
          stopRecognitionForSubmission();
          return;
        }
        fail('No speech was recognized. JARVIS stopped listening so the microphone cannot remain open indefinitely.');
      }, MAX_LISTENING_MS);
    } catch (caught) {
      const denied = caught instanceof DOMException && (caught.name === 'NotAllowedError' || caught.name === 'SecurityError');
      fail(denied ? 'Microphone permission was denied. Allow access, then retry.' : 'The microphone could not be started.');
    }
  }, [available, clearCaptureTimers, enabled, fail, move, releasePlayback, scheduleSpeechEndpoint, stopRecognitionForSubmission, submitTranscript]);

  const stop = useCallback(() => {
    if (stateRef.current !== VoiceState.VOICE_LISTENING) return;
    stopRecognitionForSubmission();
  }, [stopRecognitionForSubmission]);

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
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(spoken);
    fallbackUtteranceRef.current = utterance;
    utterance.lang = navigator.language || 'en-US';
    utterance.rate = Math.min(1.3, Math.max(0.7, speechRate));
    let settled = false;
    let keepAlive = 0;
    let timeout = 0;
    const maximumDuration = Math.max(20_000, Math.min(120_000, spoken.length * 120));
    const finish = (failure?: Error) => {
      if (settled) return;
      settled = true;
      window.clearInterval(keepAlive);
      window.clearTimeout(timeout);
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
      fallbackUtteranceRef.current = null;
      playbackCancelRef.current = null;
      if (failure) reject(failure);
      else {
        move('RESPONSE_FINISHED');
        resolve();
      }
    };
    playbackCancelRef.current = () => finish(new DOMException('Voice playback interrupted.', 'AbortError'));
    keepAlive = window.setInterval(() => window.speechSynthesis.resume(), 4_000);
    timeout = window.setTimeout(() => finish(new Error('Device voice playback timed out.')), maximumDuration);
    utterance.onstart = () => move('PLAYBACK_STARTED');
    utterance.onend = () => {
      finish();
    };
    utterance.onerror = () => {
      finish(new Error('Device voice playback failed.'));
    };
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      finish(new Error('Device voice playback failed.'));
    }
  }), [move]);

  const speak = useCallback(async (text: string, detail: SpokenDetail, speechRate: number) => {
    const spoken = createSpokenSummary(text, detail);
    if (!enabled || !spoken) return;
    releaseCapture(true);
    releasePlayback();
    setError(null);
    stateRef.current = VoiceState.VOICE_THINKING;
    setState(VoiceState.VOICE_THINKING);
    await waitForAudioPlaybackUnlock();
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
      const audio = getSharedAudioElement();
      audioRef.current = audio;
      audio.src = url;
      audio.playbackRate = Math.min(1.3, Math.max(0.7, speechRate));
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let timeout = 0;
        const maximumDuration = Math.max(20_000, Math.min(120_000, spoken.length * 120));
        const finish = (failure?: Error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          audio.onplay = null;
          audio.onended = null;
          audio.onerror = null;
          playbackCancelRef.current = null;
          if (failure) reject(failure);
          else resolve();
        };
        timeout = window.setTimeout(
          () => finish(new Error('Cloud voice playback timed out.')),
          maximumDuration,
        );
        playbackCancelRef.current = () => finish(new DOMException('Voice playback interrupted.', 'AbortError'));
        audio.onplay = () => move('PLAYBACK_STARTED');
        audio.onended = () => finish();
        audio.onerror = () => finish(new Error('Cloud voice playback failed.'));
        audio.load();
        void audio.play().catch(() => finish(new Error('Cloud voice playback was blocked.')));
      });
      releasePlayback();
      move('RESPONSE_FINISHED');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      const cloudError = caught instanceof Error ? caught.message : 'Cloud voice synthesis is unavailable.';
      speechAbortRef.current = null;
      releasePlayback();
      try {
        setError('Cloud voice is temporarily unavailable. Using the iPad/device voice instead.');
        await speakWithDevice(spoken, speechRate);
      } catch (deviceError) {
        if (deviceError instanceof DOMException && deviceError.name === 'AbortError') return;
        releasePlayback();
        setError(`${cloudError} Device voice is also unavailable. The full text response remains available.`);
        move('RESPONSE_FINISHED');
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
