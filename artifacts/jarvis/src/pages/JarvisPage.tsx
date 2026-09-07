import { useCallback, useEffect, useRef, useState } from 'react';
import { HolographicPanel, TechLabel, StatusDot, JARVISCore } from '@/components/primitives';
import { AlertTriangle, BriefcaseBusiness, Globe2, Home, Landmark, LockKeyhole, RotateCcw, Search, UserRound, WifiOff } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useVoice } from '@/hooks/use-voice';
import { VoiceState } from '@/lib/voice';
import { waitForAudioPlaybackUnlock } from '@/lib/audio-playback';

type AIActivity = {
  stage: 'ROUTING' | 'ANALYZING' | 'SEARCHING' | 'CHALLENGING' | 'SYNTHESIZING' | 'FALLBACK';
  provider?: string;
  domain?: string;
  detail?: string;
};

type ChatMessage = { author: 'SHANE' | 'JARVIS'; text: string };

type RetryState = {
  content: string;
  kind: 'OFFLINE' | 'INTERRUPTED' | 'SESSION' | 'UNAVAILABLE';
};

class JarvisHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'JarvisHttpError';
    this.status = status;
  }
}

const hudModules = [
  { key: 'GLOBAL', icon: Globe2, detail: 'Markets · News · Travel' },
  { key: 'BUSINESS', icon: BriefcaseBusiness, detail: 'Strategy · Operations · Growth' },
  { key: 'PERSONAL', icon: UserRound, detail: 'Schedule · Goals · Ideas' },
  { key: 'HOME', icon: Home, detail: 'Devices · Climate · Automation' },
  { key: 'FINANCE', icon: Landmark, detail: 'Accounts · Spending · Planning' },
  { key: 'SECURITY', icon: LockKeyhole, detail: 'Privacy · Alerts · System health' },
  { key: 'RESEARCH', icon: Search, detail: 'Analyze · Summarize · Solve' },
] as const;

const DRAFT_KEY = 'jarvis-chat-draft-v1';
const INTERRUPTED_MARKER = '[Response interrupted — partial response preserved.]';

function isSessionFailure(error: unknown) {
  return error instanceof JarvisHttpError && (error.status === 401 || error.status === 403);
}

async function jsonOrThrow<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new JarvisHttpError(response.status, payload?.error ?? fallback);
  }
  return response.json() as Promise<T>;
}

export function JarvisPage() {
  const [message, setMessage] = useState(() => localStorage.getItem(DRAFT_KEY) ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activities, setActivities] = useState<AIActivity[]>([]);
  const [streamWarning, setStreamWarning] = useState<string | null>(null);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [isRestoringHistory, setIsRestoringHistory] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef(0);
  const handsFreeStartedRef = useRef(false);
  const handsFreeReadyRef = useRef(false);
  const voiceActivateRef = useRef<() => void>(() => {});
  const voiceSpeakRef = useRef<(text: string, detail: typeof voiceSettings.spokenDetail, rate: number) => Promise<void>>(async () => {});
  const { reducedMotion, voiceSettings } = useSettings();

  const restoreHistory = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (!navigator.onLine || isStreaming) return false;
    if (!quiet) setIsRestoringHistory(true);
    try {
      const conversationsResponse = await fetch('/api/conversations', {
        credentials: 'include',
        cache: 'no-store',
      });
      const conversations = await jsonOrThrow<Array<{ id: string }>>(
        conversationsResponse,
        'Conversation history is unavailable.',
      );
      const active = conversations[0];
      if (!active) {
        setConversationId(null);
        if (!messages.length) setMessages([]);
        setRetryState(null);
        if (!quiet) setStreamWarning(null);
        return true;
      }

      const historyResponse = await fetch(`/api/conversations/${active.id}/messages`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const history = await jsonOrThrow<Array<{ role: string; content: string }>>(
        historyResponse,
        'Conversation messages are unavailable.',
      );
      setConversationId(active.id);
      setMessages(history.map((item) => ({
        author: item.role === 'assistant' ? 'JARVIS' : 'SHANE',
        text: item.content,
      })));
      setRetryState(null);
      setStreamWarning(null);
      return true;
    } catch (error) {
      if (isSessionFailure(error)) {
        setRetryState((current) => current ?? { content: '', kind: 'SESSION' });
        setStreamWarning('Your secure session needs to be renewed. The conversation on screen is preserved.');
      } else {
        setStreamWarning('Conversation history could not be restored. The conversation already on screen is preserved.');
      }
      return false;
    } finally {
      if (!quiet) setIsRestoringHistory(false);
    }
  }, [isStreaming, messages.length]);

  useEffect(() => {
    void restoreHistory();
  }, []); // Restore only once on initial mount; reconnect recovery is handled separately below.

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, message);
  }, [message]);

  useEffect(() => {
    const markOnline = () => {
      setIsOnline(true);
      setStreamWarning('Connection restored. Verifying conversation history…');
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(() => {
        void restoreHistory({ quiet: true });
      }, 700);
    };
    const markOffline = () => {
      setIsOnline(false);
      setStreamWarning('JARVIS is offline. Your visible conversation and unsent draft are preserved.');
    };
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.clearTimeout(reconnectTimerRef.current);
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    };
  }, [restoreHistory]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [messages, isStreaming, reducedMotion]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (value = message, { retry = false }: { retry?: boolean } = {}) => {
    const content = value.trim();
    if (!content || isStreaming) return;
    if (!navigator.onLine) {
      setRetryState({ content, kind: 'OFFLINE' });
      setStreamWarning('JARVIS is offline. Your command is preserved and ready to retry when the connection returns.');
      return;
    }

    setMessage('');
    setRetryState(null);
    setStreamWarning(null);
    setMessages((current) => [
      ...current,
      { author: 'SHANE', text: retry ? `${content}\n\n[Retry after interruption]` : content },
      { author: 'JARVIS', text: '' },
    ]);
    setIsStreaming(true);
    setActivities([]);
    let fullResponse = '';
    try {
      let id = conversationId;
      if (!id) {
        const createdResponse = await fetch('/api/conversations', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: content.slice(0, 60), domain: 'GENERAL' }),
        });
        const created = await jsonOrThrow<{ id: string }>(createdResponse, 'Could not create conversation.');
        id = created.id;
        setConversationId(id);
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const response = await fetch(`/api/conversations/${id}/messages/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new JarvisHttpError(response.status, payload?.error ?? 'JARVIS is unavailable.');
      }
      if (!response.body) throw new Error('JARVIS stream is unavailable.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      const applyEvent = (event: string) => {
        const line = event.split('\n').find((part) => part.startsWith('data: '));
        if (!line) return;
        const data = JSON.parse(line.slice(6)) as { content?: string; error?: string; activity?: AIActivity };
        if (data.error) throw new Error(data.error);
        if (data.activity) setActivities((current) => [...current.slice(-4), data.activity!]);
        if (data.content) {
          fullResponse += data.content;
          setMessages((current) => current.map((item, index) =>
            index === current.length - 1 ? { ...item, text: item.text + data.content } : item,
          ));
        }
      };

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) {
          pending += decoder.decode();
          if (pending.trim()) applyEvent(pending);
          break;
        }
        pending += decoder.decode(chunk, { stream: true });
        const events = pending.split('\n\n');
        pending = events.pop() ?? '';
        for (const event of events) applyEvent(event);
      }

      if (voiceSettings.enabled && fullResponse.trim()) {
        await voice.speak(fullResponse, voiceSettings.spokenDetail, voiceSettings.speechRate);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const sessionFailed = isSessionFailure(error);
      setRetryState({ content, kind: sessionFailed ? 'SESSION' : fullResponse.trim() ? 'INTERRUPTED' : 'UNAVAILABLE' });
      setStreamWarning(sessionFailed
        ? 'Your secure session needs to be renewed. The partial response and command are preserved.'
        : fullResponse.trim()
          ? 'The response was interrupted. The partial answer is preserved and can be retried.'
          : 'JARVIS could not complete that request. Your command is preserved and can be retried.');
      setMessages((current) => current.map((item, index) => {
        if (index !== current.length - 1) return item;
        if (item.text.trim()) {
          return item.text.includes(INTERRUPTED_MARKER)
            ? item
            : { ...item, text: `${item.text.trimEnd()}\n\n${INTERRUPTED_MARKER}` };
        }
        return { ...item, text: sessionFailed
          ? 'Secure session renewal required. No response content was lost.'
          : 'Response unavailable. The command is preserved for retry.' };
      }));
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const retryLastCommand = () => {
    if (!retryState || isStreaming) return;
    if (retryState.kind === 'SESSION') {
      window.location.reload();
      return;
    }
    if (!isOnline) return;
    void send(retryState.content, { retry: true });
  };

  const cancelStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setStreamWarning('Generation stopped. Any partial response already received remains visible and is preserved by the recovery layer.');
  };

  const voice = useVoice({
    enabled: voiceSettings.enabled,
    isThinking: isStreaming,
    onTranscript: (value) => send(value),
    onCancelThinking: cancelStream,
  });

  voiceActivateRef.current = voice.activate;
  voiceSpeakRef.current = voice.speak;

  const displayedVoiceState = isStreaming && voice.state === VoiceState.VOICE_IDLE ? VoiceState.VOICE_THINKING : voice.state;
  const voiceStatus: Record<VoiceState, string> = {
    [VoiceState.VOICE_IDLE]: 'Standing by',
    [VoiceState.VOICE_REQUESTING_PERMISSION]: 'Opening audio channel',
    [VoiceState.VOICE_LISTENING]: 'Listening',
    [VoiceState.VOICE_TRANSCRIBING]: 'Understanding',
    [VoiceState.VOICE_THINKING]: 'Thinking',
    [VoiceState.VOICE_SPEAKING]: 'Speaking',
    [VoiceState.VOICE_INTERRUPTED]: 'Audio channel interrupted',
    [VoiceState.VOICE_ERROR]: 'Audio channel degraded',
    [VoiceState.VOICE_UNAVAILABLE]: 'Voice unavailable',
  };

  useEffect(() => {
    if (handsFreeStartedRef.current || !voiceSettings.enabled || !voice.available || !isOnline) return;
    handsFreeStartedRef.current = true;
    let cancelled = false;
    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    const begin = async () => {
      await waitForAudioPlaybackUnlock();
      if (cancelled) return;
      try {
        await voiceSpeakRef.current(`${salutation}, Shane. JARVIS online. How can I help?`, voiceSettings.spokenDetail, voiceSettings.speechRate);
      } catch {
        // Playback owns fallback/error state and settles only after completion or definitive failure.
      }
      if (cancelled) return;
      handsFreeReadyRef.current = true;
      window.setTimeout(() => voiceActivateRef.current(), 120);
    };

    void begin();
    return () => { cancelled = true; };
  }, [isOnline, isStreaming, voice.available, voiceSettings.enabled, voiceSettings.speechRate, voiceSettings.spokenDetail]);

  useEffect(() => {
    if (!handsFreeReadyRef.current || !voiceSettings.enabled || !voice.available || !isOnline || isStreaming) return;
    if (voice.state !== VoiceState.VOICE_IDLE && voice.state !== VoiceState.VOICE_INTERRUPTED) return;
    const timer = window.setTimeout(() => voiceActivateRef.current(), 300);
    return () => window.clearTimeout(timer);
  }, [isOnline, isStreaming, voice.available, voice.state, voiceSettings.enabled]);

  const activeDomain = activities.at(-1)?.domain?.toUpperCase() ?? '';
  const stateClass = displayedVoiceState === VoiceState.VOICE_LISTENING
    ? 'jarvis-is-listening'
    : displayedVoiceState === VoiceState.VOICE_SPEAKING
      ? 'jarvis-is-speaking'
      : displayedVoiceState === VoiceState.VOICE_THINKING || isStreaming
        ? 'jarvis-is-thinking'
        : 'jarvis-is-idle';

  return (
    <div className={`page-enter jarvis-workspace jarvis-handsfree ${stateClass}`} data-testid="jarvis-workspace">
      <section className="jarvis-conversation" aria-label="JARVIS interface">
        <div className="jarvis-conversation-header">
          <div>
            <TechLabel>JARVIS // Cognitive Interface</TechLabel>
            <h1 className="jarvis-chat-title font-display mt-1 font-light">{isOnline ? 'ONLINE' : 'OFFLINE'}</h1>
          </div>
          <StatusDot status={!isOnline ? 'red' : isStreaming ? 'amber' : 'online'} pulse={isStreaming} />
        </div>

        <div className="jarvis-core-stage">
          <div className="jarvis-hud jarvis-hud-left" aria-hidden="true">
            {hudModules.slice(0, 4).map(({ key, icon: Icon, detail }) => (
              <div className={`jarvis-hud-module ${activeDomain === key ? 'active' : ''}`} key={key}>
                <Icon size={15} /><div><strong>{key}</strong><span>{detail}</span></div>
              </div>
            ))}
          </div>

          <div className="jarvis-core-primary">
            <JARVISCore
              isThinking={displayedVoiceState === VoiceState.VOICE_THINKING || displayedVoiceState === VoiceState.VOICE_LISTENING || displayedVoiceState === VoiceState.VOICE_REQUESTING_PERMISSION}
              processText={displayedVoiceState === VoiceState.VOICE_THINKING && isStreaming ? activities.at(-1)?.stage ?? 'EVALUATING...' : voiceStatus[displayedVoiceState]}
            />
          </div>

          <div className="jarvis-hud jarvis-hud-right" aria-hidden="true">
            {hudModules.slice(4).map(({ key, icon: Icon, detail }) => (
              <div className={`jarvis-hud-module ${activeDomain === key ? 'active' : ''}`} key={key}>
                <Icon size={15} /><div><strong>{key}</strong><span>{detail}</span></div>
              </div>
            ))}
            <div className="jarvis-hud-module systems"><span className="jarvis-mini-orbit"/><div><strong>SYSTEMS</strong><span>Voice · Memory · Providers</span></div></div>
          </div>

          <div className="jarvis-core-status" aria-live="polite">
            <div className="jarvis-voice-wave" aria-hidden="true">{Array.from({ length: 19 }, (_, index) => <i key={index} />)}</div>
            <div>{voiceStatus[displayedVoiceState]}</div>
            {voice.transcript ? <div className="mt-2 text-white/65 normal-case tracking-normal">“{voice.transcript}”</div> : null}
            {voice.error ? <div className="voice-error-compact"><AlertTriangle size={11} className="inline mr-1" />{voice.error}</div> : null}
          </div>
        </div>

        <HolographicPanel className="jarvis-chat-panel flex flex-col min-h-0" glow={isStreaming}>
          <div className="jarvis-message-history space-y-3 scrollbar-hide" data-testid="jarvis-message-history">
            {messages.length === 0 ? <div className="chat-bubble jarvis"><div className="author">JARVIS</div>Voice channel ready.</div> : null}
            {messages.map((item, index) => (
              <div className={`chat-bubble ${item.author === 'SHANE' ? 'user' : 'jarvis'}`} key={`${item.author}-${index}`} data-testid={`message-${index}`}>
                <div className="author">{item.author}</div>
                {item.text || (isStreaming && index === messages.length - 1 ? <span className="animate-pulse">Thinking…</span> : '…')}
              </div>
            ))}
            <div ref={endOfMessagesRef} />
          </div>
          <div className="jarvis-composer border-t border-primary/20 bg-black/40" data-testid="jarvis-composer">
            {streamWarning ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[11px] text-amber-100/85" role="status">
                {!isOnline ? <WifiOff size={12} /> : <AlertTriangle size={12} />}
                <span className="min-w-0 flex-1">{streamWarning}</span>
                {retryState ? (
                  <button
                    type="button"
                    onClick={retryLastCommand}
                    disabled={isStreaming || (retryState.kind !== 'SESSION' && !isOnline)}
                    className="font-mono text-[10px] tracking-wider text-amber-200 disabled:opacity-40"
                    data-testid="button-retry-message"
                  >
                    <RotateCcw size={10} className="mr-1 inline" />
                    {retryState.kind === 'SESSION' ? 'RECONNECT SESSION' : 'RETRY'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void restoreHistory()}
                  disabled={isRestoringHistory || isStreaming || !isOnline}
                  className="font-mono text-[10px] tracking-wider text-primary/80 disabled:opacity-40"
                  data-testid="button-restore-history"
                >
                  {isRestoringHistory ? 'RESTORING…' : 'RESTORE HISTORY'}
                </button>
              </div>
            ) : null}
            <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <input
                className="tech-input w-full"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={isOnline ? 'TYPE ONLY IF NEEDED…' : 'OFFLINE — DRAFT IS SAVED'}
                aria-label="Message JARVIS"
                data-testid="input-jarvis-message"
                disabled={isStreaming}
              />
              <button type="submit" className="sr-only" data-testid="button-send-message" aria-label="Send typed message">Send</button>
            </form>
          </div>
        </HolographicPanel>
      </section>
    </div>
  );
}
