import { useState } from 'react';
import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { ShoppingBag, AlertTriangle, Play, Settings2 } from 'lucide-react';
import { useCommerceStatus, useEvaluateUnitEconomics } from '@/hooks/use-jarvis-api';
import { ErrorBoundary } from '@/components/error-boundary';

function CommerceContent() {
  const { data: status, isLoading: loadingStatus } = useCommerceStatus();
  const evaluateUE = useEvaluateUnitEconomics();

  const [productCost, setProductCost] = useState('1500');
  const [shippingCost, setShippingCost] = useState('500');
  const [salePrice, setSalePrice] = useState('4500');
  const [adSpend, setAdSpend] = useState('1000');
  const [platformFees, setPlatformFees] = useState('0');
  const [paymentFees, setPaymentFees] = useState('0');
  const [refundAllowance, setRefundAllowance] = useState('0');
  const [chargebackAllowance, setChargebackAllowance] = useState('0');
  const [otherVariableCosts, setOtherVariableCosts] = useState('0');
  
  const [evalResult, setEvalResult] = useState<any>(null);

  const handleEvaluate = (e: React.FormEvent) => {
    e.preventDefault();
    evaluateUE.mutate({
      revenueCents: parseInt(salePrice, 10) || 0,
      productCostCents: parseInt(productCost, 10) || 0,
      shippingCostCents: parseInt(shippingCost, 10) || 0,
      platformFeesCents: parseInt(platformFees, 10) || 0,
      paymentFeesCents: parseInt(paymentFees, 10) || 0,
      customerAcquisitionCostCents: parseInt(adSpend, 10) || 0,
      refundAllowanceCents: parseInt(refundAllowance, 10) || 0,
      chargebackAllowanceCents: parseInt(chargebackAllowance, 10) || 0,
      otherVariableCostsCents: parseInt(otherVariableCosts, 10) || 0
    }, {
      onSuccess: (data) => {
        setEvalResult(data);
      }
    });
  };

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-amber-500">Commerce // Direct & Social Shop</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Retail Execution.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="state-badge danger border-red-500/50 bg-red-500/10 text-red-500">
            <Settings2 size={14} />
            FOUNDATION NOT CONNECTED
          </div>
          <div className="state-badge">
            <StatusDot status={status?.capabilities?.spendingEnabled ? 'online' : 'offline'} />
            SPENDING: {status?.capabilities?.spendingEnabled ? 'ACTIVE' : 'BLOCKED'}
          </div>
        </div>
      </div>

      <div className="border border-amber-500/40 bg-amber-500/10 p-5 flex items-start gap-4 mb-8">
        <AlertTriangle className="text-amber-500 shrink-0 mt-1" />
        <div>
          <div className="font-mono text-sm uppercase text-amber-500 tracking-widest mb-1">Commerce Adapters Offline</div>
          <p className="text-sm text-amber-500/80 leading-relaxed max-w-3xl">
            TikTok Shop, Shopify, and fulfillment adapters are currently disabled. You may use this space for theoretical unit economics evaluation. No live API calls will be made to external vendors.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <HolographicPanel title="ANALYTICAL FOUNDATION // STATUS">
          {loadingStatus ? (
             <div className="py-12 text-center font-mono text-[10px] text-primary tracking-widest animate-pulse">
               PROBING ADAPTERS...
             </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {status?.adapters?.map((adapter: any) => (
                  <div key={adapter.name} className="p-4 border border-primary/10 bg-black/20">
                    <div className="flex justify-between items-center mb-3">
                      <TechLabel>{adapter.name}</TechLabel>
                      <StatusDot status={adapter.connected ? 'online' : 'offline'} />
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                      {adapter.connected ? 'AUTHENTICATED' : 'NOT CONFIGURED'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-primary/10 pt-4">
                <TechLabel className="mb-3">Active Channels</TechLabel>
                {status?.channels?.length === 0 ? (
                  <div className="font-mono text-sm text-muted-foreground">NO CHANNELS CONFIGURED</div>
                ) : (
                  <ul className="space-y-2">
                    {status?.channels?.map((channel: any) => (
                      <li key={channel.id} className="font-mono text-xs text-primary flex items-center gap-2">
                        <ShoppingBag size={12} />
                        {channel.name} ({channel.type})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </HolographicPanel>

        <HolographicPanel title="UNIT ECONOMICS SIMULATOR">
          <form onSubmit={handleEvaluate} className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Sale Price (Cents)</label>
                <input 
                  type="number" 
                  value={salePrice} 
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="tech-input" 
                  disabled={evaluateUE.isPending}
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Product Cost (Cents)</label>
                <input 
                  type="number" 
                  value={productCost} 
                  onChange={(e) => setProductCost(e.target.value)}
                  className="tech-input" 
                  disabled={evaluateUE.isPending}
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Shipping Cost (Cents)</label>
                <input 
                  type="number" 
                  value={shippingCost} 
                  onChange={(e) => setShippingCost(e.target.value)}
                  className="tech-input" 
                  disabled={evaluateUE.isPending}
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Platform Fees (Cents)</label>
                <input 
                  type="number" 
                  value={platformFees} 
                  onChange={(e) => setPlatformFees(e.target.value)}
                  className="tech-input" 
                  disabled={evaluateUE.isPending}
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Payment Fees (Cents)</label>
                <input 
                  type="number" 
                  value={paymentFees} 
                  onChange={(e) => setPaymentFees(e.target.value)}
                  className="tech-input" 
                  disabled={evaluateUE.isPending}
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Est. Ad Spend (CAC) (Cents)</label>
                <input 
                  type="number" 
                  value={adSpend} 
                  onChange={(e) => setAdSpend(e.target.value)}
                  className="tech-input" 
                  disabled={evaluateUE.isPending}
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Refund Allowance (Cents)</label>
                <input 
                  type="number" 
                  value={refundAllowance} 
                  onChange={(e) => setRefundAllowance(e.target.value)}
                  className="tech-input" 
                  disabled={evaluateUE.isPending}
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Chargeback Allw. (Cents)</label>
                <input 
                  type="number" 
                  value={chargebackAllowance} 
                  onChange={(e) => setChargebackAllowance(e.target.value)}
                  className="tech-input" 
                  disabled={evaluateUE.isPending}
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] text-primary tracking-widest uppercase mb-2">Other Var. Costs (Cents)</label>
                <input 
                  type="number" 
                  value={otherVariableCosts} 
                  onChange={(e) => setOtherVariableCosts(e.target.value)}
                  className="tech-input" 
                  disabled={evaluateUE.isPending}
                />
              </div>
            </div>
            
            <Button type="submit" variant="solid" testId="btn-evaluate" disabled={evaluateUE.isPending} className="w-full mt-2">
              <Play size={14} className="mr-2" />
              {evaluateUE.isPending ? 'COMPUTING...' : 'RUN SIMULATION'}
            </Button>
          </form>

          {evalResult && (
            <div className="mt-6 p-4 border border-primary/20 bg-primary/5">
              <TechLabel className="mb-4">Simulation Results</TechLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <div className="font-mono text-[9px] text-muted-foreground uppercase mb-1">Gross Margin</div>
                  <div className="font-mono text-lg text-primary">{(evalResult.grossMarginBasisPoints / 100).toFixed(2)}%</div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-muted-foreground uppercase mb-1">Contribution Profit</div>
                  <div className={`font-mono text-lg ${evalResult.contributionProfitCents >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${(evalResult.contributionProfitCents / 100).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-muted-foreground uppercase mb-1">Contribution Margin</div>
                  <div className="font-mono text-lg text-primary">{(evalResult.contributionMarginBasisPoints / 100).toFixed(2)}%</div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-muted-foreground uppercase mb-1">Break-Even CAC</div>
                  <div className="font-mono text-lg text-amber-400">${(evalResult.breakEvenCacCents / 100).toFixed(2)}</div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-muted-foreground uppercase mb-1">Break-Even ROAS</div>
                  <div className="font-mono text-lg text-amber-400">{(evalResult.breakEvenRoasBasisPoints / 10000).toFixed(2)}x</div>
                </div>
              </div>
            </div>
          )}
        </HolographicPanel>
      </div>
    </div>
  );
}

export function CommercePage() {
  return (
    <ErrorBoundary>
      <CommerceContent />
    </ErrorBoundary>
  );
}