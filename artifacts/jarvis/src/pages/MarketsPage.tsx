import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import {
  Button,
  ExecutionMode,
  HolographicPanel,
  StatusDot,
  TechLabel,
} from '@/components/primitives';
import { AlertTriangle, Power, ShieldCheck, ShieldX } from 'lucide-react';
import { useMarketsIntelligenceStatus } from '@/hooks/use-jarvis-api';

type ExecutionModeValue = 'RESEARCH_ONLY' | 'APPROVAL_REQUIRED' | 'AGENTIC_AUTO';

type TradingState = {
  executionMode: ExecutionModeValue;
  killSwitchActive: boolean;
  updatedAt: string;
  capabilities: {
    robinhoodConnected: boolean;
    liveExecutionConfigured: boolean;
    agenticAutoAvailable: boolean;
    agenticAutoUnavailableReason: string | null;
  };
};

type PaperOrder = {
  id: string;
  intent: {
    symbol?: string;
    assetType?: string;
    side?: string;
    quantity?: number;
    notional?: number;
  };
  status: string;
  rejectionReasons: string[];
  createdAt: string;
};

const riskRules = [
  ['Position size', 'positionDollars'],
  ['Account exposure', 'totalExposure'],
  ['Daily loss', 'dailyLossDollars'],
  ['Cash reserve', 'cashReserve'],
  ['Asset allowed', 'assetClass'],
  ['Trading hours', 'tradingHours'],
  ['Open position limit', 'openPositions'],
  ['Trade count', 'tradesPerDay'],
  ['Kill switch', 'killSwitch'],
] as const;

const modeLabels: Record<ExecutionModeValue, string> = {
  RESEARCH_ONLY: 'RESEARCH ONLY',
  APPROVAL_REQUIRED: 'APPROVAL REQUIRED',
  AGENTIC_AUTO: 'AGENTIC AUTO',
};

function modeDisplay(mode: ExecutionModeValue): 'RESEARCH' | 'APPROVAL' | 'AGENTIC' {
  if (mode === 'APPROVAL_REQUIRED') return 'APPROVAL';
  if (mode === 'AGENTIC_AUTO') return 'AGENTIC';
  return 'RESEARCH';
}

function stateErrorMessage(value: unknown) {
  if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') {
    return value.error.replaceAll('_', ' ');
  }
  return 'AUTHORITATIVE STATE UPDATE FAILED';
}

export function MarketsPage() {
  const { sessionId } = useAuth();
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [tradingState, setTradingState] = useState<TradingState | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReactivation, setShowReactivation] = useState(false);
  const { data: intelligence, isLoading: loadingIntelligence } = useMarketsIntelligenceStatus();

  const loadTradingState = useCallback(async () => {
    setLoadingState(true);
    setError(null);
    try {
      const response = await fetch('/api/trading/state', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw payload;
      setTradingState(payload);
    } catch (caught) {
      setTradingState(null);
      setError(stateErrorMessage(caught));
    } finally {
      setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    void loadTradingState();
  }, [loadTradingState, sessionId]);

  useEffect(() => {
    setLoadingOrders(true);
    void fetch('/api/paper/orders', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => {
        setOrders(data);
        setLoadingOrders(false);
      })
      .catch(() => setLoadingOrders(false));
  }, [sessionId]);

  const changeMode = async (executionMode: ExecutionModeValue) => {
    if (!tradingState || executionMode === tradingState.executionMode) return;
    setPendingAction(executionMode);
    setError(null);
    try {
      const response = await fetch('/api/trading/execution-mode', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionMode }),
      });
      const payload = await response.json();
      if (!response.ok) throw payload;
      setTradingState(payload);
    } catch (caught) {
      setError(stateErrorMessage(caught));
      await loadTradingState();
    } finally {
      setPendingAction(null);
    }
  };

  const updateKillSwitch = async (active: boolean) => {
    setPendingAction(active ? 'KILL_SWITCH_ON' : 'KILL_SWITCH_OFF');
    setError(null);
    try {
      const response = await fetch(`/api/trading/kill-switch/${active ? 'activate' : 'deactivate'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(active ? {} : { confirmation: 'RESUME_NEW_LIVE_TRADING' }),
      });
      const payload = await response.json();
      if (!response.ok) throw payload;
      setTradingState(payload);
      setShowReactivation(false);
    } catch (caught) {
      setError(stateErrorMessage(caught));
      await loadTradingState();
    } finally {
      setPendingAction(null);
    }
  };

  const lastOrder = orders[0];
  const isBusy = pendingAction !== null;

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-amber-500">Markets // Authoritative control perimeter</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Observe, then decide.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {tradingState ? <ExecutionMode mode={modeDisplay(tradingState.executionMode)} /> : null}
          <div className={`state-badge ${tradingState?.killSwitchActive ? 'danger' : ''}`}>
            <Power size={14} />
            KILL SWITCH {loadingState ? 'LOADING' : tradingState ? (tradingState.killSwitchActive ? 'ACTIVE' : 'INACTIVE') : 'UNAVAILABLE'}
          </div>
        </div>
      </div>

      {tradingState?.killSwitchActive ? (
        <div className="border border-red-500/60 bg-red-500/10 p-5 flex items-start gap-4 mb-8">
          <ShieldX className="text-red-500 shrink-0 mt-1" />
          <div>
            <div className="font-mono text-sm uppercase text-red-500 tracking-widest mb-1">Trading paused // Kill switch active</div>
            <p className="text-sm text-red-400/80 leading-relaxed">
              New live orders are blocked server-side. Existing positions and orders are not automatically changed.
            </p>
          </div>
        </div>
      ) : (
        <div className="border border-amber-500/40 bg-amber-500/10 p-5 flex items-start gap-4 mb-8">
          <ShieldCheck className="text-amber-500 shrink-0 mt-1" />
          <div>
            <div className="font-mono text-sm uppercase text-amber-500 tracking-widest mb-1">Live execution unavailable</div>
            <p className="text-sm text-amber-500/80 leading-relaxed max-w-3xl">
              Robinhood and live market data are not connected. Only persisted paper-order evaluations appear below.
            </p>
          </div>
        </div>
      )}

      {error ? (
        <div className="border border-red-500/40 bg-red-500/5 text-red-400 p-4 mb-6 font-mono text-[10px] tracking-widest uppercase flex items-center gap-3">
          <AlertTriangle size={15} /> {error}
        </div>
      ) : null}

      <HolographicPanel title="MARKETS INTELLIGENCE // RESEARCH ONLY" className="mb-8">
        {loadingIntelligence ? (
          <div className="py-8 text-center font-mono text-[10px] text-primary tracking-widest animate-pulse">
            LOADING DETERMINISTIC ENGINES...
          </div>
        ) : !intelligence ? (
          <div className="py-8 text-center font-mono text-[10px] text-muted-foreground tracking-widest">
            INTELLIGENCE STATUS UNAVAILABLE
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ['Strategy validation', intelligence.strategyEngine?.status, `${intelligence.strategyEngine?.strategies ?? 0} SAVED`],
                ['Market regime', intelligence.marketRegimeEngine?.regime, intelligence.marketRegimeEngine?.status],
                ['Trade quality', intelligence.tradeQualityEngine?.status, 'NO LIVE DATA'],
                ['Capital survival', intelligence.capitalSurvivalEngine?.status, 'NO LIVE DATA'],
                ['Capital governor', intelligence.capitalGovernor?.status, intelligence.capitalGovernor?.decision],
                ['Performance tracker', intelligence.strategyPerformanceTracker?.status, `${intelligence.strategyPerformanceTracker?.paperOutcomes ?? 0} PAPER OUTCOMES`],
                ['Trading journal', intelligence.tradingJournal?.status, `${intelligence.tradingJournal?.entries ?? 0} ENTRIES`],
                ['Paper strategy lab', intelligence.paperStrategyLab?.status, intelligence.paperStrategyLab?.evaluation],
              ].map(([label, value, detail]) => (
                <div key={label} className="p-3 border border-primary/10 bg-black/20 min-h-24">
                  <TechLabel className="mb-3">{label}</TechLabel>
                  <div className="font-mono text-xs text-foreground tracking-wider">{value || 'UNAVAILABLE'}</div>
                  <div className="font-mono text-[9px] text-muted-foreground tracking-widest mt-2">{detail || 'NO DATA'}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 font-mono text-[9px] tracking-widest text-amber-500 uppercase">
              Market data {intelligence.marketData} // Brokerage {intelligence.brokerage} // No execution authority
            </div>
          </>
        )}
      </HolographicPanel>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-6 mb-8">
        <HolographicPanel title="EXECUTION MODE // SERVER AUTHORITY">
          {loadingState ? (
            <div className="py-12 text-center font-mono text-[10px] text-primary tracking-widest animate-pulse">LOADING AUTHORITATIVE STATE...</div>
          ) : !tradingState ? (
            <div className="py-12 text-center font-mono text-[10px] text-muted-foreground tracking-widest">STATE UNAVAILABLE</div>
          ) : (
            <>
              <div className="space-y-3">
                {(Object.keys(modeLabels) as ExecutionModeValue[]).map((mode) => {
                  const unavailable = mode === 'AGENTIC_AUTO' && !tradingState.capabilities.agenticAutoAvailable;
                  const selected = tradingState.executionMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={isBusy || unavailable || selected}
                      onClick={() => void changeMode(mode)}
                      className={`mode-select ${selected ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}`}
                    >
                      <span>
                        <strong>{modeLabels[mode]}</strong>
                        <small>
                          {selected ? 'CURRENT SERVER STATE' : unavailable
                            ? tradingState.capabilities.agenticAutoUnavailableReason?.replaceAll('_', ' ') || 'UNAVAILABLE'
                            : mode === 'APPROVAL_REQUIRED' ? 'USER APPROVAL REQUIRED PER ORDER' : 'SELECT MODE'}
                        </small>
                      </span>
                      <StatusDot status={selected ? 'online' : unavailable ? 'red' : 'amber'} />
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
                Confirmed {new Date(tradingState.updatedAt).toLocaleString()}
              </div>
            </>
          )}
        </HolographicPanel>

        <HolographicPanel title="GLOBAL KILL SWITCH">
          {!tradingState ? (
            <div className="py-12 text-center font-mono text-[10px] text-muted-foreground tracking-widest">CONTROL UNAVAILABLE</div>
          ) : tradingState.killSwitchActive ? (
            <div>
              <div className="kill-core active"><Power size={28} /><span>ACTIVE</span></div>
              <p className="text-sm text-muted-foreground leading-relaxed my-5">
                Reactivation only resumes permission checks for new live trading. It does not place, cancel, or liquidate anything.
              </p>
              {!showReactivation ? (
                <Button variant="danger" testId="button-request-reactivation" onClick={() => setShowReactivation(true)} disabled={isBusy} className="w-full">
                  REQUEST REACTIVATION
                </Button>
              ) : (
                <div className="border border-red-500/40 bg-red-500/5 p-4">
                  <div className="font-mono text-[10px] text-red-400 tracking-widest uppercase mb-4">
                    Resume permission for new live trading?
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="danger" testId="button-confirm-reactivation" onClick={() => void updateKillSwitch(false)} disabled={isBusy}>
                      {pendingAction === 'KILL_SWITCH_OFF' ? 'CONFIRMING...' : 'CONFIRM REACTIVATION'}
                    </Button>
                    <Button testId="button-cancel-reactivation" onClick={() => setShowReactivation(false)} disabled={isBusy}>CANCEL</Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="kill-core"><Power size={28} /><span>INACTIVE</span></div>
              <p className="text-sm text-muted-foreground leading-relaxed my-5">
                Activating immediately blocks permission for all new live submissions. It does not cancel orders or close positions.
              </p>
              <Button variant="danger" testId="button-activate-kill-switch" onClick={() => void updateKillSwitch(true)} disabled={isBusy} className="w-full">
                {pendingAction === 'KILL_SWITCH_ON' ? 'ACTIVATING...' : 'ACTIVATE KILL SWITCH'}
              </Button>
            </div>
          )}
        </HolographicPanel>
      </div>

      <HolographicPanel title="PAPER ORDERS TELEMETRY" className="mb-8">
        <div className="overflow-x-auto">
          <table className="tech-table min-w-[680px]">
            <thead>
              <tr>
                <th>Identifier</th>
                <th>Asset Type</th>
                <th className="text-right">Side / Quantity</th>
                <th className="text-right">Notional</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingOrders ? (
                <tr><td colSpan={5} className="text-center py-8 font-mono text-[10px] tracking-widest text-primary animate-pulse">LOADING...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">PAPER DATA: NO ORDERS PLACED</td></tr>
              ) : orders.map((item) => (
                <tr key={item.id}>
                  <td className="font-mono text-primary tracking-wider">{item.intent?.symbol || 'UNKNOWN'}</td>
                  <td className="text-muted-foreground">{item.intent?.assetType || 'UNAVAILABLE'}</td>
                  <td className="font-mono text-right tracking-wider">{item.intent?.side || '--'} / {item.intent?.quantity ?? '--'}</td>
                  <td className="font-mono text-right tracking-wider">
                    {typeof item.intent?.notional === 'number' ? `$${item.intent.notional.toLocaleString()}` : '--'}
                  </td>
                  <td className="text-center font-mono text-[10px] uppercase text-amber-500 tracking-widest">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HolographicPanel>

      <HolographicPanel title="RISK ENGINE EVALUATION">
        {!lastOrder ? (
          <div className="py-10 text-center font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            Waiting for paper OrderIntent
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {riskRules.map(([label, key]) => {
              const blocked = lastOrder.rejectionReasons.includes(key);
              return (
                <div key={key} className={`risk-check ${blocked ? 'blocked' : 'passed'}`}>
                  {blocked ? <ShieldX size={14} /> : <ShieldCheck size={14} />}
                  <span>{label}</span>
                  <StatusDot status={blocked ? 'red' : 'online'} />
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-5 font-mono text-[9px] tracking-widest text-muted-foreground uppercase leading-relaxed">
          This display mirrors persisted evaluation results. The server-side deterministic RiskEngine remains authoritative.
        </p>
      </HolographicPanel>
    </div>
  );
}