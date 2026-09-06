import { useState } from 'react';
import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { BriefcaseBusiness, Trash2 } from 'lucide-react';
import { useSpecialistRecords, useCreateSpecialistRecord, useDeleteSpecialistRecord } from '@/hooks/use-jarvis-api';

export function BusinessPage() {
  const { data: records, isLoading } = useSpecialistRecords('business', 'BUSINESS_PROJECT');
  const createRecord = useCreateSpecialistRecord('business');
  const deleteRecord = useDeleteSpecialistRecord('business');

  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [assumptions, setAssumptions] = useState('');
  const [targetCustomers, setTargetCustomers] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createRecord.mutate({
      recordType: 'BUSINESS_PROJECT',
      title: name,
      data: {
        name,
        objective,
        assumptions: assumptions.split(',').map(s => s.trim()).filter(Boolean),
        targetCustomers: targetCustomers.split(',').map(s => s.trim()).filter(Boolean),
        status: 'PLANNED',
        nextActions: []
      }
    }, {
      onSuccess: () => {
        setName('');
        setObjective('');
        setAssumptions('');
        setTargetCustomers('');
      }
    });
  };

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-amber-500">Specialist // Business</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Venture Operations.</h1>
        </div>
        <StatusDot status="online" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        <HolographicPanel title="NEW VENTURE PROPOSAL">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block tech-label mb-2 text-primary/70">Project Name</label>
              <input 
                className="tech-input" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Project Apollo"
                required
              />
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">Primary Objective</label>
              <input 
                className="tech-input" 
                value={objective} 
                onChange={e => setObjective(e.target.value)} 
                placeholder="Establish market presence"
                required
              />
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">Key Assumptions (CSV)</label>
              <input 
                className="tech-input" 
                value={assumptions} 
                onChange={e => setAssumptions(e.target.value)} 
                placeholder="High demand, low acquisition cost"
              />
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">Target Customers (CSV)</label>
              <input 
                className="tech-input" 
                value={targetCustomers} 
                onChange={e => setTargetCustomers(e.target.value)} 
                placeholder="B2B SaaS, Mid-market"
              />
            </div>
            <div className="pt-2 border-t border-primary/20">
              <div className="font-mono text-[10px] text-amber-500/80 mb-4 tracking-widest uppercase">
                Note: Projects are tracked purely as internal state. External actions are disabled.
              </div>
              <Button testId="btn-create-business" type="submit" disabled={createRecord.isPending} className="w-full">
                {createRecord.isPending ? 'INITIALIZING...' : 'INITIALIZE PROJECT'}
              </Button>
            </div>
          </form>
        </HolographicPanel>

        <HolographicPanel title="BUSINESS PROJECTS" className="flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <span className="tech-label animate-pulse">LOADING...</span>
            </div>
          ) : !records || records.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-12 border border-dashed border-primary/20 bg-primary/5">
              <span className="tech-label text-muted-foreground">NO PROJECTS ACTIVE</span>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map(record => (
                <div key={record.id} className="border border-primary/20 bg-black/40 p-4 relative group">
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      testId={`btn-del-business-${record.id}`} 
                      variant="danger" 
                      onClick={() => deleteRecord.mutate({ id: record.id, type: 'BUSINESS_PROJECT' })}
                      disabled={deleteRecord.isPending}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  <div className="flex items-center gap-3 mb-4">
                    <StatusDot status={record.data.status === 'PLANNED' ? 'amber' : 'online'} />
                    <TechValue size="sm">{record.data.name}</TechValue>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <span className="tech-label block mb-1">Objective</span>
                      <p className="text-sm text-muted-foreground">{record.data.objective}</p>
                    </div>
                    <div>
                      <span className="tech-label block mb-1">Status</span>
                      <span className="font-mono text-[10px] bg-amber-500/10 text-amber-500 px-2 py-1 border border-amber-500/20">{record.data.status}</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-primary/10">
                    <div>
                      <span className="tech-label block mb-2 text-primary/50">Assumptions</span>
                      <div className="flex flex-wrap gap-2">
                        {record.data.assumptions?.length ? record.data.assumptions.map((a: string) => (
                          <span key={a} className="px-2 py-1 bg-primary/5 border border-primary/10 text-[10px] font-mono text-primary/70">{a}</span>
                        )) : <span className="text-xs text-muted-foreground font-mono">None logged</span>}
                      </div>
                    </div>
                    <div>
                      <span className="tech-label block mb-2 text-primary/50">Target Customers</span>
                      <div className="flex flex-wrap gap-2">
                        {record.data.targetCustomers?.length ? record.data.targetCustomers.map((c: string) => (
                          <span key={c} className="px-2 py-1 bg-primary/5 border border-primary/10 text-[10px] font-mono text-primary/70">{c}</span>
                        )) : <span className="text-xs text-muted-foreground font-mono">None logged</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </HolographicPanel>
      </div>
    </div>
  );
}
