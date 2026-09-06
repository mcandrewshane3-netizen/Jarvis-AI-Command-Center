import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { useSettings } from '@/hooks/use-settings';
import { Monitor, Volume2, Shield, BrainCircuit, AlertTriangle, RefreshCw } from 'lucide-react';
import { useClerk } from '@clerk/react';
import { AIProvider, IntelligenceMode, ProviderMode, useAIStatus } from '@/hooks/use-ai-status';

const intelligenceDescriptions: Record<IntelligenceMode, string> = {
  NORMAL: 'Baseline assistance for direct commands and routine work.',
  SMART: 'Broader reasoning depth when the request warrants it.',
  MAX: 'Highest available deliberation policy. Provider availability still applies.',
};

const providerDescriptions: Record<ProviderMode, string> = {
  AUTO: 'Select from available providers according to server policy.',
  OPENAI_ONLY: 'Restrict intelligence routing to OpenAI.',
  GROK_ONLY: 'Restrict intelligence routing to Grok.',
  MULTI_AI: 'Allow coordinated routing across configured providers.',
};

function providerLabel(provider: AIProvider) {
  return provider.health;
}

function dot(label: string): 'online' | 'amber' | 'red' | 'offline' {
  if (label === 'AVAILABLE') return 'online';
  if (label === 'DEGRADED') return 'amber';
  if (label === 'NOT CONFIGURED') return 'offline';
  return 'red';
}

export function SettingsPage() {
  const { reducedMotion, setReducedMotion } = useSettings();
  const { signOut } = useClerk();
  const { status, loading, saving, error, refresh, update } = useAIStatus();
  const grok = status?.providers.find((provider) => provider.id.toLowerCase() === 'grok' || provider.name.toLowerCase().includes('grok'));
  const openai = status?.providers.find((provider) => provider.id === 'openai');
  const grokAvailable = Boolean(grok?.configured && grok?.available && providerLabel(grok) === 'AVAILABLE');
  const openAIAvailable = Boolean(openai?.configured && openai?.available && providerLabel(openai) === 'AVAILABLE');

  return (
    <div className="page-enter stagger-1 pb-12 max-w-4xl mx-auto">
      <div className="mb-10">
        <TechLabel>System Parameters</TechLabel>
        <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Configuration.</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
        <div className="flex flex-col gap-2 font-mono text-sm tracking-wider">
          <button className="px-4 py-3 text-left border-l-2 border-primary bg-primary/10 text-primary">CORE SETTINGS</button>
          <button disabled className="px-4 py-3 text-left border-l-2 border-transparent text-muted-foreground/50 cursor-not-allowed">SECURITY & AUTH</button>
          <button disabled className="px-4 py-3 text-left border-l-2 border-transparent text-muted-foreground/50 cursor-not-allowed">DATA FEEDS</button>
          <button disabled className="px-4 py-3 text-left border-l-2 border-transparent text-muted-foreground/50 cursor-not-allowed">NOTIFICATIONS</button>
        </div>
        
        <div className="space-y-6">
          <HolographicPanel title="AI INTELLIGENCE">
            {error ? <div className="settings-error"><AlertTriangle size={14} /> {error}</div> : null}
            {loading ? <div className="py-10 text-center font-mono text-[10px] text-primary tracking-widest animate-pulse">LOADING INTELLIGENCE AUTHORITY...</div> : !status ? <div className="py-10 text-center font-mono text-[10px] text-muted-foreground tracking-widest">INTELLIGENCE CONTROLS UNAVAILABLE</div> : (
              <div className="space-y-7">
                <section>
                  <div className="settings-section-heading"><BrainCircuit size={17} /><div><div className="font-mono text-sm text-white tracking-wider">INTELLIGENCE MODE</div><p>Sets the reasoning policy exposed to the orchestration layer.</p></div></div>
                  <div className="mode-grid mt-4">
                    {(Object.keys(intelligenceDescriptions) as IntelligenceMode[]).map((mode) => <button type="button" key={mode} disabled={saving || status.intelligenceMode === mode} onClick={() => void update({ intelligenceMode: mode })} className={`intelligence-mode ${status.intelligenceMode === mode ? 'selected' : ''}`}><strong>{mode}</strong><small>{status.intelligenceMode === mode ? 'CURRENT SERVER STATE' : intelligenceDescriptions[mode]}</small></button>)}
                  </div>
                </section>
                <section>
                  <div className="settings-section-heading"><div className="w-4 h-4 border border-primary/60 grid place-items-center"><div className="w-1 h-1 bg-primary" /></div><div><div className="font-mono text-sm text-white tracking-wider">PROVIDER ROUTING</div><p>Modes are available only where the required provider reports availability.</p></div></div>
                  <div className="space-y-2 mt-4">
                    {(Object.keys(providerDescriptions) as ProviderMode[]).map((mode) => {
                      const unavailable =
                        (mode === 'OPENAI_ONLY' && !openAIAvailable) ||
                        (mode === 'GROK_ONLY' && !grokAvailable) ||
                        (mode === 'MULTI_AI' && !(openAIAvailable && grokAvailable));
                      const unavailableReason =
                        mode === 'OPENAI_ONLY'
                          ? `OPENAI REQUIRED // ${openai?.health ?? 'UNAVAILABLE'}`
                          : mode === 'GROK_ONLY'
                            ? `GROK REQUIRED // ${grok?.health ?? 'NOT_CONFIGURED'}`
                            : `TWO AVAILABLE PROVIDERS REQUIRED`;
                      return <button type="button" key={mode} disabled={saving || unavailable || status.providerMode === mode} onClick={() => void update({ providerMode: mode })} className={`mode-select ${status.providerMode === mode ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}`}><span><strong>{mode.replaceAll('_', ' ')}</strong><small>{status.providerMode === mode ? 'CURRENT SERVER STATE' : unavailable ? unavailableReason : providerDescriptions[mode]}</small></span><StatusDot status={status.providerMode === mode ? 'online' : unavailable ? 'red' : 'amber'} /></button>;
                    })}
                  </div>
                </section>
                <section className="provider-roster">
                  <div className="flex justify-between items-center mb-3"><TechLabel>Provider availability // Server authority</TechLabel><Button testId="button-refresh-ai-status" onClick={() => void refresh()} disabled={saving} className="h-8 px-3 text-[10px]"><RefreshCw size={12} /> REFRESH</Button></div>
                  {status.providers.map((provider) => { const label = providerLabel(provider); return <div className="provider-row" key={provider.id}><div><strong>{provider.name}</strong><small>{provider.reason || provider.capabilities?.join(' // ') || 'NO DETAIL REPORTED'}</small></div><div className="text-right"><StatusDot status={dot(label)} /><small>{label}</small></div></div>; })}
                  <div className="mt-3 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">Last server report {new Date(status.updatedAt).toLocaleString()}</div>
                </section>
              </div>
            )}
          </HolographicPanel>
          <HolographicPanel title="DISPLAY & INTERFACE">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-4">
                  <Monitor className="text-primary mt-1" size={20} />
                  <div>
                    <div className="font-mono text-sm text-white uppercase tracking-wider mb-1">Cinematic Motion</div>
                    <div className="text-sm text-muted-foreground max-w-md leading-relaxed">
                      Controls holographic effects, scanning lines, and background animations. Disable to reduce system GPU load or motion sickness.
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setReducedMotion(!reducedMotion)}
                  aria-label={reducedMotion ? 'Enable cinematic motion' : 'Disable cinematic motion'}
                  aria-pressed={!reducedMotion}
                  className={`w-14 h-6 border rounded-full relative transition-colors ${!reducedMotion ? 'border-primary bg-primary/20' : 'border-muted bg-muted'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-primary transition-transform ${!reducedMotion ? 'translate-x-8 shadow-[0_0_10px_hsl(var(--primary))]' : 'translate-x-1 bg-muted-foreground'}`} />
                </button>
              </div>

              <div className="h-px bg-primary/10" />

              <div className="flex items-center justify-between opacity-50 pointer-events-none">
                <div className="flex items-start gap-4">
                  <Volume2 className="text-primary mt-1" size={20} />
                  <div>
                    <div className="font-mono text-sm text-white uppercase tracking-wider mb-1">Audio Feedback</div>
                    <div className="text-sm text-muted-foreground max-w-md leading-relaxed">
                      Haptic UI sounds and Jarvis voice synthesis. Hardware audio interface currently disconnected.
                    </div>
                  </div>
                </div>
                <div className="border border-muted bg-muted w-14 h-6 rounded-full relative">
                  <div className="absolute top-0.5 left-1 w-4 h-4 bg-muted-foreground" />
                </div>
              </div>
            </div>
          </HolographicPanel>

          <HolographicPanel title="SESSION MANAGEMENT">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <Shield className="text-primary mt-1" size={20} />
                <div className="flex-1">
                  <div className="font-mono text-sm text-white uppercase tracking-wider mb-1">Authentication Token</div>
                  <div className="text-sm text-muted-foreground leading-relaxed mb-4">
                    Active secure session via Clerk with private, server-isolated user records.
                  </div>
                  <div className="flex gap-4">
                    <Button variant="danger" testId="btn-sign-out" onClick={() => void signOut()}>TERMINATE SESSION</Button>
                  </div>
                </div>
              </div>
            </div>
          </HolographicPanel>
          
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground text-center uppercase p-4">
            Development preview // Build metadata unavailable
          </div>
        </div>
      </div>
    </div>
  );
}
