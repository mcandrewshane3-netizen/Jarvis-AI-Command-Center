import { useState } from 'react';
import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { Microscope, Search, Trash2 } from 'lucide-react';
import { useSpecialistRecords, useCreateSpecialistRecord, useDeleteSpecialistRecord } from '@/hooks/use-jarvis-api';
import { Link } from 'wouter';

export function ResearchPage() {
  const { data: records, isLoading } = useSpecialistRecords('research', 'RESEARCH_RESULT');
  const createRecord = useCreateSpecialistRecord('research');
  const deleteRecord = useDeleteSpecialistRecord('research');

  const [topic, setTopic] = useState('');
  const [summary, setSummary] = useState('');
  const [keyFindings, setKeyFindings] = useState('');
  const [confidenceBand, setConfidenceBand] = useState('MODERATE');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createRecord.mutate({
      recordType: 'RESEARCH_RESULT',
      title: topic,
      data: {
        topic,
        summary,
        keyFindings: keyFindings.split('\n').map(s => s.trim()).filter(Boolean),
        evidence: [],
        conflictingEvidence: [],
        uncertainties: [],
        sources: [],
        dateChecked: new Date().toISOString(),
        confidenceBand,
      }
    }, {
      onSuccess: () => {
        setTopic('');
        setSummary('');
        setKeyFindings('');
        setConfidenceBand('MODERATE');
      }
    });
  };

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel className="text-muted-foreground">Specialist // Research</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Structured Analysis.</h1>
        </div>
        <StatusDot status="amber" />
      </div>

      <div className="mb-6 p-4 border border-primary/20 bg-primary/5 flex items-start gap-4">
        <Search className="text-primary mt-1 shrink-0" />
        <div>
          <h3 className="font-mono text-xs uppercase tracking-widest text-primary mb-1">Need provider analysis?</h3>
          <p className="text-sm text-muted-foreground mb-4">Direct questions to JARVIS Core for provider reasoning. Live web evidence is unavailable until an authorized research tool is connected; this ledger stores only your manual summaries.</p>
          <Link href="/jarvis" className="btn-tech text-[10px]">QUERY JARVIS CORE</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        <HolographicPanel title="COMMIT FINDINGS">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block tech-label mb-2 text-primary/70">Topic</label>
              <input 
                className="tech-input" 
                value={topic} 
                onChange={e => setTopic(e.target.value)} 
                placeholder="Market implications of X"
                required
              />
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">Summary</label>
              <textarea 
                className="tech-input h-20 py-2 resize-none" 
                value={summary} 
                onChange={e => setSummary(e.target.value)} 
                placeholder="Brief overview of conclusion"
                required
              />
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">Key Findings (One per line)</label>
              <textarea 
                className="tech-input h-24 py-2 resize-none" 
                value={keyFindings} 
                onChange={e => setKeyFindings(e.target.value)} 
                placeholder="- Finding 1&#10;- Finding 2"
                required
              />
            </div>
            <div>
              <label className="block tech-label mb-2 text-primary/70">Confidence Band</label>
              <select 
                className="tech-input w-full cursor-pointer bg-black/40"
                value={confidenceBand}
                onChange={e => setConfidenceBand(e.target.value)}
              >
                <option value="LOW">LOW CONFIDENCE</option>
                <option value="MODERATE">MODERATE CONFIDENCE</option>
                <option value="HIGH">HIGH CONFIDENCE</option>
              </select>
            </div>
            <Button testId="btn-create-research" type="submit" disabled={createRecord.isPending} className="w-full">
              {createRecord.isPending ? 'COMMITTING...' : 'COMMIT TO LEDGER'}
            </Button>
          </form>
        </HolographicPanel>

        <HolographicPanel title="MANUAL RESEARCH LEDGER" className="flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <span className="tech-label animate-pulse">LOADING...</span>
            </div>
          ) : !records || records.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-12 border border-dashed border-primary/20 bg-primary/5">
              <span className="tech-label text-muted-foreground">NO RECORDS COMMITTED</span>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map(record => (
                <div key={record.id} className="border border-primary/20 bg-black/40 p-4 relative group">
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      testId={`btn-del-research-${record.id}`} 
                      variant="danger" 
                      onClick={() => deleteRecord.mutate({ id: record.id, type: 'RESEARCH_RESULT' })}
                      disabled={deleteRecord.isPending}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between mb-4 pr-12">
                    <div className="flex items-center gap-3">
                      <Microscope className="text-primary/70" size={16} />
                      <TechValue size="sm">{record.data.topic}</TechValue>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <span className="font-mono text-[10px] text-primary/50 tracking-widest uppercase mb-1 block">Summary</span>
                    <p className="text-sm text-muted-foreground leading-relaxed">{record.data.summary}</p>
                  </div>

                  {record.data.keyFindings && record.data.keyFindings.length > 0 && (
                    <div className="mb-4">
                      <span className="font-mono text-[10px] text-primary/50 tracking-widest uppercase mb-1 block">Key Findings</span>
                      <ul className="space-y-1">
                        {record.data.keyFindings.map((finding: string, i: number) => (
                          <li key={i} className="flex gap-2 text-sm text-foreground">
                            <span className="text-primary/40 font-mono text-[10px] mt-1 shrink-0">-</span>
                            <span>{finding}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex gap-4 pt-4 border-t border-primary/10">
                    <div>
                      <span className="font-mono text-[10px] text-primary/40 tracking-widest uppercase mb-1 block">Confidence</span>
                      <span className={`font-mono text-[10px] px-2 py-0.5 border ${
                        record.data.confidenceBand === 'HIGH' ? 'text-primary border-primary/30 bg-primary/10' :
                        record.data.confidenceBand === 'LOW' ? 'text-red border-red-500/30 bg-red-500/10' :
                        'text-amber border-amber-500/30 bg-amber-500/10'
                      }`}>{record.data.confidenceBand}</span>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] text-primary/40 tracking-widest uppercase mb-1 block">Checked</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{new Date(record.data.dateChecked).toLocaleDateString()}</span>
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
