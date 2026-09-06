import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { useSettings } from '@/hooks/use-settings';
import { Monitor, Volume2, Shield, Eye, Settings2 } from 'lucide-react';
import { useClerk } from '@clerk/react';

export function SettingsPage() {
  const { reducedMotion, setReducedMotion } = useSettings();
  const { signOut } = useClerk();

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
                  aria-label="Enable cinematic motion"
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
