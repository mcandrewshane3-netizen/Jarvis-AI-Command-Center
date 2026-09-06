import { useState } from 'react';
import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { BriefcaseBusiness, Plus, Trash2 } from 'lucide-react';
import { useSpecialistRecords, useCreateSpecialistRecord, useDeleteSpecialistRecord } from '@/hooks/use-jarvis-api';

export function CareerPage() {
  const { data: records, isLoading } = useSpecialistRecords('career', 'CAREER_PROFILE');
  const createRecord = useCreateSpecialistRecord('career');
  const deleteRecord = useDeleteSpecialistRecord('career');

  const [skills, setSkills] = useState('');
  const [preferredJobs, setPreferredJobs] = useState('');
  const [locations, setLocations] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createRecord.mutate({
      recordType: 'CAREER_PROFILE',
      title: 'Career Profile Update',
      data: {
        source: 'USER_PROVIDED',
        skills: skills.split(',').map(s => s.trim()).filter(Boolean),
        preferredJobs: preferredJobs.split(',').map(s => s.trim()).filter(Boolean),
        locations: locations.split(',').map(s => s.trim()).filter(Boolean),
        certifications: [],
        workHistory: [],
        industries: [],
        equipment: [],
        software: [],
        achievements: [],
        salaryTargets: [],
      }
    }, {
      onSuccess: () => {
        setSkills('');
        setPreferredJobs('');
        setLocations('');
      }
    });
  };

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-muted-foreground">Specialist // Career</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Professional Vector.</h1>
        </div>
        <StatusDot status="online" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        <HolographicPanel title="PROFILE INPUT">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block tech-label mb-2 text-primary/70">Skills (comma separated)</label>
              <input 
                className="tech-input" 
                value={skills} 
                onChange={e => setSkills(e.target.value)} 
                placeholder="React, TypeScript, Node.js"
                required
              />
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">Preferred Roles</label>
              <input 
                className="tech-input" 
                value={preferredJobs} 
                onChange={e => setPreferredJobs(e.target.value)} 
                placeholder="Senior Engineer, Tech Lead"
                required
              />
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">Target Locations</label>
              <input 
                className="tech-input" 
                value={locations} 
                onChange={e => setLocations(e.target.value)} 
                placeholder="Remote, NYC, London"
                required
              />
            </div>
            <Button testId="btn-create-career" type="submit" disabled={createRecord.isPending} className="w-full">
              {createRecord.isPending ? 'PROCESSING...' : 'COMMIT PROFILE'}
            </Button>
          </form>
        </HolographicPanel>

        <HolographicPanel title="ACTIVE PROFILES" className="flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <span className="tech-label animate-pulse">LOADING...</span>
            </div>
          ) : !records || records.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-12 border border-dashed border-primary/20 bg-primary/5">
              <span className="tech-label text-muted-foreground">NO PROFILES CONFIGURED</span>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map(record => (
                <div key={record.id} className="border border-primary/20 bg-black/40 p-4 relative group">
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      testId={`btn-del-career-${record.id}`} 
                      variant="danger" 
                      onClick={() => deleteRecord.mutate({ id: record.id, type: 'CAREER_PROFILE' })}
                      disabled={deleteRecord.isPending}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  <div className="font-mono text-xs text-primary/50 tracking-widest uppercase mb-1">
                    {new Date(record.createdAt).toLocaleDateString()} // {record.data.source}
                  </div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="tech-label block mb-1">Skills</span>
                      <div className="flex flex-wrap gap-2">
                        {record.data.skills?.map((s: string) => (
                          <span key={s} className="px-2 py-1 bg-primary/10 border border-primary/20 text-[10px] font-mono text-primary">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="tech-label block mb-1">Preferred Roles</span>
                      <div className="flex flex-wrap gap-2">
                        {record.data.preferredJobs?.map((s: string) => (
                          <span key={s} className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-500">{s}</span>
                        ))}
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
