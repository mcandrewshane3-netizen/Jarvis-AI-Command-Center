import { useEffect, useState } from 'react';
import {
  ExecutionMode,
  HolographicPanel,
  KillSwitch,
  StatusDot,
  TechLabel,
} from '@/components/primitives';
import { ShieldCheck, ShieldX } from 'lucide-react';

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

export function MarketsPage() {
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch('/api/paper/orders')
      .then((response) => response.ok ? response.json() : [])
      .then((data) => {
        setOrders(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const lastOrder = orders[0];

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-amber-500">Markets // Paper perimeter</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Observe, then decide.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <ExecutionMode mode="RESEARCH" />
          <KillSwitch readOnly engaged={false} label="STATE UNAVAILABLE // SERVER CONTROL REQUIRED" />
        </div>
      </div>

      <div className="border border-amber-500/40 bg-amber-500/10 p-5 flex items-start gap-4 mb-8">
        <ShieldCheck className="text-amber-500 shrink-0 mt-1" />
        <div>
          <div className="font-mono text-sm uppercase text-amber-500 tracking-widest mb-1">Live execution disabled</div>
          <p className="text-sm text-amber-500/80 leading-relaxed max-w-3xl">
            Brokerage and market-data APIs are disconnected. Only persisted paper-order evaluations appear below.
          </p>
        </div>
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
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 font-mono text-[10px] tracking-widest text-primary animate-pulse">LOADING...</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">PAPER DATA: NO ORDERS PLACED</td>
                </tr>
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

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_.7fr] gap-6">
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

        <HolographicPanel title="EXECUTION CONTROL">
          <div className="space-y-3">
            <div className="mode-row active"><span>Research Only</span><strong>ACTIVE</strong></div>
            <div className="mode-row"><span>Approval Required</span><strong>NOT CONFIGURED</strong></div>
            <div className="mode-row disabled"><span>Agentic Auto</span><strong>DISABLED</strong></div>
          </div>
        </HolographicPanel>
      </div>
    </div>
  );
}