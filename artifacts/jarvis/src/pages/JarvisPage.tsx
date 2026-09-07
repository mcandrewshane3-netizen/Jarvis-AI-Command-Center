import { useEffect, useRef, useState } from 'react';
import { HolographicPanel, TechLabel, StatusDot, JARVISCore } from '@/components/primitives';
import { AlertTriangle } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useVoice } from '@/hooks/use-voice';
import { VoiceState } from '@/lib/voice';

type AIActivity = {
  stage: 'ROUTING' | 'ANALYZING' | 'SEARCHING' | 'CHALLENGING' | 'SYNTHESIZING' | 'FALLBACK';
  provider?: string;
  domain?: string;
  detail?: string;
};

export function JarvisPage() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ author: string; text: string }>>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activities, setActivities] = useState<AIActivity[]>([]);
  const [streamWarning, setStreamWarning] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handsFreeStartedRef = useRef(false);
  const handsFreeReadyRef = useRef(false);
  const voiceActivateRef = useRef<() => void>(() => {});
  const voiceSpeakRef = useRef<(text: string, detail: typeof voiceSettings.spokenDetail, rate: number) => Promise<void>>(async () => {});
  const voiceStateRef = useRef<VoiceState>(VoiceState.VOICE_IDLE);
  const { reducedMotion, voiceSettings } = useSettings();

  useEffect(() => {
    void (async () => {
      try {
        const conversations = await fetch('/api/conversations').then((response) => response.ok ? response.json() : []);
        const active = conversations[0];
        if (!active) return;
        setConversationId(active.id);
        const history = await fetch(`/api/conversations/${active.id}/messages`).then((response) => response.ok ? response.json() : []);
        setMessages(history.map((item: { role: string; content: string }) => ({
          author: item.role === 'assistant' ? 'JARVIS' : 'SHANE',
          text: item.content,
        })));
      } catch {
        setStreamWarning('Conversation history is temporarily unavailable.');
      }
    })();
  }, []);

  useEffect(() => {
    const markOnline = () => { setIsOnline(true); setStreamWarning(null); };
    const markOffline = () => { setIsOnline(false); setStreamWarning('JARVIS is offline.'); };
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    };
  }, []);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [messages, isStreaming, reducedMotion]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (value = message) => {
    const content = value.trim();
    if (!content || isStreaming || !navigator.onLine) return;
    setMessage('');
    setStreamWarning(null);
    setMessages((current) => [...current, { author: 'SHANE', text: content }, { author: 'JARVIS', text: '' }]);
    setIsStreaming(true);
    setActivities([]);
    let fullResponse = '';
    try {
      let id = conversationId;
      if (!id) {
        const created = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: content.slice(0, 60), domain: 'GENERAL' }),
        }).then((response) => {
          if (!response.ok) throw new Error('Could not create conversation');
          return response.json();
        });
        id = created.id;
        setConversationId(id);
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const response = await fetch(`/api/conversations/${id}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error('JARVIS is unavailable');

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
      setStreamWarning(fullResponse.trim() ? 'Response interrupted. Partial answer preserved.' : 'JARVIS could not complete that request.');
      setMessages((current) => current.map((item, index) => {
        if (index !== current.length - 1) return item;
        return item.text.trim() ? item : { ...item, text: 'I could not complete that response.' };
      }));
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const cancelStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  const voice = useVoice({
    enabled: voiceSettings.enabled,
    isThinking: isStreaming,
    onTranscript: (value) => send(value),
    onCancelThinking: cancelStream,
  });

  voiceActivateRef.current = voice.activate;
  voiceSpeakRef.current = voice.speak;
  voiceStateRef.current = voice.state;

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
      try {
        await voiceSpeakRef.current(`${salutation}, Shane. JARVIS online. I'm listening.`, voiceSettings.spokenDetail, voiceSettings.speechRate);
      } catch {
        // Browser autoplay restrictions can block the spoken greeting. Continue to microphone startup.
      }
      if (cancelled) return;
      handsFreeReadyRef.current = true;
      window.setTimeout(() => voiceActivateRef.current(), 180);
    };

    void begin();

    const unlockOnFirstGesture = () => {
      if (cancelled || voiceStateRef.current === VoiceState.VOICE_LISTENING || isStreaming) return;
      handsFreeReadyRef.current = true;
      voiceActivateRef.current();
    };
    document.addEventListener('pointerdown', unlockOnFirstGesture, { once: true, capture: true });
    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', unlockOnFirstGesture, true);
    };
  }, [isOnline, isStreaming, voice.available, voiceSettings.enabled, voiceSettings.speechRate, voiceSettings.spokenDetail]);

  useEffect(() => {
    if (!handsFreeReadyRef.current || !voiceSettings.enabled || !voice.available || !isOnline || isStreaming) return;
    if (voice.state !== VoiceState.VOICE_IDLE && voice.state !== VoiceState.VOICE_INTERRUPTED) return;
    const timer = window.setTimeout(() => voiceActivateRef.current(), 450);
    return () => window.clearTimeout(timer);
  }, [isOnline, isStreaming, voice.available, voice.state, voiceSettings.enabled]);

  return (
    <div className="page-enter jarvis-workspace jarvis-handsfree" data-testid="jarvis-workspace">
      <section className="jarvis-conversation" aria-label="JARVIS interface">
        <div className="jarvis-conversation-header">
          <div>
            <TechLabel>JARVIS // Cognitive Interface</TechLabel>
            <h1 className="jarvis-chat-title font-display mt-1 font-light">{isOnline ? 'ONLINE' : 'OFFLINE'}</h1>
          </div>
          <StatusDot status={!isOnline ? 'red' : isStreaming ? 'amber' : 'online'} pulse={isStreaming} />
        </div>

        <div className="jarvis-core-stage">
          <div className="jarvis-core-primary">
            <JARVISCore
              isThinking={displayedVoiceState === VoiceState.VOICE_THINKING || displayedVoiceState === VoiceState.VOICE_LISTENING || displayedVoiceState === VoiceState.VOICE_REQUESTING_PERMISSION}
              processText={displayedVoiceState === VoiceState.VOICE_THINKING && isStreaming ? activities.at(-1)?.stage ?? 'EVALUATING...' : voiceStatus[displayedVoiceState]}
            />
          </div>
          <div className="jarvis-core-status" aria-live="polite">
            {voiceStatus[displayedVoiceState]}
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
            {streamWarning ? <div className="mb-2 text-[11px] text-amber-200/80">{streamWarning}</div> : null}
            <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <input
                className="tech-input w-full"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={isOnline ? 'TYPE ONLY IF NEEDED…' : 'OFFLINE'}
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
