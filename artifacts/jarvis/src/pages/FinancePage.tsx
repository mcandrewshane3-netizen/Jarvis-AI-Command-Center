import { HolographicPanel, TechLabel, TechValue, Button } from '@/components/primitives';
import { Download, Plus } from 'lucide-react';

export function FinancePage() {
  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-muted-foreground">Finance</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Know your runway.</h1>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="primary" testId="button-export-finance" disabled><Download size={14} /> EXPORT DUMP</Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <HolographicPanel>
          <TechLabel>Net Worth (Est)</TechLabel>
          <div className="mt-4 font-mono text-sm text-muted-foreground uppercase tracking-widest">NOT CONNECTED</div>
        </HolographicPanel>
        <HolographicPanel>
          <TechLabel>Monthly Burn</TechLabel>
          <div className="mt-4 font-mono text-sm text-muted-foreground uppercase tracking-widest">NO DATA</div>
        </HolographicPanel>
        <HolographicPanel>
          <TechLabel>Cash Runway</TechLabel>
          <div className="mt-4 font-mono text-sm text-muted-foreground uppercase tracking-widest">NO DATA</div>
        </HolographicPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HolographicPanel title="TELEMETRY // NET WORTH" className="flex flex-col">
          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            <div className="font-mono text-sm text-muted-foreground uppercase tracking-widest border border-dashed border-primary/20 px-8 py-4">NO DATA AVAILABLE</div>
          </div>
        </HolographicPanel>

        <HolographicPanel title="CONNECTED ACCOUNTS">
          <div className="flex-1 flex items-center justify-center min-h-[140px] mb-6">
             <div className="font-mono text-sm text-muted-foreground uppercase tracking-widest">NOT CONFIGURED</div>
          </div>
          <Button variant="primary" testId="button-connect-finance" disabled className="w-full">
            <Plus size={16} /> ADD DATA SOURCE
          </Button>
        </HolographicPanel>
      </div>
    </div>
  );
}
