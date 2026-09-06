import { useState } from 'react';
import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { Code, Trash2 } from 'lucide-react';
import { useSpecialistRecords, useCreateSpecialistRecord, useDeleteSpecialistRecord } from '@/hooks/use-jarvis-api';

export function SoftwarePage() {
  const { data: records, isLoading } = useSpecialistRecords('software', 'SOFTWARE_PROJECT');
  const createRecord = useCreateSpecialistRecord('software');
  const deleteRecord = useDeleteSpecialistRecord('software');

  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [projectBoundary, setProjectBoundary] = useState('UNRELATED_PROJECT');
  const [requirements, setRequirements] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createRecord.mutate({
      recordType: 'SOFTWARE_PROJECT',
      title: name,
      data: {
        name,
        purpose,
        projectBoundary,
        status: 'PLANNING',
        requirements: requirements.split('\n').map(s => s.trim()).filter(Boolean),
      }
    }, {
      onSuccess: () => {
        setName('');
        setPurpose('');
        setProjectBoundary('UNRELATED_PROJECT');
        setRequirements('');
      }
    });
  };

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-cyan">Specialist // Software</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Engineering Core.</h1>
        </div>
        <StatusDot status="online" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        <HolographicPanel title="COMPILE NEW PROJECT">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block tech-label mb-2 text-primary/70">Project Name</label>
              <input 
                className="tech-input" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="JARVIS Subsystem"
                required
              />
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">Purpose</label>
              <input 
                className="tech-input" 
                value={purpose} 
                onChange={e => setPurpose(e.target.value)} 
                placeholder="Automate local deployments"
                required
              />
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">System Boundary</label>
              <select 
                className="tech-input w-full cursor-pointer bg-black/40"
                value={projectBoundary}
                onChange={e => setProjectBoundary(e.target.value)}
              >
                <option value="UNRELATED_PROJECT">UNRELATED PROJECT</option>
                <option value="CURRENT_JARVIS">CURRENT JARVIS (SELF-REFERENTIAL)</option>
              </select>
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">Requirements (One per line)</label>
              <textarea 
                className="tech-input h-24 py-2 resize-none" 
                value={requirements} 
                onChange={e => setRequirements(e.target.value)} 
                placeholder="- Must be responsive&#10;- Needs offline mode"
              />
            </div>
            <Button testId="btn-create-software" type="submit" disabled={createRecord.isPending} className="w-full">
              {createRecord.isPending ? 'SAVING...' : 'SAVE PROJECT PLAN'}
            </Button>
          </form>
        </HolographicPanel>

        <HolographicPanel title="SOFTWARE PROJECT PLANS" className="flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <span className="tech-label animate-pulse">LOADING...</span>
            </div>
          ) : !records || records.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-12 border border-dashed border-primary/20 bg-primary/5">
              <span className="tech-label text-muted-foreground">NO PROJECT PLANS SAVED</span>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map(record => (
                <div key={record.id} className={`border p-4 relative group ${record.data.projectBoundary === 'CURRENT_JARVIS' ? 'border-amber-500/40 bg-amber-500/5' : 'border-primary/20 bg-black/40'}`}>
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      testId={`btn-del-software-${record.id}`} 
                      variant="danger" 
                      onClick={() => deleteRecord.mutate({ id: record.id, type: 'SOFTWARE_PROJECT' })}
                      disabled={deleteRecord.isPending}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-3 mb-4">
                    <Code className={record.data.projectBoundary === 'CURRENT_JARVIS' ? 'text-amber-500' : 'text-primary'} size={20} />
                    <div>
                      <TechValue size="sm" className={record.data.projectBoundary === 'CURRENT_JARVIS' ? 'text-amber-500' : ''}>{record.data.name}</TechValue>
                      <div className="font-mono text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">
                        {record.data.projectBoundary}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <span className="tech-label block mb-1">Purpose</span>
                      <p className="text-sm text-muted-foreground">{record.data.purpose}</p>
                    </div>
                    <div>
                      <span className="tech-label block mb-1">Status</span>
                      <span className="font-mono text-[10px] bg-primary/10 text-primary px-2 py-1 border border-primary/20">{record.data.status}</span>
                    </div>
                  </div>

                  {record.data.requirements && record.data.requirements.length > 0 && (
                    <div className="pt-4 border-t border-primary/10">
                      <span className="tech-label block mb-2 text-primary/50">System Requirements</span>
                      <ul className="space-y-2">
                        {record.data.requirements.map((req: string, i: number) => (
                          <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                            <span className="text-primary/40 font-mono text-[10px] mt-1 shrink-0">[{i.toString().padStart(2, '0')}]</span>
                            <span>{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </HolographicPanel>
      </div>
    </div>
  );
}
