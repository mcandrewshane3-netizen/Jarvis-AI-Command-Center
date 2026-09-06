import { HolographicPanel, TechLabel, TechValue, Button, StatusDot } from '@/components/primitives';
import { Microscope, Database, Workflow, AlertCircle } from 'lucide-react';
import { Link } from 'wouter';

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
