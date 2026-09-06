import { useEffect, useState } from 'react';
import { HolographicPanel, TechLabel, TechValue, Button, StatusDot, JARVISCore } from '@/components/primitives';
import { Sparkles, FileText, Check, ChevronRight, Activity } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useSpecialistsStatus } from '@/hooks/use-jarvis-api';

export function OverviewPage() {
  const [, setLocation] = useLocation();
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; project: string; done: boolean }>>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [tradingState, setTradingState] = useState<{ executionMode: string; killSwitchActive: boolean } | null>(null);
  const [loadingTrading, setLoadingTrading] = useState(true);
  
  const { data: status, isLoading: loadingStatus } = useSpecialistsStatus();

  useEffect(() => {
    void fetch('/api/tasks')
      .then((response) => response.ok ? response.json() : [])
      .then((items) => {
        setTasks(items.map((item: any) => ({
          id: item.id,
          title: item.title,
          project: item.project,
          done: item.completed,
        })));
        setLoadingTasks(false);
      })
      .catch(() => setLoadingTasks(false));
  }, []);

  useEffect(() => {
    void fetch('/api/trading/state', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Trading state unavailable');
        return response.json();
      })
      .then((state) => setTradingState(state))
      .catch(() => setTradingState(null))
      .finally(() => setLoadingTrading(false));
  }, []);

  const now = new Date();
  const dayAndTime = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 mb-8">
        <div className="flex flex-col justify-center">
          <TechLabel className="mb-4">{dayAndTime}</TechLabel>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-white font-light tracking-tight mb-4">
            Good morning.
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-xl leading-relaxed mb-8">
            Your authenticated command workspace is ready. Provider, data, and execution availability are reported below.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/jarvis" className="btn-tech solid group">
              <Sparkles size={16} className="group-hover:animate-spin" /> ASK JARVIS
            </Link>
            <Button variant="primary" testId="btn-briefing" disabled>
              <FileText size={16} /> BRIEFING UNAVAILABLE
            </Button>
          </div>
        </div>
        
        <div className="flex justify-center items-center py-8 lg:py-0">
          <JARVISCore onClick={() => setLocation('/jarvis')} processText="AWAITING INPUT" />
        </div>
      </div>

      <HolographicPanel className="mb-8 border-dashed border-primary/20 p-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-10 h-10 bg-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
              <Activity className="text-primary/50" size={20} />
            </div>
            <div>
              <div className="font-mono text-xs text-primary/50 tracking-widest uppercase mb-1">System Topology</div>
              <div className="text-sm text-foreground uppercase font-mono tracking-wider">
                {loadingStatus ? 'SCANNING...' : status?.identity ? `IDENTITY: ${status.identity}` : 'NOT CONFIGURED'}
              </div>
            </div>
          </div>
          {!loadingStatus && status && (
            <div className="flex items-center gap-6">
              <div>
                <div className="font-mono text-[10px] text-primary/40 tracking-widest uppercase mb-1">Records</div>
                <div className="font-mono text-lg text-primary">{status.totalRecords}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-primary/40 tracking-widest uppercase mb-1">External</div>
                <div className="font-mono text-xs text-amber-500 uppercase tracking-widest px-2 py-1 bg-amber-500/10 border border-amber-500/20">{status.externalActions}</div>
              </div>
            </div>
          )}
        </div>
        {!loadingStatus && status && status.counts && (
          <div className="grid grid-cols-2 md:grid-cols-5 border-t border-primary/20">
            {Object.entries(status.counts).map(([domain, count]) => (
              <div key={domain} className="p-3 border-r border-b md:border-b-0 border-primary/10 last:border-r-0 text-center bg-black/20">
                <div className="font-mono text-[10px] text-primary/50 tracking-widest uppercase mb-1">{domain}</div>
                <div className="font-mono text-sm text-foreground">{count as number}</div>
              </div>
            ))}
          </div>
        )}
      </HolographicPanel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <HolographicPanel title="TODAY'S PRIORITIES">
            {loadingTasks ? (
              <div className="text-center py-6 text-primary font-mono text-[10px] tracking-widest uppercase animate-pulse">LOADING...</div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground font-mono text-[10px] tracking-widest uppercase">NO DATA</div>
            ) : (
              <div className="space-y-2">
                {tasks.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-3 border border-primary/5 bg-black/20">
                    <div className={`tech-checkbox shrink-0 ${item.done ? 'checked' : ''}`}>
                      <Check size={12} strokeWidth={3} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm truncate ${item.done ? 'text-primary/50 line-through' : 'text-foreground'}`}>{item.title}</div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-1 uppercase">{item.project}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link href="/work" className="mt-4 block font-mono text-[10px] text-primary hover:text-primary/70 tracking-widest uppercase transition-colors text-right">
              ACCESS MODULE <ChevronRight size={10} className="inline mb-0.5" />
            </Link>
          </HolographicPanel>

          <HolographicPanel title="WORK THREADS">
            <div className="flex items-center justify-center py-10 border border-primary/5 bg-primary/5">
              <span className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">NO DATA</span>
            </div>
            <Link href="/work" className="mt-4 block font-mono text-[10px] text-primary hover:text-primary/70 tracking-widest uppercase transition-colors text-right">
              ACCESS MODULE <ChevronRight size={10} className="inline mb-0.5" />
            </Link>
          </HolographicPanel>
        </div>

        <div className="space-y-6">
          <HolographicPanel title="FINANCE TELEMETRY">
            <div className="mb-6">
              <TechValue size="lg" className="text-muted-foreground">--</TechValue>
              <div className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mt-2 mb-4">Estimated Net Worth</div>
              <div className="font-mono text-[10px] flex items-center gap-2 tracking-widest text-amber-500">
                <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20">{status?.financeDataStatus || 'UNKNOWN'}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 border border-primary/10 bg-black/20">
                <TechLabel className="mb-2">CASH</TechLabel>
                <TechValue size="sm" className="text-muted-foreground">--</TechValue>
              </div>
              <div className="p-3 border border-primary/10 bg-black/20">
                <TechLabel className="mb-2">RUNWAY</TechLabel>
                <TechValue size="sm" className="text-muted-foreground">--</TechValue>
              </div>
            </div>
            <Link href="/finance" className="mt-4 block font-mono text-[10px] text-primary hover:text-primary/70 tracking-widest uppercase transition-colors text-right">
              ACCESS MODULE <ChevronRight size={10} className="inline mb-0.5" />
            </Link>
          </HolographicPanel>

          <HolographicPanel title="MARKET FEED">
            <div className="space-y-2">
              <div className="mode-row active">
                 <span>Execution mode</span>
                 <strong>{loadingTrading ? 'LOADING' : tradingState?.executionMode?.replaceAll('_', ' ') || 'UNAVAILABLE'}</strong>
               </div>
               <div className="mode-row">
                 <span>Kill switch</span>
                 <strong>{loadingTrading ? 'LOADING' : tradingState ? (tradingState.killSwitchActive ? 'ACTIVE' : 'INACTIVE') : 'UNAVAILABLE'}</strong>
               </div>
               <div className="mode-row">
                 <span>Intelligence layer</span>
                 <strong>{status?.marketsMode?.replaceAll('_', ' ') || 'UNAVAILABLE'}</strong>
              </div>
            </div>
            <Link href="/markets" className="mt-4 block font-mono text-[10px] text-primary hover:text-primary/70 tracking-widest uppercase transition-colors text-right">
              ACCESS MODULE <ChevronRight size={10} className="inline mb-0.5" />
            </Link>
          </HolographicPanel>
        </div>
      </div>
    </div>
  );
}
