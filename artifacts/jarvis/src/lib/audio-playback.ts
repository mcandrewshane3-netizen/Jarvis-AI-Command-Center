let sharedAudio: HTMLAudioElement | null = null;
let unlocked = false;
let unlockInFlight = false;
let resolveUnlock: (() => void) | null = null;

const unlockPromise = new Promise<void>((resolve) => {
  resolveUnlock = resolve;
});

function createSilentWavUrl() {
  const sampleRate = 8_000;
  const sampleCount = 640;
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  write(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export function getSharedAudioElement() {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
    sharedAudio.setAttribute('playsinline', '');
  }
  return sharedAudio;
}

function unlockDeviceSpeech() {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  const utterance = new SpeechSynthesisUtterance('\u00a0');
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
}

async function unlockAudioPlayback() {
  if (unlocked || unlockInFlight) return;
  unlockInFlight = true;
  const audio = getSharedAudioElement();
  const silentUrl = createSilentWavUrl();

  try {
    unlockDeviceSpeech();
    audio.src = silentUrl;
    audio.playbackRate = 1;
    audio.load();
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute('src');
    audio.load();
    unlocked = true;
    resolveUnlock?.();
    resolveUnlock = null;
  } catch {
    unlockInFlight = false;
  } finally {
    URL.revokeObjectURL(silentUrl);
  }
}

export function installAudioPlaybackUnlock() {
  if (typeof document === 'undefined') return;

  const unlock = () => {
    void unlockAudioPlayback().then(() => {
      if (!unlocked) return;
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('touchend', unlock, true);
    });
  };

  document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  document.addEventListener('touchend', unlock, { capture: true, passive: true });
}

export function waitForAudioPlaybackUnlock() {
  return unlocked ? Promise.resolve() : unlockPromise;
}