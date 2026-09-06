import { useState } from 'react';
import {
  Button,
  ExecutionMode,
  HolographicPanel,
  StatusDot,
  TechLabel,
  TechValue,
} from '@/components/primitives';
import { Power, ShieldCheck, RotateCw } from 'lucide-react';
import {
  useMarketsLabStatus,
  usePaperPortfolio,
  useUpdatePaperPortfolio,
  useMarketsStrategies,
  useStrategyLeaderboard,
  useTradingReview,
  useLiveReadiness,
  useRunAutonomousCycle
} from '@/hooks/use-jarvis-api';

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function MarketsPage() {
  const { data: labStatus, isLoading: loadingLab } = useMarketsLabStatus();
  const { data: portfolio, isLoading: loadingPortfolio } = usePaperPortfolio();
  const updatePortfolio = useUpdatePaperPortfolio();
  const { data: strategies, isLoading: loadingStrategies } = useMarketsStrategies();
  const { data: leaderboard, isLoading: loadingLeaderboard } = useStrategyLeaderboard();
  const { data: review, isLoading: loadingReview } = useTradingReview();
  const { data: readiness, isLoading: loadingReadiness } = useLiveReadiness();
  const runCycle = useRunAutonomousCycle();

  const [startingCapitalStr, setStartingCapitalStr] = useState('');
  const [showPortfolioSetup, setShowPortfolioSetup] = useState(false);

  const handleSetupPortfolio = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startingCapitalStr) return;
    updatePortfolio.mutate({
      startingCapitalCents: parseInt(startingCapitalStr, 10),
    }, {
      onSuccess: () => {
        setShowPortfolioSetup(false);
        setStartingCapitalStr('');
      }
    });
  };

  const isBusy = runCycle.isPending || updatePortfolio.isPending;

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-amber-500">Markets // Paper Laboratory</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Observe, then decide.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <ExecutionMode mode="RESEARCH" />
          <div className="state-badge">
            <Power size={14} />
            LIVE TRADING {labStatus?.liveTradingEnabled ? 'ACTIVE' : 'DISABLED'}
          </div>
        </div>
      </div>

      <div className="border border-amber-500/40 bg-amber-500/10 p-5 flex items-start gap-4 mb-8">
        <ShieldCheck className="text-amber-500 shrink-0 mt-1" />
        <div>
          <div className="font-mono text-sm uppercase text-amber-500 tracking-widest mb-1">Live execution unavailable</div>
          <p className="text-sm text-amber-500/80 leading-relaxed max-w-3xl">
            This laboratory operates purely on PAPER logic. External execution is disabled and any indicated actions will not hit live brokerages.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-6 mb-8">
        <div className="space-y-6">
          <HolographicPanel title="PROVIDER & DATA FRESHNESS">
            {loadingLab ? (
              <div className="py-8 text-center font-mono text-[10px] text-primary tracking-widest animate-pulse">
                LOADING LAB...
              </div>
            ) : !labStatus ? (
              <div className="py-8 text-center font-mono text-[10px] text-muted-foreground tracking-widest">
                LAB STATUS UNAVAILABLE
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border border-primary/10 bg-black/20">
                    <TechLabel className="mb-2">Data Provider</TechLabel>
                    {labStatus.providers?.length > 0 && labStatus.providers[0]?.configured ? (
                      <div className="flex items-center gap-2">
                        <StatusDot status="online" />
                        <span className="font-mono text-sm">{labStatus.providers[0]?.provider}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <StatusDot status="amber" />
                          <span className="font-mono text-sm">UNCONFIGURED</span>
                        </div>
                        <div className="font-mono text-[9px] text-amber-500 uppercase">
                          REQUIRES TWELVE_DATA_API_KEY
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 border border-primary/10 bg-black/20">
                    <TechLabel className="mb-2">Asset Classes</TechLabel>
                    <div className="font-mono text-sm text-muted-foreground">
                      {labStatus.supportedAssetClasses?.join(', ') || 'NONE'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border border-primary/10 bg-black/20">
                    <TechLabel className="mb-2">Scheduler</TechLabel>
                    <div className="font-mono text-xs text-muted-foreground">
                      {labStatus.scheduler?.enabled ? 'ACTIVE' : 'IDLE'}
                    </div>
                  </div>
                  <div className="p-3 border border-primary/10 bg-black/20">
                    <TechLabel className="mb-2">Counts</TechLabel>
                    <div className="font-mono text-xs text-muted-foreground">
                      {labStatus.counts?.executionCount || 0} EXEC / {labStatus.counts?.autonomousRunCount || 0} RUNS
                    </div>
                  </div>
                </div>

                <Button
                  variant="solid"
                  testId="btn-run-cycle"
                  onClick={() => runCycle.mutate()}
                  disabled={isBusy || !labStatus.portfolioConfigured || !labStatus.providers?.[0]?.configured}
                  className="w-full mt-4"
                >
                  <RotateCw size={14} className={`mr-2 ${runCycle.isPending ? 'animate-spin' : ''}`} />
                  {runCycle.isPending ? 'EXECUTING CYCLE...' : 'FORCE AUTONOMOUS CYCLE'}
                </Button>
              </div>
            )}
          </HolographicPanel>

          <HolographicPanel title="PAPER PORTFOLIO">
            {loadingPortfolio ? (
              <div className="py-8 text-center font-mono text-[10px] text-primary tracking-widest animate-pulse">
                LOADING PORTFOLIO...
              </div>
            ) : showPortfolioSetup || (!portfolio?.startingCapitalCents && !portfolio?.positions?.length) ? (
              <form onSubmit={handleSetupPortfolio} className="space-y-4">
                <div className="p-4 border border-primary/20 bg-primary/5 mb-4">
                  <div className="font-mono text-[10px] text-primary tracking-widest uppercase mb-2">
                    Initialize Paper Laboratory
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Set your starting paper capital in integer cents. This gives the strategy evaluator a realistic ceiling to simulate position sizing.
                  </p>
                  <div>
                    <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Starting Capital (Cents)</label>
                    <input
                      type="number"
                      value={startingCapitalStr}
                      onChange={(e) => setStartingCapitalStr(e.target.value)}
                      className="tech-input"
                      placeholder="e.g. 10000000 for $100k"
                      disabled={isBusy}
                    />
                  </div>
                </div>
                <div className="flex gap-4">
                  <Button type="submit" variant="solid" testId="btn-save-portfolio" disabled={isBusy || !startingCapitalStr} className="flex-1">
                    {updatePortfolio.isPending ? 'INITIALIZING...' : 'INITIALIZE'}
                  </Button>
                  {portfolio?.startingCapitalCents && (
                    <Button testId="btn-cancel-portfolio" onClick={() => setShowPortfolioSetup(false)} disabled={isBusy}>
                      CANCEL
                    </Button>
                  )}
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border border-primary/20 bg-primary/5">
                    <TechLabel className="mb-2">Total Equity</TechLabel>
                    <TechValue size="sm" className="text-primary">
                      {formatCents(portfolio.equityCents || 0)}
                    </TechValue>
                  </div>
                  <div className="p-4 border border-primary/10 bg-black/20">
                    <TechLabel className="mb-2">Available Cash</TechLabel>
                    <div className="font-mono text-xl text-foreground">
                      {formatCents(portfolio.cashCents || 0)}
                    </div>
                  </div>
                </div>

                <div>
                  <TechLabel className="mb-3">Open Positions</TechLabel>
                  {portfolio.positions?.length === 0 ? (
                    <div className="font-mono text-sm text-muted-foreground">NO POSITIONS</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="tech-table w-full text-xs">
                        <thead>
                          <tr>
                            <th>Symbol</th>
                            <th className="text-right">Qty</th>
                            <th className="text-right">Basis</th>
                            <th className="text-right">Current</th>
                            <th className="text-right">Unrealized</th>
                          </tr>
                        </thead>
                        <tbody>
                          {portfolio.positions?.map((pos: any) => {
                            const unrealized = (pos.currentPriceCents - pos.averageEntryCents) * pos.quantity;
                            return (
                              <tr key={pos.id}>
                                <td className="font-mono text-primary">{pos.symbol}</td>
                                <td className="font-mono text-right">{pos.quantity}</td>
                                <td className="font-mono text-right">{formatCents(pos.averageEntryCents)}</td>
                                <td className="font-mono text-right">{formatCents(pos.currentPriceCents)}</td>
                                <td className={`font-mono text-right ${unrealized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {formatCents(unrealized)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-black/40 border border-primary/20 text-muted-foreground text-xs font-mono uppercase tracking-widest text-center">
                  Server capital bounds are immutable post-initialization.
                </div>
              </div>
            )}
          </HolographicPanel>
        </div>

        <div className="space-y-6">
          <HolographicPanel title="STRATEGY LEADERBOARD">
            {loadingLeaderboard ? (
              <div className="py-8 text-center font-mono text-[10px] text-primary tracking-widest animate-pulse">
                LOADING LEADERBOARD...
              </div>
            ) : !leaderboard?.leaderboard || leaderboard.leaderboard.length === 0 ? (
              <div className="py-8 text-center font-mono text-[10px] text-muted-foreground tracking-widest">
                NO STRATEGIES EVALUATED
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="tech-table w-full">
                  <thead>
                    <tr>
                      <th>Strategy</th>
                      <th>Regime</th>
                      <th className="text-right">Win Rate</th>
                      <th className="text-right">Profit Factor</th>
                      <th className="text-right">Sharpe</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.leaderboard.map((strategy: any) => (
                      <tr key={strategy.id}>
                        <td className="font-mono text-[11px] text-primary">{strategy.name}</td>
                        <td className="font-mono text-[10px] text-muted-foreground">{strategy.regime}</td>
                        <td className="font-mono text-right">{(strategy.winRate * 100).toFixed(1)}%</td>
                        <td className="font-mono text-right">{strategy.profitFactor.toFixed(2)}</td>
                        <td className="font-mono text-right text-amber-400">{strategy.sharpe.toFixed(2)}</td>
                        <td className="text-center font-mono text-[10px] uppercase text-muted-foreground">
                          {strategy.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </HolographicPanel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <HolographicPanel title="TRADING REVIEW">
              {loadingReview ? (
                <div className="py-8 text-center font-mono text-[10px] text-primary tracking-widest animate-pulse">
                  LOADING REVIEW...
                </div>
              ) : !review || review.trades === 0 ? (
                <div className="py-8 text-center font-mono text-[10px] text-muted-foreground tracking-widest">
                  NO RECENT TRADES
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border border-primary/10 bg-black/20">
                      <TechLabel className="mb-2">Total Net PNL</TechLabel>
                      <div className={`font-mono text-xl ${(review.netPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCents(review.netPnl ?? 0)}
                      </div>
                    </div>
                    <div className="p-3 border border-primary/10 bg-black/20">
                      <TechLabel className="mb-2">Drawdown</TechLabel>
                      <div className="font-mono text-xl text-primary">
                        {((review.drawdown ?? 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border border-primary/10 bg-black/20">
                      <TechLabel className="mb-2">Best Trade</TechLabel>
                      {review.best ? (
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs text-primary">{review.best.symbol || 'UNKNOWN'}</span>
                          <span className="font-mono text-xs text-green-400">{formatCents(review.best.netPnl ?? 0)}</span>
                        </div>
                      ) : (
                        <div className="font-mono text-xs text-muted-foreground">--</div>
                      )}
                    </div>
                    <div className="p-3 border border-primary/10 bg-black/20">
                      <TechLabel className="mb-2">Worst Trade</TechLabel>
                      {review.worst ? (
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs text-primary">{review.worst.symbol || 'UNKNOWN'}</span>
                          <span className="font-mono text-xs text-red-400">{formatCents(review.worst.netPnl ?? 0)}</span>
                        </div>
                      ) : (
                        <div className="font-mono text-xs text-muted-foreground">--</div>
                      )}
                    </div>
                  </div>

                  <div className="p-3 border border-primary/10 bg-black/20">
                    <div className="flex justify-between items-center mb-2">
                      <TechLabel>Activity</TechLabel>
                      <span className="font-mono text-[9px] text-muted-foreground uppercase">
                        {review.trades ?? 0} CLOSED PAPER TRADES
                      </span>
                    </div>
                    {review.exitReasons && Object.keys(review.exitReasons).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-primary/10 space-y-1">
                        <TechLabel className="mb-2 text-primary/70">Exit Reasons</TechLabel>
                        {Object.entries(review.exitReasons).map(([reason, count]) => (
                          <div key={reason} className="flex justify-between">
                            <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[180px]">{reason}</span>
                            <span className="font-mono text-[10px] text-primary">
                              {count as number}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </HolographicPanel>

            <HolographicPanel title="LIVE READINESS">
              {loadingReadiness ? (
                <div className="py-8 text-center font-mono text-[10px] text-primary tracking-widest animate-pulse">
                  CHECKING READINESS...
                </div>
              ) : !readiness ? (
                <div className="py-8 text-center font-mono text-[10px] text-muted-foreground tracking-widest">
                  READINESS UNAVAILABLE
                </div>
              ) : (
                <div className="space-y-4">
                  {readiness.checks?.map((check: any) => (
                    <div key={check.name} className="flex items-center justify-between p-3 border border-primary/10 bg-black/20">
                      <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
                        {check.name}
                      </span>
                      <StatusDot status={check.passed ? 'online' : 'red'} />
                    </div>
                  ))}

                  <div className="mt-6 pt-4 border-t border-primary/20">
                    <div className="font-mono text-[10px] text-primary uppercase tracking-widest mb-2">Verdict</div>
                    {readiness.ready ? (
                      <div className="text-sm text-green-400">Evidence threshold met. Live execution disabled.</div>
                    ) : (
                      <div className="text-sm text-amber-500">Live execution blocked. Checks failed.</div>
                    )}
                  </div>
                </div>
              )}
            </HolographicPanel>
          </div>
        </div>
      </div>
    </div>
  );
}
