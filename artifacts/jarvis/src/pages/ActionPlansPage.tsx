import { useState } from 'react';
import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { Network, Trash2, ShieldAlert, CheckSquare } from 'lucide-react';
import { useSpecialistRecords, useCreateActionPlan, useAuthorizeActionPlanStep, useDeleteSpecialistRecord } from '@/hooks/use-jarvis-api';

function PlanStep({ planId, step, authorizeStep }: { planId: string, step: any, authorizeStep: any }) {
  const isAuthorized = step.status === 'AUTHORIZED' || step.userConfirmed;
  const needsAuth = step.requiresUser && !isAuthorized;

  return (
    <div className="border border-primary/10 bg-black/20 p-3 mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
      <div>
        <div className="text-sm text-foreground mb-1">{step.description}</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-primary/50">
            {step.specialist || 'GENERAL'}
          </span>
          <span className={`font-mono text-[9px] px-1.5 py-0.5 border uppercase tracking-widest ${
            step.impact === 'HIGH' ? 'text-red-500 border-red-500/30 bg-red-500/10' :
            step.impact === 'MEDIUM' ? 'text-amber-500 border-amber-500/30 bg-amber-500/10' :
            'text-primary border-primary/30 bg-primary/10'
          }`}>
            IMPACT: {step.impact}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 bg-black/40 border border-primary/20 text-muted-foreground">
            {step.status || 'PENDING'}
          </span>
        </div>
      </div>
      
      {needsAuth && (
        <Button 
          testId={`btn-auth-step-${step.id}`}
          onClick={() => authorizeStep.mutate({ planRecordId: planId, stepId: step.id, data: { status: 'AUTHORIZED', userConfirmed: true } })}
          disabled={authorizeStep.isPending}
          variant="primary"
          className="shrink-0 text-[10px]"
        >
          <CheckSquare size={12} className="mr-1" />
          AUTHORIZE
        </Button>
      )}
    </div>
  );
}

export function ActionPlansPage() {
  const { data: records, isLoading } = useSpecialistRecords('general', 'ACTION_PLAN');
  const createPlan = useCreateActionPlan();
  const deleteRecord = useDeleteSpecialistRecord('general');

  const authorizeStep = useAuthorizeActionPlanStep();

  const [goal, setGoal] = useState('');
  const [stepsText, setStepsText] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedSteps = stepsText.split('\n').map(s => s.trim()).filter(Boolean).map(desc => ({
      description: desc,
      impact: 'MEDIUM',
      requiresUser: true,
      requiresTool: true,
    }));

    if (!goal || parsedSteps.length === 0) return;

    createPlan.mutate({
      goal,
      steps: parsedSteps
    }, {
      onSuccess: () => {
        setGoal('');
        setStepsText('');
      }
    });
  };

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-muted-foreground">Command // Plans</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Action Plans.</h1>
        </div>
        <StatusDot status="online" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        <HolographicPanel title="NEW PLAN PARAMETERS">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block tech-label mb-2 text-primary/70">Objective / Goal</label>
              <input 
                className="tech-input" 
                value={goal} 
                onChange={e => setGoal(e.target.value)} 
                placeholder="Consolidate API endpoints"
                required
              />
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">Execution Steps (One per line)</label>
              <textarea 
                className="tech-input h-32 py-2 resize-none" 
                value={stepsText} 
                onChange={e => setStepsText(e.target.value)} 
                placeholder="Audit existing endpoints&#10;Draft consolidation schema&#10;Implement proxy"
                required
              />
            </div>
            <div className="pt-2 border-t border-primary/20">
              <div className="font-mono text-[10px] text-amber-500/80 mb-4 tracking-widest uppercase flex gap-2">
                <ShieldAlert size={14} className="shrink-0" />
                <span>Manual planning only. Background autonomy disabled. Tool execution unavailable in this surface.</span>
              </div>
              <Button testId="btn-create-plan" type="submit" disabled={createPlan.isPending} className="w-full">
                {createPlan.isPending ? 'PROCESSING...' : 'INITIALIZE PLAN'}
              </Button>
            </div>
          </form>
        </HolographicPanel>

        <HolographicPanel title="ACTIVE PLANS" className="flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <span className="tech-label animate-pulse">LOADING...</span>
            </div>
          ) : !records || records.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-12 border border-dashed border-primary/20 bg-primary/5">
              <span className="tech-label text-muted-foreground">NO ACTIVE PLANS</span>
            </div>
          ) : (
            <div className="space-y-6">
              {records.map(record => {
                const plan = record.data;

                return (
                  <div key={record.id} className="border border-primary/20 bg-black/40 p-4 relative group">
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <Button 
                        testId={`btn-del-plan-${record.id}`} 
                        variant="danger" 
                        onClick={() => deleteRecord.mutate({ id: record.id, type: 'ACTION_PLAN' })}
                        disabled={deleteRecord.isPending}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    
                    <div className="flex items-start gap-3 mb-4 pr-12">
                      <Network className="text-primary mt-1 shrink-0" size={20} />
                      <div>
                        <TechValue size="sm">{plan.goal}</TechValue>
                        <div className="flex gap-3 mt-2 flex-wrap">
                          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest px-2 py-1 bg-black/60 border border-primary/10">
                            STATUS: {plan.status || 'PENDING'}
                          </span>
                          <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 border ${
                            plan.risk === 'HIGH' ? 'text-red-500 border-red-500/30 bg-red-500/10' :
                            plan.risk === 'LOW' ? 'text-primary border-primary/30 bg-primary/10' :
                            'text-amber-500 border-amber-500/30 bg-amber-500/10'
                          }`}>
                            RISK: {plan.risk || 'UNKNOWN'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {plan.nextAction && (
                      <div className="mb-4 p-3 border border-primary/10 bg-primary/5">
                        <span className="tech-label block mb-1 text-primary/70">Next Action</span>
                        <p className="text-sm text-foreground">{plan.nextAction}</p>
                      </div>
                    )}

                    <div className="pt-2 border-t border-primary/10">
                      <span className="tech-label block mb-3 text-primary/50">Execution Steps</span>
                      {plan.steps && plan.steps.length > 0 ? (
                        <div className="space-y-1">
                          {plan.steps.map((step: any) => (
                            <PlanStep 
                              key={step.id} 
                              planId={record.id} 
                              step={step} 
                              authorizeStep={authorizeStep} 
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="font-mono text-xs text-muted-foreground uppercase">No steps generated</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </HolographicPanel>
      </div>
    </div>
  );
}
