import { useEffect, useState } from 'react';
import { HolographicPanel, TechLabel, TechValue, Button } from '@/components/primitives';
import { Plus, SlidersHorizontal, MoreHorizontal, GitBranch, CalendarClock, Check } from 'lucide-react';

export function WorkPage() {
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; project: string; done: boolean }>>([]);
  const [newTask, setNewTask] = useState('');
  
  useEffect(() => {
    void fetch('/api/tasks').then((response) => response.ok ? response.json() : []).then((items) => {
      setTasks(items.map((item: { id: string; title: string; project: string; completed: boolean }) => ({
        id: item.id,
        title: item.title,
        project: item.project,
        done: item.completed,
      })));
    });
  }, []);

  const addTask = async () => {
    const title = newTask.trim();
    if (!title) return;
    const item = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, project: 'Inbox' }),
    }).then((response) => response.json());
    setTasks((current) => [{ id: item.id, title: item.title, project: item.project, done: item.completed }, ...current]);
    setNewTask('');
  };

  const toggleTask = async (task: { id: string; done: boolean }) => {
    const updated = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !task.done }),
    }).then((response) => response.json());
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: updated.completed } : item));
  };

  return (
    <div className="page-enter stagger-1 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <TechLabel>Work System // Active Threads: {tasks.filter(t => !t.done).length}</TechLabel>
          <h1 className="font-display text-4xl text-white mt-2 font-light tracking-tight">Make progress visible.</h1>
        </div>
        <div className="flex gap-3">
          <Button variant="primary" testId="button-filter-work" disabled><SlidersHorizontal size={14} /> FILTER</Button>
          <Button variant="solid" onClick={addTask} testId="button-add-task"><Plus size={14} /> ADD NODE</Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <HolographicPanel>
          <TechLabel>Open Tasks</TechLabel>
          <TechValue size="lg" className="mt-2">{tasks.filter((task) => !task.done).length}</TechValue>
        </HolographicPanel>
        <HolographicPanel>
          <TechLabel>Focus This Week</TechLabel>
          <div className="mt-4 font-mono text-sm text-muted-foreground uppercase">NO DATA</div>
        </HolographicPanel>
        <HolographicPanel>
          <TechLabel>Action Required</TechLabel>
          <div className="mt-4 font-mono text-sm text-muted-foreground uppercase">NO DATA</div>
        </HolographicPanel>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <HolographicPanel title="TASK QUEUE" className="h-full">
            <div className="flex gap-3 mb-6">
              <input 
                className="tech-input flex-1" 
                value={newTask} 
                onChange={(event) => setNewTask(event.target.value)} 
                placeholder="Append task to queue..." 
                aria-label="New task" 
                data-testid="input-new-task" 
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
              />
              <Button onClick={() => void addTask()} testId="button-save-task" variant="solid"><Plus size={16} /></Button>
            </div>
            
            {tasks.length === 0 && <div className="text-center py-12 text-muted-foreground font-mono text-sm uppercase">Queue empty</div>}
            
            <div className="space-y-2">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-4 p-3 border border-primary/10 bg-primary/5 hover:bg-primary/10 transition-colors group">
                  <button 
                    className={`tech-checkbox ${task.done ? 'checked' : ''}`} 
                    onClick={() => void toggleTask(task)} 
                    data-testid={`button-task-${task.id}`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${task.done ? 'text-primary/50 line-through' : 'text-foreground'}`}>{task.title}</div>
                    <div className="font-mono text-[10px] text-primary/60 mt-1 uppercase">{task.project}</div>
                  </div>
                  <button className="text-primary/40 hover:text-primary transition-colors p-2" aria-label={`Options`} data-testid={`button-task-more-${task.id}`}>
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              ))}
            </div>
          </HolographicPanel>
        </div>
        
        <div className="space-y-6">
          <HolographicPanel title="PROJECT MODULES">
            <div className="p-4 border border-primary/10 bg-black/20">
              <div className="flex items-center gap-3 mb-3">
                <GitBranch className="text-primary/50" size={16} />
                <div className="font-mono text-xs uppercase text-primary/50">Persistence Engine</div>
              </div>
              <div className="text-sm text-muted-foreground mb-4 font-mono uppercase tracking-wider">NOT CONFIGURED</div>
            </div>
          </HolographicPanel>
          
          <HolographicPanel title="CALENDAR SYNC">
            <div className="text-center py-6">
              <CalendarClock className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <TechValue size="sm" className="mb-2 text-muted-foreground">NOT CONNECTED</TechValue>
              <div className="text-xs text-muted-foreground mb-6">Authorization token required for GCal integration.</div>
              <Button variant="primary" testId="button-open-calendar" disabled className="w-full text-muted-foreground border-muted-foreground/30">
                INITIATE SYNC
              </Button>
            </div>
          </HolographicPanel>
        </div>
      </div>
    </div>
  );
}
