import { useEffect, useState, useRef } from 'react';
import { HolographicPanel, TechLabel, TechValue, Button, StatusDot, JARVISCore } from '@/components/primitives';
import { Database, CreditCard, Globe2, Sparkles, Send, BrainCircuit } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';

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
  const [lastRun, setLastRun] = useState<{ domain: string; specialists?: string[]; providers: string[]; fallbackUsed: boolean } | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { reducedMotion } = useSettings();

  useEffect(() => {
    void (async () => {
      const conversations = await fetch('/api/conversations').then((response) => response.ok ? response.json() : []);
      const active = conversations[0];
      if (!active) return;
      setConversationId(active.id);
      const history = await fetch(`/api/conversations/${active.id}/messages`).then((response) => response.ok ? response.json() : []);
      setMessages(history.map((item: { role: string; content: string }) => ({
        author: item.role === 'assistant' ? 'JARVIS' : 'SHANE',
        text: item.content,
      })));
    })();
  }, []);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [messages, isStreaming, reducedMotion]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (value = message) => {
    const content = value.trim();
    if (!content || isStreaming) return;
    setMessage('');
    setMessages((current) => [...current, { author: 'SHANE', text: content }, { author: 'JARVIS', text: '' }]);
    setIsStreaming(true);
    setActivities([]);
    setLastRun(null);
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
      const abortController = new AbortController();
      abortRef.current = abortController;
      const response = await fetch(`/api/conversations/${id}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) throw new Error('JARVIS is unavailable');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      const applyEvent = (event: string) => {
        const line = event.split('\n').find((part) => part.startsWith('data: '));
        if (!line) return;
        const data = JSON.parse(line.slice(6)) as {
          content?: string;
          error?: string;
          activity?: AIActivity;
          done?: boolean;
          run?: { domain: string; specialists?: string[]; providers: string[]; fallbackUsed: boolean };
        };
        if (data.error) throw new Error(data.error);
        if (data.activity) {
          setActivities((current) => [...current.slice(-4), data.activity!]);
        }
        if (data.run) setLastRun(data.run);
        if (data.content) {
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
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessages((current) => current.map((item, index) =>
        index === current.length - 1 ? { ...item, text: 'I could not complete that response. System degraded. Please try again.' } : item,
      ));
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  return (
    <div className="page-enter stagger-1 h-full flex flex-col md:flex-row gap-6">
      <div className="flex-1 flex flex-col h-[calc(100vh-160px)]">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <TechLabel>Primary Comm Link // Encrypted</TechLabel>
            <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Talk it through.</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline font-mono text-[10px] text-primary uppercase tracking-widest">
              {isStreaming ? `${activities.at(-1)?.stage ?? 'PROCESSING'} QUERY...` : 'SYSTEM IDLE'}
            </span>
            <StatusDot status={isStreaming ? 'amber' : 'online'} pulse={isStreaming} />
          </div>
        </div>
        
        <HolographicPanel className="flex-1 flex flex-col min-h-0 relative" glow={isStreaming} scanline={isStreaming}>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 && (
              <div className="chat-bubble jarvis opacity-80">
                <div className="author">JARVIS</div>
                Secure environment initialized. Awaiting instructions.
              </div>
            )}
            {messages.map((item, index) => (
              <div className={`chat-bubble ${item.author === 'SHANE' ? 'user' : 'jarvis'}`} key={`${item.author}-${index}`} data-testid={`message-${index}`}>
                <div className="author">{item.author}</div>
                {item.text || (isStreaming && index === messages.length - 1 ? <span className="animate-pulse">PROCESSING...</span> : '...')}
              </div>
            ))}
            <div ref={endOfMessagesRef} />
          </div>
          
          <div className="p-4 border-t border-primary/20 bg-black/40">
            <div className="flex flex-wrap gap-2 mb-4">
              {['Summarize my day', 'Find my next focus block', 'Review spending'].map((chip) => (
                <button 
                  key={chip} 
                  onClick={() => send(chip)}
                  disabled={isStreaming}
                  className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider border border-primary/30 text-primary/80 hover:bg-primary/10 hover:text-primary hover:border-primary transition-colors disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
            
            <form className="flex gap-3" onSubmit={(event) => { event.preventDefault(); send(); }}>
              <input 
                className="tech-input flex-1" 
                value={message} 
                onChange={(event) => setMessage(event.target.value)} 
                placeholder="INPUT COMMAND QUERY..." 
                aria-label="Message JARVIS" 
                data-testid="input-jarvis-message" 
                disabled={isStreaming}
                autoFocus
              />
              <Button type="submit" testId="button-send-message" disabled={isStreaming || !message.trim()} variant="solid" className="w-14 px-0 flex justify-center">
                <Send size={16} />
              </Button>
            </form>
          </div>
        </HolographicPanel>
      </div>
      
      <div className="w-full md:w-80 flex flex-col gap-6">
        <HolographicPanel title="JARVIS KERNEL" className="flex items-center justify-center py-6">
          <JARVISCore isThinking={isStreaming} processText={isStreaming ? activities.at(-1)?.stage ?? 'EVALUATING...' : 'READY'} />
        </HolographicPanel>

        <HolographicPanel title="AI ACTIVITY">
          <div className="space-y-3">
            {activities.length === 0 ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <BrainCircuit size={15} className="text-primary/60" />
                {lastRun
                  ? `${lastRun.specialists?.join(' + ') || lastRun.domain} // ${lastRun.providers.map((provider) => provider.toUpperCase()).join(' + ')}`
                  : 'Awaiting orchestration activity'}
              </div>
            ) : activities.map((activity, index) => (
              <div className="flex items-start gap-3 border-l border-primary/20 pl-3" key={`${activity.stage}-${activity.provider ?? 'system'}-${index}`}>
                <StatusDot status={activity.stage === 'FALLBACK' ? 'amber' : 'online'} pulse={index === activities.length - 1 && isStreaming} />
                <div>
                  <div className="font-mono text-[10px] tracking-widest text-primary">{activity.stage}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {[activity.domain, activity.provider?.toUpperCase(), activity.detail?.replaceAll('_', ' ')].filter(Boolean).join(' // ')}
                  </div>
                </div>
              </div>
            ))}
            {lastRun?.fallbackUsed ? <div className="font-mono text-[9px] text-amber-500 tracking-widest">FALLBACK PATH USED</div> : null}
          </div>
        </HolographicPanel>

        <HolographicPanel title="CONTEXT MATRIX">
          <div className="space-y-4">
            <div className="flex gap-4 p-3 border border-primary/10 bg-black/20">
              <Database className="text-primary mt-1" size={16} />
              <div className="flex-1">
                <TechLabel>Memory Core</TechLabel>
                <div className="text-sm mt-1">Domain-scoped private context</div>
                <StatusDot status="online" />
              </div>
            </div>
            <div className="flex gap-4 p-3 border border-amber-500/20 bg-amber-500/5">
              <CreditCard className="text-amber-500 mt-1" size={16} />
              <div className="flex-1">
                <TechLabel className="text-amber-500">Finance Data</TechLabel>
                <div className="text-sm mt-1 text-amber-100/70">Not connected</div>
                <StatusDot status="amber" />
              </div>
            </div>
            <div className="flex gap-4 p-3 border border-red-500/20 bg-red-500/5">
              <Globe2 className="text-red-500 mt-1" size={16} />
              <div className="flex-1">
                <TechLabel className="text-red-500">Live Web</TechLabel>
                <div className="text-sm mt-1 text-red-100/70">Not connected</div>
                <StatusDot status="offline" />
              </div>
            </div>
          </div>
        </HolographicPanel>
        
        <div className="p-4 border border-amber-500/20 bg-amber-500/5 text-amber-500/90 text-sm leading-relaxed relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <div className="flex items-center gap-2 mb-2 font-mono text-[10px] tracking-widest text-amber-500">
            <Sparkles size={12} /> PROTOCOL ZERO
          </div>
          Provider routing and trading authority are server-enforced. External data remains unavailable until connected.
        </div>
      </div>
    </div>
  );
}
