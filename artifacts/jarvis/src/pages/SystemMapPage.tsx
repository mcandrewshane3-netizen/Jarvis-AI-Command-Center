import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, Database, Network, RefreshCw, ShieldCheck, Workflow } from 'lucide-react';
import { HolographicPanel, StatusDot, TechLabel, TechValue } from '@/components/primitives';
import { AIProvider, useAIStatus } from '@/hooks/use-ai-status';
import { useRuntimeHealth } from '@/hooks/use-runtime-health';

type TradingState = { executionMode: string; killSwitchActive: boolean; updatedAt: string };

function providerStatus(provider: AIProvider) {
  return provider.health;
}

function providerDot(status: string): 'online' | 'amber' | 'red' | 'offline' {
  if (status === 'AVAILABLE') return 'online';
  if (status === 'DEGRADED') return 'amber';
  if (status === 'NOT CONFIGURED') return 'offline';
  return 'red';
}

export function SystemMapPage() {
  const { status, loading, error } = useAIStatus();
  const {
    data: runtime,
    loading: runtimeLoading,
    error: runtimeError,
    refresh: refreshRuntime,
  } = useRuntimeHealth();
  const [trading, setTrading] = useState<TradingState | null>(null);

  const loadTrading = useCallback(async () => {
    try {
      const response = await fetch('/api/trading/state', { cache: 'no-store', credentials: 'include' });
      if (response.ok) setTrading(await response.json());
    } catch { setTrading(null); }
  }, []);

  useEffect(() => { void loadTrading(); }, [loadTrading]);

  const runtimeDot: 'online' | 'amber' | 'offline' = runtimeLoading
    ? 'offline'
    : runtime?.status === 'ok'
      ? 'online'
      : runtime
        ? 'amber'
        : 'offline';
  const runtimeLabel = runtimeLoading
    ? 'CHECKING'
    : runtime?.status === 'ok'
      ? 'READY'
      : runtime?.status === 'degraded'
        ? 'DEGRADED'
        : 'UNAVAILABLE';

  return (
    <div className="page-enter stagger-1 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-9">
        <div>
          <TechLabel>Infrastructure // Read-only topology</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">System map.</h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl leading-relaxed">Operational relationships and control boundaries. This surface does not alter orchestration or trading authority.</p>
        </div>
        <div className="map-readonly">READ ONLY // SERVER-REPORTED</div>
      </div>

      {error ? <div className="border border-red-500/40 bg-red-500/5 text-red-400 p-4 mb-6 font-mono text-[10px] tracking-widest uppercase flex gap-3"><AlertTriangle size={15} /> {error}</div> : null}
      {runtimeError ? (
        <div className="border border-amber-500/40 bg-amber-500/5 text-amber-400 p-4 mb-6 font-mono text-[10px] tracking-widest uppercase flex items-center justify-between gap-3">
          <span className="flex items-center gap-3"><AlertTriangle size={15} /> Runtime readiness could not be verified. Existing UI remains available in degraded mode.</span>
          <button type="button" className="btn-tech" onClick={() => void refreshRuntime()}><RefreshCw size={13} /> RETRY</button>
        </div>
      ) : null}

      <HolographicPanel title="RUNTIME READINESS" className="mb-6">
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
          <div className="flex items-center gap-4">
            <StatusDot status={runtimeDot} pulse={runtimeLoading} />
            <div>
              <TechValue size="sm">{runtimeLabel}</TechValue>
              <TechLabel>Dependency-aware readiness // no paid provider probe</TechLabel>
            </div>
          </div>
          <div className="flex items-center gap-3 border-l border-primary/10 pl-4">
            <Database size={17} className={runtime?.checks.database === 'ok' ? 'text-primary' : 'text-amber-500'} />
            <div><TechLabel>Database</TechLabel><div className="font-mono text-xs text-white uppercase">{runtimeLoading ? 'CHECKING' : runtime?.checks.database ?? 'UNAVAILABLE'}</div></div>
          </div>
          <div className="flex items-center gap-3 border-l border-primary/10 pl-4">
            <Bot size={17} className={runtime?.checks.aiProvider === 'configured' ? 'text-primary' : 'text-amber-500'} />
            <div><TechLabel>AI providers</TechLabel><div className="font-mono text-xs text-white uppercase">{runtimeLoading ? 'CHECKING' : runtime?.checks.aiProvider ?? 'UNAVAILABLE'}{runtime ? ` // ${runtime.checks.configuredProviderCount}` : ''}</div></div>
          </div>
          <button type="button" className="btn-tech" onClick={() => void refreshRuntime()} disabled={runtimeLoading}><RefreshCw size={13} className={runtimeLoading ? 'animate-spin' : ''} /> REFRESH</button>
        </div>
        {runtime?.timestamp ? <div className="mt-4 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">Last verified {new Date(runtime.timestamp).toLocaleString()}</div> : null}
      </HolographicPanel>

      <div className="system-map">
        <HolographicPanel title="JARVIS IDENTITY" className="map-node identity-node">
          <div className="flex items-center gap-4"><Bot className="text-primary" size={26} /><div><TechValue size="sm">JARVIS</TechValue><TechLabel>Private personal command kernel</TechLabel></div></div>
        </HolographicPanel>
        <div className="map-link map-link-a" />
        <HolographicPanel title="ORCHESTRATION" className="map-node orchestration-node">
          <div className="flex items-center gap-4"><Workflow className="text-primary" size={22} /><div><TechValue size="sm">{loading ? 'SYNCING' : status?.intelligenceMode || 'UNAVAILABLE'}</TechValue><TechLabel>Intelligence mode // Provider policy: {status?.providerMode || '—'}</TechLabel></div></div>
        </HolographicPanel>
        <div className="map-link map-link-b" />
        <HolographicPanel title="PROVIDER LAYER" className="map-node providers-node">
          {loading ? <div className="map-loading">LOADING PROVIDER AUTHORITY...</div> : !status ? <div className="map-loading">PROVIDER STATE UNAVAILABLE</div> : <div className="space-y-2">
            {status.providers.map((provider) => { const label = providerStatus(provider); return <div className="map-provider" key={provider.id}><div><strong>{provider.name}</strong><small>{provider.capabilities?.join(' // ') || provider.reason || 'NO CAPABILITY DETAIL REPORTED'}</small></div><div className="text-right"><StatusDot status={providerDot(label)} /><small>{label}</small></div></div>; })}
          </div>}
        </HolographicPanel>
        <div className="map-link map-link-c" />
        <HolographicPanel title="SPECIALISTS" className="map-node specialist-node">
          <div className="grid grid-cols-2 gap-2">
            {['GENERAL', 'FINANCE', 'RESEARCH', 'CAREER', 'WORK', 'BUSINESS', 'SOFTWARE', 'MARKETS', 'PERSONAL', 'AUTOMATIONS'].map((item) => <div className="specialist-cell" key={item}><Network size={13} /><span>{item}</span></div>)}
          </div>
          <p className="mt-4 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">Specialist surfaces receive orchestrated context. Availability follows the provider layer.</p>
        </HolographicPanel>
      </div>

      <HolographicPanel title="PRESERVED TRADING-CONTROL BOUNDARY" className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-start gap-4"><ShieldCheck className="text-amber-500 mt-1" size={23} /><div><div className="font-mono text-sm tracking-widest text-amber-500">MARKETS REMAIN SERVER-CONTROLLED</div><p className="text-sm text-muted-foreground leading-relaxed mt-2 max-w-3xl">AI orchestration may inform research surfaces. Execution authority, permissions, and the kill switch remain outside this map and are enforced by the trading service.</p></div></div>
          <div className="boundary-state">{trading ? <><span>{trading.executionMode}</span><small>KILL SWITCH {trading.killSwitchActive ? 'ACTIVE' : 'INACTIVE'}</small></> : <small>TRADING STATE UNAVAILABLE</small>}</div>
        </div>
      </HolographicPanel>
    </div>
  );
}
