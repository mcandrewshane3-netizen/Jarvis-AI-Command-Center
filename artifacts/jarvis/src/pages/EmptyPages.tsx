import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { Microscope, Database, Workflow, AlertCircle } from 'lucide-react';
import { Link } from 'wouter';

export function ResearchPage() {
  return (
    <div className="page-enter stagger-1 h-[calc(100vh-140px)] flex flex-col">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <TechLabel className="text-muted-foreground">Module // Research</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight opacity-50">Deep Analysis.</h1>
        </div>
        <StatusDot status="offline" />
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-2xl w-full text-center">
          <div className="relative inline-flex items-center justify-center mb-8">
            <div className="absolute inset-0 bg-primary/20 blur-[50px] rounded-full" />
            <div className="w-32 h-32 border border-primary/30 rounded-full flex items-center justify-center relative overflow-hidden bg-black/50">
              <Microscope className="w-12 h-12 text-primary/50" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            </div>
          </div>
          
          <TechValue size="md" className="mb-4 text-primary/60">WORKSPACE UNAVAILABLE</TechValue>
          
          <div className="flex items-start gap-3 text-left bg-black/40 border border-primary/10 p-5 mx-auto mb-8 max-w-lg">
            <AlertCircle className="text-amber-500 shrink-0 mt-0.5 w-5 h-5" />
            <p className="text-sm text-muted-foreground font-mono leading-relaxed">
              Research module is offline in current system configuration. 
              <br /><br />
              Requires implementation of vector database indexing and advanced reasoning engine to process long-form documents. 
            </p>
          </div>
          
          <div className="flex gap-4 justify-center">
            <Link href="/" className="btn-tech">RETURN TO COMMAND</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmptyModulePage({ title, id }: { title: string, id: string }) {
  return (
    <div className="page-enter stagger-1 h-[calc(100vh-140px)] flex flex-col">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <TechLabel className="text-muted-foreground">Module // {id}</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight opacity-50">{title}.</h1>
        </div>
        <StatusDot status="offline" />
      </div>

      <div className="flex-1 flex items-center justify-center">
        <HolographicPanel className="max-w-lg w-full text-center py-16">
          <Workflow className="w-12 h-12 text-primary/30 mx-auto mb-6" />
          <TechValue size="sm" className="mb-2 text-primary/60">MODULE NOT CONFIGURED</TechValue>
          <p className="text-sm text-muted-foreground font-mono mb-8 px-8">
            This subsystem has not been initialized for the current session. Contact administrator to provision necessary resources.
          </p>
          <Link href="/" className="btn-tech">RETURN TO COMMAND</Link>
        </HolographicPanel>
      </div>
    </div>
  );
}
