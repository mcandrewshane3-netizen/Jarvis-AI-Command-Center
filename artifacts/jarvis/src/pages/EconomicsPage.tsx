import { useState, useEffect } from 'react';
import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { AlertTriangle, Plus, Trash2, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import { 
  useEconomicEngineStatus, 
  useEconomicsEntries, 
  useCreateEconomicsEntry, 
  useDeleteEconomicsEntry, 
  useEconomicsSummary 
} from '@/hooks/use-jarvis-api';
import { ErrorBoundary } from '@/components/error-boundary';

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const CATEGORY_MAP: Record<string, string[]> = {
  REAL: [
    'REPLIT_DEVELOPMENT_COST',
    'REPLIT_OPERATING_COST',
    'OPENAI_COST',
    'XAI_COST',
    'MARKET_DATA_COST',
    'INFRASTRUCTURE_COST',
    'COMMERCE_SOFTWARE_COST',
    'ADVERTISING_COST',
    'OTHER_OPERATING_EXPENSE',
    'REALIZED_TRADING_PNL',
    'REALIZED_COMMERCE_PNL',
    'OTHER_ATTRIBUTABLE_REVENUE',
    'REALIZED_COST_SAVING'
  ],
  PAPER: [
    'PAPER_TRADING_PNL',
    'PAPER_COMMERCE_PNL'
  ],
  FORECAST: [
    'PROJECTED_REVENUE',
    'PROJECTED_SAVING',
    'PROJECTED_COST'
  ]
};

function EconomicsContent() {
  const [scope, setScope] = useState('REAL');
  const [category, setCategory] = useState(CATEGORY_MAP['REAL'][0]);
  const [amountCents, setAmountCents] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('MANUAL');
  const [verified, setVerified] = useState(false);
  
  const { data: status, isLoading: loadingStatus, refetch: refetchStatus } = useEconomicEngineStatus();
  const { data: entries, isLoading: loadingEntries } = useEconomicsEntries();
  const { data: summary, isLoading: loadingSummary } = useEconomicsSummary();
  const createEntry = useCreateEconomicsEntry();
  const deleteEntry = useDeleteEconomicsEntry();

  useEffect(() => {
    if (!CATEGORY_MAP[scope].includes(category)) {
      setCategory(CATEGORY_MAP[scope][0]);
    }
  }, [scope, category]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !amountCents || !description) return;
    
    createEntry.mutate({
      scope,
      category,
      amountCents: parseInt(amountCents, 10),
      description,
      source,
      verified,
      occurredAt: new Date().toISOString()
    }, {
      onSuccess: () => {
        setAmountCents('');
        setDescription('');
      }
    });
  };

  const isBusy = createEntry.isPending || deleteEntry.isPending;

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-amber-500">Economics // Ledger & Breakeven</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Financial Determinism.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="state-badge">
            <StatusDot status="online" />
            ENGINE OPERATIONAL
          </div>
          <div className="state-badge">
            <StatusDot status={status?.marketData?.configured ? 'online' : 'offline'} />
            MARKET DATA {status?.marketData?.configured ? status.marketData.status || 'OK' : 'NOT_CONFIGURED'}
          </div>
          <Button variant="icon" testId="btn-refresh-eco" onClick={() => refetchStatus()} disabled={loadingStatus}>
            <RefreshCw size={14} className={loadingStatus ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 mb-8">
        <div className="space-y-6">
          <HolographicPanel title="DETERMINISTIC SUMMARY">
            {loadingSummary ? (
              <div className="py-8 text-center font-mono text-[10px] text-primary tracking-widest animate-pulse">
                CALCULATING...
              </div>
            ) : !summary ? (
              <div className="py-8 text-center font-mono text-[10px] text-muted-foreground tracking-widest">
                NO DATA
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border border-primary/10 bg-black/20">
                    <TechLabel className="text-muted-foreground mb-2">Total Revenue (REAL)</TechLabel>
                    <div className="flex items-center gap-2 text-green-400">
                      <ArrowUpRight size={16} />
                      <span className="font-mono text-xl">{formatCents(summary.totalRealizedRevenueCents ?? 0)}</span>
                    </div>
                  </div>
                  <div className="p-4 border border-primary/10 bg-black/20">
                    <TechLabel className="text-muted-foreground mb-2">Total Cost (REAL)</TechLabel>
                    <div className="flex items-center gap-2 text-red-400">
                      <ArrowDownRight size={16} />
                      <span className="font-mono text-xl">
                        {formatCents(
                          (summary.totalDevelopmentInvestmentCents ?? 0) +
                          (summary.totalOperatingCostCents ?? 0),
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 border border-primary/20 bg-primary/5">
                  <TechLabel className="mb-2 text-primary">Net Profit / Breakeven</TechLabel>
                  <TechValue size="md" className={(summary.netEconomicResultCents ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {formatCents(summary.netEconomicResultCents ?? 0)}
                  </TechValue>
                  <div className="mt-4 tech-progress-bg">
                    <div 
                      className="tech-progress-fill" 
                      style={{
                        width: `${Math.min(100, Math.max(
                          0,
                          ((summary.totalRealizedRevenueCents ?? 0) /
                            Math.max(
                              1,
                              (summary.totalDevelopmentInvestmentCents ?? 0) +
                              (summary.totalOperatingCostCents ?? 0),
                            )) * 100,
                        ))}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="p-4 border border-amber-500/20 bg-amber-500/5">
                    <TechLabel className="mb-2 text-amber-500">PAPER (Simulated)</TechLabel>
                    <div>
                      <div className="font-mono text-[9px] text-muted-foreground uppercase mb-1">Paper PNL</div>
                      <div className={`font-mono text-sm ${(summary.paperPerformanceCents ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCents(summary.paperPerformanceCents ?? 0)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 border border-cyan-500/20 bg-cyan-500/5">
                    <TechLabel className="mb-2 text-cyan-500">FORECAST (Projected)</TechLabel>
                    <div>
                      <div className="font-mono text-[9px] text-muted-foreground uppercase mb-1">Net Forecast</div>
                      <div className={`font-mono text-sm ${(summary.forecastNetCents ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCents(summary.forecastNetCents ?? 0)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </HolographicPanel>

          <HolographicPanel title="RECORD ENTRY">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Scope</label>
                  <select 
                    value={scope} 
                    onChange={(e) => setScope(e.target.value)}
                    className="tech-input w-full cursor-pointer appearance-none"
                    disabled={isBusy}
                  >
                    <option value="REAL">REAL</option>
                    <option value="PAPER">PAPER</option>
                    <option value="FORECAST">FORECAST</option>
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Source</label>
                  <select 
                    value={source} 
                    onChange={(e) => setSource(e.target.value)}
                    className="tech-input w-full cursor-pointer appearance-none"
                    disabled={isBusy}
                  >
                    <option value="MANUAL">MANUAL</option>
                    <option value="BANK_SYNC">BANK_SYNC</option>
                    <option value="STRIPE">STRIPE</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="tech-input w-full cursor-pointer appearance-none"
                    disabled={isBusy}
                  >
                    {CATEGORY_MAP[scope].map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Amount (Cents)</label>
                  <input 
                    type="number" 
                    value={amountCents} 
                    onChange={(e) => setAmountCents(e.target.value)}
                    className="tech-input" 
                    placeholder="e.g. 5000 for $50.00"
                    disabled={isBusy}
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Description</label>
                <input 
                  type="text" 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)}
                  className="tech-input" 
                  placeholder="Monthly server costs..."
                  disabled={isBusy}
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setVerified(!verified)}
                  className={`tech-checkbox ${verified ? 'checked' : ''}`}
                  disabled={isBusy}
                >
                  {verified && <div className="w-2 h-2 bg-primary" />}
                </button>
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                  Verified against external source
                </span>
              </div>

              <Button type="submit" variant="solid" testId="btn-submit-entry" disabled={isBusy || !category || !amountCents || !description} className="w-full mt-4">
                {createEntry.isPending ? 'RECORDING...' : 'PERSIST ENTRY'}
              </Button>
              {createEntry.isError && (
                <div className="mt-2 text-xs font-mono text-red-500 uppercase">
                  ERROR: {createEntry.error?.message || 'Failed to create entry'}
                </div>
              )}
            </form>
          </HolographicPanel>
        </div>

        <HolographicPanel title="PROJECT LEDGER" className="flex flex-col">
          {loadingEntries ? (
             <div className="py-12 text-center font-mono text-[10px] text-primary tracking-widest animate-pulse">
               LOADING LEDGER...
             </div>
          ) : !entries || entries.length === 0 ? (
             <div className="py-12 text-center font-mono text-[10px] text-muted-foreground tracking-widest">
               NO ENTRIES FOUND
             </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tech-table w-full">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bucket</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className={entry.bucket === 'PAPER_FORECAST' ? 'opacity-60' : ''}>
                      <td className="font-mono text-[10px] text-muted-foreground">{new Date(entry.occurredAt).toLocaleDateString()}</td>
                      <td className="font-mono text-[10px] uppercase text-primary tracking-wider">{entry.bucket}</td>
                      <td className="font-mono text-[11px] text-foreground">{entry.category}</td>
                      <td className="text-muted-foreground text-sm">{entry.description}</td>
                      <td className={`font-mono text-right tracking-wider ${entry.bucket === 'REVENUE' ? 'text-green-400' : 'text-foreground'}`}>
                        {formatCents(entry.amountCents)}
                      </td>
                      <td className="text-center">
                        <Button 
                          variant="icon" 
                          testId={`btn-delete-${entry.id}`}
                          onClick={() => deleteEntry.mutate(entry.id)}
                          disabled={deleteEntry.isPending}
                          className="w-6 h-6 border-red-500/20 text-red-500 hover:bg-red-500/10 hover:border-red-500"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HolographicPanel>
      </div>
    </div>
  );
}

export function EconomicsPage() {
  return (
    <ErrorBoundary>
      <EconomicsContent />
    </ErrorBoundary>
  );
}
