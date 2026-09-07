import { HolographicPanel, TechLabel, TechValue, StatusDot } from '@/components/primitives';
import { Workflow } from 'lucide-react';
import { Link } from 'wouter';

export function EmptyModulePage({ title, id }: { title: string, id: string }) {
  return (
    <div className="page-enter stagger-1 min-h-[calc(var(--app-viewport-height,100dvh)-140px)] flex flex-col">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <TechLabel className="text-muted-foreground">Module // {id}</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight opacity-60">{title}.</h1>
        </div>
        <StatusDot status="offline" />
      </div>

      <div className="flex-1 flex items-center justify-center">
        <HolographicPanel className="max-w-lg w-full text-center py-14">
          <Workflow className="w-12 h-12 text-primary/30 mx-auto mb-6" />
          <TechValue size="sm" className="mb-2 text-primary/60">MODULE NOT CONNECTED</TechValue>
          <p className="text-sm text-muted-foreground font-mono mb-8 px-8 leading-relaxed">
            This subsystem is intentionally inactive in the current prototype. No external action is being simulated and no connection is implied.
          </p>
          <div className="flex flex-wrap justify-center gap-3 px-6">
            <Link href="/jarvis" className="btn-tech solid">RETURN TO JARVIS</Link>
            <Link href="/system-map" className="btn-tech">VIEW SYSTEM MAP</Link>
          </div>
        </HolographicPanel>
      </div>
    </div>
  );
}
