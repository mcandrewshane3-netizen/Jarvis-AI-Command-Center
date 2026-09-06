import { useState, useEffect } from 'react';
import type { SpokenDetail } from '@/lib/voice';

export interface VoiceSettings {
  enabled: boolean;
  preset: 'JARVIS ORIGINAL';
  speechRate: number;
  spokenDetail: SpokenDetail;
  conversationMode: false;
  autoSpeak: false;
  saveVoiceHistory: false;
  greeting: boolean;
}

const defaultVoiceSettings: VoiceSettings = {
  enabled: true,
  preset: 'JARVIS ORIGINAL',
  speechRate: 1,
  spokenDetail: 'STANDARD',
  conversationMode: false,
  autoSpeak: false,
  saveVoiceHistory: false,
  greeting: false,
};

const VOICE_SETTINGS_KEY = 'jarvis-voice-settings-v1';

export function loadVoiceSettings(storage: Pick<Storage, 'getItem'> = localStorage): VoiceSettings {
  try {
    const value = storage.getItem(VOICE_SETTINGS_KEY);
    if (!value) return defaultVoiceSettings;
    const parsed = JSON.parse(value) as Partial<VoiceSettings>;
    return {
      ...defaultVoiceSettings,
      ...parsed,
      preset: 'JARVIS ORIGINAL',
      conversationMode: false,
      autoSpeak: false,
      saveVoiceHistory: false,
    };
  } catch {
    return defaultVoiceSettings;
  }
}

export function useSettings() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [voiceSettings, setVoiceSettingsState] = useState<VoiceSettings>(defaultVoiceSettings);

  useEffect(() => {
    const saved = localStorage.getItem('jarvis-reduced-motion');
    if (saved) {
      setReducedMotion(saved === 'true');
    } else {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setReducedMotion(prefersReduced);
    }
    setVoiceSettingsState(loadVoiceSettings());
  }, []);

  useEffect(() => {
    localStorage.setItem('jarvis-reduced-motion', String(reducedMotion));
    if (reducedMotion) {
      document.documentElement.classList.add('reduced-motion');
    } else {
      document.documentElement.classList.remove('reduced-motion');
    }
  }, [reducedMotion]);

  const setVoiceSettings = (update: Partial<VoiceSettings>) => {
    setVoiceSettingsState((current) => {
      const next = { ...current, ...update };
      localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('jarvis-voice-settings', { detail: next }));
      return next;
    });
  };

  useEffect(() => {
    const sync = (event: Event) => setVoiceSettingsState((event as CustomEvent<VoiceSettings>).detail);
    window.addEventListener('jarvis-voice-settings', sync);
    return () => window.removeEventListener('jarvis-voice-settings', sync);
  }, []);

  return { reducedMotion, setReducedMotion, voiceSettings, setVoiceSettings };
}
