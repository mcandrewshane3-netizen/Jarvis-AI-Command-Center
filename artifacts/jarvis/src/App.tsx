import { useState, type CSSProperties, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Command,
  CreditCard,
  Database,
  Download,
  FileText,
  GitBranch,
  Globe2,
  Home,
  KeyRound,
  Link2,
  LockKeyhole,
  Menu,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Unplug,
  UserRound,
  WalletCards,
  Zap,
} from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

const navGroups = [
  {
    label: 'Command',
    items: [
      { href: '/', label: 'Overview', icon: Home },
      { href: '/jarvis', label: 'JARVIS', icon: Bot },
    ],
  },
  {
    label: 'Life systems',
    items: [
      { href: '/work', label: 'Work', icon: BriefcaseBusiness },
      { href: '/finance', label: 'Finance', icon: CircleDollarSign },
      { href: '/markets', label: 'Markets', icon: TrendingUp },
      { href: '/personal', label: 'Personal', icon: CalendarClock },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { href: '/automations', label: 'Automations', icon: Zap },
      { href: '/integrations', label: 'Integrations', icon: Link2 },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function Button({
  children,
  variant = 'primary',
  onClick,
  testId,
  type = 'button',
  style,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet';
  onClick?: () => void;
  testId: string;
  type?: 'button' | 'submit';
  style?: CSSProperties;
}) {
  return (
    <button className={`button-${variant}`} data-testid={testId} onClick={onClick} type={type} style={style}>
      {children}
    </button>
  );
}

function Panel({ children, className = '', testId }: { children: ReactNode; className?: string; testId?: string }) {
  return <section className={`panel ${className}`} data-testid={testId}>{children}</section>;
}

function StatusPill({ children, tone = 'good' }: { children: ReactNode; tone?: 'good' | 'amber' | 'neutral' }) {
  return (
    <span className={`status-pill ${tone === 'amber' ? 'demo-pill' : ''}`} data-testid="status-pill">
      <span className={tone === 'good' ? 'live-dot' : 'demo-dot'} /> {children}
    </span>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={onClick} aria-label={label} data-testid={`toggle-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <span />
    </button>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [refreshed, setRefreshed] = useState(false);
  const pageTitle = navGroups.flatMap((group) => group.items).find((item) => item.href === location)?.label ?? 'Overview';
  return (
    <div className="app-shell">
      <aside className="side-rail" data-testid="navigation-rail">
        <div className="side-head">
          <Link href="/" className="brand" data-testid="link-brand">
            <span className="brand-mark"><Command size={18} /></span>
            <span><span className="brand-word">JARVIS</span><span className="brand-sub">personal command center</span></span>
          </Link>
          <button className="icon-button mobile-menu" aria-label="Open navigation" data-testid="button-open-navigation"><Menu /></button>
        </div>
        <nav className="nav-list" aria-label="Primary navigation">
          {navGroups.map((group) => (
            <div className="nav-block" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = location === item.href;
                return (
                  <Link className={`nav-link ${active ? 'active' : ''}`} href={item.href} key={item.href} data-testid={`link-nav-${item.label.toLowerCase()}`}>
                    <Icon /><span>{item.label}</span>{item.href === '/jarvis' && <span className="nav-live-dot" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="rail-foot">
          <Link className="user-chip" href="/settings" data-testid="link-user-settings">
            <span className="avatar">SH</span>
            <span><span className="user-name">Shane</span><span className="user-role">Owner · Demo workspace</span></span>
            <ChevronRight size={15} style={{ marginLeft: 'auto', opacity: .5 }} />
          </Link>
        </div>
      </aside>
      <main className="main-stage">
        <header className="topbar">
          <div>
            <div className="topbar-kicker">Tuesday · October 15, 2024</div>
            <div className="topbar-title">{pageTitle}</div>
          </div>
          <div className="topbar-actions">
            <span className="demo-pill"><span className="demo-dot" /> Demo mode</span>
            <button className="icon-button" aria-label="Refresh demo data" onClick={() => setRefreshed(true)} data-testid="button-refresh-data">
              <RefreshCw className={refreshed ? 'spin-slow' : ''} />
            </button>
            <button className="icon-button" aria-label="Notifications" data-testid="button-notifications"><Bell /></button>
          </div>
        </header>
        <div className="content page-enter" key={location}>
          {children}
        </div>
      </main>
    </div>
  );
}

function SectionHeading({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}

const priorities = [
  { id: 'p1', title: 'Review the Q4 product brief', meta: 'Work · due today', tag: '09:30' },
  { id: 'p2', title: 'Send revised launch timeline', meta: 'Work · waiting on you', tag: '11:00' },
  { id: 'p3', title: 'Move $1,200 to high-yield savings', meta: 'Finance · suggested', tag: 'Today' },
];

function Home() {
  const [done, setDone] = useState<string[]>(['p1']);
  const completed = (id: string) => done.includes(id);
  return (
    <>
      <div className="home-hero">
        <div className="hero-copy">
          <div className="eyebrow">Tuesday, October 15 · 08:42</div>
          <h1 className="display-title" style={{ margin: '13px 0 13px' }}>Good morning, <em>Shane.</em></h1>
          <p className="lede">Your day is clear enough to make a dent. JARVIS has condensed the moving parts into one quiet place.</p>
          <div className="hero-actions">
            <Link className="button-primary" href="/jarvis" data-testid="link-open-jarvis"><Sparkles /> Ask JARVIS</Link>
            <Button variant="secondary" testId="button-open-briefing"><FileText /> Open briefing</Button>
          </div>
        </div>
        <div className="signal-card" data-testid="card-system-pulse">
          <div className="mini-label">System pulse</div>
          <div className="signal-value">4 / 4</div>
          <div className="signal-caption">core systems accounted for</div>
          <div style={{ marginTop: 23 }}><StatusPill tone="good">Local workspace ready</StatusPill></div>
        </div>
      </div>

      <div className="briefing-strip" data-testid="card-daily-briefing">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="briefing-icon"><Bot /></div>
          <div><div className="briefing-title">Your 90-second briefing is ready</div><div className="briefing-copy">One focus block, two financial moves, and a calmer market open than yesterday.</div></div>
        </div>
        <Button variant="secondary" testId="button-play-briefing"><Play /> Play</Button>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-stack">
          <Panel className="panel-pad" testId="panel-todays-priorities">
            <SectionHeading title="Today's priorities" detail={`${priorities.filter((item) => !completed(item.id)).length} remaining`} action={<Button variant="quiet" testId="button-priorities-more"><MoreHorizontal /></Button>} />
            {priorities.map((item) => (
              <div className="priority-row" key={item.id}>
                <button className={`check-button ${completed(item.id) ? 'checked' : ''}`} onClick={() => setDone((current) => completed(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} aria-label={`Mark ${item.title}`} data-testid={`button-priority-${item.id}`}><Check /></button>
                <div><div className={`row-title ${completed(item.id) ? 'muted' : ''}`} style={completed(item.id) ? { textDecoration: 'line-through' } : undefined}>{item.title}</div><div className="row-meta">{item.meta}</div></div>
                <div className="row-end mono muted" style={{ fontSize: 10 }}>{item.tag}</div>
              </div>
            ))}
          </Panel>
          <Panel className="panel-pad" testId="panel-work-preview">
            <SectionHeading title="Work" detail="Tuesday · 3 active threads" action={<Link className="button-quiet" href="/work" data-testid="link-view-work">View work <ArrowUpRight /></Link>} />
            <div className="list-row"><span className="status-dot" /><div><div className="row-title">Northstar launch</div><div className="row-meta">Product brief · 72% on track</div></div><div className="row-end"><span className="metric-change green"><TrendingUp /> 72%</span></div></div>
            <div className="list-row"><span className="status-dot amber" /><div><div className="row-title">Weekly writing cadence</div><div className="row-meta">2 of 4 sessions complete</div></div><div className="row-end mono muted" style={{ fontSize: 10 }}>Thu</div></div>
            <div className="list-row"><span className="status-dot red" /><div><div className="row-title">Vendor security review</div><div className="row-meta">Blocked · needs a reply</div></div><div className="row-end"><span className="metric-change red"><Clock3 /> 2d</span></div></div>
          </Panel>
        </div>
        <div className="dashboard-stack">
          <Panel className="panel-pad" testId="panel-finance-preview">
            <SectionHeading title="Finance" detail="Demo data" action={<Link className="button-quiet" href="/finance" data-testid="link-view-finance">Details <ArrowUpRight /></Link>} />
            <div className="value-xl">$84,260</div>
            <div className="row-meta" style={{ marginTop: 5 }}>estimated net worth</div>
            <div className="metric-change green" style={{ marginTop: 17 }}><TrendingUp /> +$1,842 this month</div>
            <div className="micro-grid" style={{ marginTop: 20 }}>
              <div className="micro-metric" style={{ padding: '12px 0 0' }}><div className="mini-label">Cash</div><div className="value-lg">$12,480</div></div>
              <div className="micro-metric" style={{ padding: '12px 0 0' }}><div className="mini-label">Runway</div><div className="value-lg">7.4 mo</div></div>
            </div>
          </Panel>
          <Panel className="panel-pad" testId="panel-markets-preview">
            <SectionHeading title="Markets" detail="Paper trading" action={<Link className="button-quiet" href="/markets" data-testid="link-view-markets">Watchlist <ArrowUpRight /></Link>} />
            <div className="list-row"><div><div className="row-title">SPY</div><div className="row-meta">S&P 500 ETF</div></div><div className="row-end"><div className="row-title">$582.11</div><div className="metric-change green">+0.41%</div></div></div>
            <div className="list-row"><div><div className="row-title">NVDA</div><div className="row-meta">NVIDIA Corporation</div></div><div className="row-end"><div className="row-title">$138.07</div><div className="metric-change red">−0.82%</div></div></div>
          </Panel>
        </div>
      </div>
      <div className="three-col" style={{ marginTop: 22 }}>
        <Panel className="micro-metric" testId="card-calendar"><div className="mini-label">Next up</div><div className="value-lg">10:30</div><div className="row-meta">Design review · 45 min</div></Panel>
        <Panel className="micro-metric" testId="card-connections"><div className="mini-label">Connections</div><div className="value-lg">6 / 7</div><div className="row-meta"><span className="green">Healthy</span> · one setup required</div></Panel>
        <Panel className="micro-metric" testId="card-focus"><div className="mini-label">Focus time</div><div className="value-lg">2h 10m</div><div className="row-meta">planned today · +25m vs avg</div></Panel>
      </div>
    </>
  );
}

function JarvisPage() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    { author: 'JARVIS', text: 'Good morning, Shane. I have the day in view. Your highest-leverage move is the Q4 product brief before the 10:30 design review.' },
    { author: 'SHANE', text: 'What should I protect time for today?' },
    { author: 'JARVIS', text: 'Protect 90 minutes after lunch for deep work. The market is quiet, your inbox is contained, and the launch thread only needs a 15-minute reply.' },
  ]);
  const send = (value = message) => {
    if (!value.trim()) return;
    setMessages((current) => [...current, { author: 'SHANE', text: value.trim() }, { author: 'JARVIS', text: 'Noted. This is a demo response while your private model connection is being configured.' }]);
    setMessage('');
  };
  return (
    <div className="two-col">
      <div>
        <div className="page-header"><div><div className="eyebrow">Private assistant · demo mode</div><h1 className="display-title" style={{ margin: '11px 0 10px' }}>Talk it through.</h1><p className="lede">A focused surface for decisions, not a noisy chat feed.</p></div><StatusPill tone="amber">Demo responses</StatusPill></div>
        <Panel className="panel-pad" testId="panel-conversation">
          <div className="chat-thread">
            {messages.map((item, index) => <div className={`chat-bubble ${item.author === 'SHANE' ? 'shane' : 'jarvis'}`} key={`${item.author}-${index}`} data-testid={`message-${index}`}><div className="chat-author">{item.author}</div>{item.text}</div>)}
          </div>
          <div className="divider" style={{ margin: '22px 0 15px' }} />
          <div className="chips" style={{ marginBottom: 13 }}>
            {['Summarize my day', 'Find my next focus block', 'Review spending'].map((chip) => <button className="prompt-chip" key={chip} onClick={() => send(chip)} data-testid={`button-prompt-${chip.toLowerCase().replaceAll(' ', '-')}`}>{chip}</button>)}
          </div>
          <form className="form-row" onSubmit={(event) => { event.preventDefault(); send(); }}>
            <input className="text-input" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask JARVIS anything about your cockpit" aria-label="Message JARVIS" data-testid="input-jarvis-message" />
            <Button type="submit" testId="button-send-message"><Send /></Button>
          </form>
        </Panel>
      </div>
      <div className="dashboard-stack">
        <Panel className="panel-pad" testId="panel-assistant-context"><SectionHeading title="Context window" detail="What JARVIS can see" /><div className="list-row"><Database size={16} className="teal" /><div><div className="row-title">Local demo workspace</div><div className="row-meta">Tasks, routines, preferences</div></div><StatusPill>Ready</StatusPill></div><div className="list-row"><CreditCard size={16} className="teal" /><div><div className="row-title">Finance snapshot</div><div className="row-meta">Demo data only</div></div><StatusPill tone="amber">Demo</StatusPill></div><div className="list-row"><Globe2 size={16} className="teal" /><div><div className="row-title">Live web context</div><div className="row-meta">Not connected in Phase 1</div></div><StatusPill tone="amber">Off</StatusPill></div></Panel>
        <Panel className="panel-pad" testId="panel-assistant-note"><Sparkles className="gold" size={18} /><div className="row-title" style={{ marginTop: 12 }}>A useful boundary</div><p className="row-meta" style={{ lineHeight: 1.6 }}>JARVIS will show its source and confidence before making recommendations. It will never place a trade or move money in this demo.</p></Panel>
      </div>
    </div>
  );
}

function WorkPage() {
  const [tasks, setTasks] = useState([
    { id: 1, title: 'Review the Q4 product brief', project: 'Northstar launch', done: true },
    { id: 2, title: 'Send revised launch timeline', project: 'Northstar launch', done: false },
    { id: 3, title: 'Reply to vendor security review', project: 'Operations', done: false },
    { id: 4, title: 'Draft Thursday newsletter', project: 'Writing cadence', done: false },
  ]);
  const [newTask, setNewTask] = useState('');
  const addTask = () => { if (newTask.trim()) { setTasks((current) => [...current, { id: Date.now(), title: newTask.trim(), project: 'Inbox', done: false }]); setNewTask(''); } };
  return (
    <>
      <div className="page-header"><div><div className="eyebrow">Work system · 3 active projects</div><h1 className="display-title" style={{ margin: '11px 0 10px' }}>Make progress visible.</h1><p className="lede">A small, honest view of the work that deserves your attention today.</p></div><div className="page-header-actions"><Button variant="secondary" testId="button-filter-work"><SlidersHorizontal /> Filter</Button><Button onClick={addTask} testId="button-add-task"><Plus /> Add task</Button></div></div>
      <div className="three-col" style={{ marginBottom: 22 }}><Panel className="metric-card"><span className="mini-label">Open tasks</span><div className="value-lg">{tasks.filter((task) => !task.done).length}</div><div className="metric-foot"><span className="row-meta">across 3 projects</span><span className="metric-change green">−2 this week</span></div></Panel><Panel className="metric-card"><span className="mini-label">Focus this week</span><div className="value-lg">6h 35m</div><div className="metric-foot"><span className="row-meta">of 8h planned</span><span className="metric-change green">82%</span></div></Panel><Panel className="metric-card"><span className="mini-label">Needs a reply</span><div className="value-lg">01</div><div className="metric-foot"><span className="row-meta">vendor security</span><span className="metric-change red">2 days</span></div></Panel></div>
      <div className="two-col"><Panel className="panel-pad"><SectionHeading title="Tasks" detail="Local demo list" /><div className="form-row" style={{ marginBottom: 15 }}><input className="text-input" value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="Add a task to your inbox" aria-label="New task" data-testid="input-new-task" /><Button onClick={addTask} testId="button-save-task"><Plus /></Button></div>{tasks.map((task) => <div className="list-row" key={task.id}><button className={`check-button ${task.done ? 'checked' : ''}`} onClick={() => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))} data-testid={`button-task-${task.id}`}><Check /></button><div><div className="row-title" style={task.done ? { textDecoration: 'line-through', color: 'hsl(var(--muted-foreground))' } : undefined}>{task.title}</div><div className="row-meta">{task.project}</div></div><button className="button-quiet row-end" aria-label={`More options for ${task.title}`} data-testid={`button-task-more-${task.id}`}><MoreHorizontal /></button></div>)}</Panel><div className="dashboard-stack"><Panel className="panel-pad"><SectionHeading title="Projects" action={<Button variant="quiet" testId="button-view-projects">All <ChevronRight /></Button>} /><div className="list-row"><span className="row-icon"><GitBranch /></span><div style={{ flex: 1 }}><div className="row-title">Northstar launch</div><div className="row-meta">8 tasks · target Oct 28</div><div className="progress-track" style={{ marginTop: 9 }}><div className="progress-fill" style={{ width: '72%' }} /></div></div><span className="mono muted" style={{ fontSize: 10 }}>72%</span></div><div className="list-row"><span className="row-icon"><FileText /></span><div style={{ flex: 1 }}><div className="row-title">Writing cadence</div><div className="row-meta">2 sessions · target weekly</div><div className="progress-track" style={{ marginTop: 9 }}><div className="progress-fill" style={{ width: '50%' }} /></div></div><span className="mono muted" style={{ fontSize: 10 }}>50%</span></div></Panel><Panel className="panel-pad"><div className="mini-label">Next calendar block</div><div className="value-lg" style={{ marginTop: 9 }}>Design review</div><div className="row-meta" style={{ marginTop: 4 }}>10:30–11:15 · Studio room</div><Button variant="secondary" testId="button-open-calendar" style={{ marginTop: 17 } as never}><CalendarClock /> Open calendar</Button></Panel></div></div>
    </>
  );
}

function FinancePage() {
  const [range, setRange] = useState('6M');
  return (
    <>
      <div className="page-header"><div><div className="eyebrow">Finance · demo data</div><h1 className="display-title" style={{ margin: '11px 0 10px' }}>Know your runway.</h1><p className="lede">A calm summary of your money. Figures below are illustrative and never connected to a bank.</p></div><div className="page-header-actions"><StatusPill tone="amber">Demo data</StatusPill><Button variant="secondary" testId="button-export-finance"><Download /> Export</Button></div></div>
      <div className="three-col" style={{ marginBottom: 22 }}><Panel className="metric-card"><span className="mini-label">Estimated net worth</span><div className="value-lg">$84,260</div><div className="metric-foot"><span className="row-meta">across 4 accounts</span><span className="metric-change green"><TrendingUp /> +2.2%</span></div></Panel><Panel className="metric-card"><span className="mini-label">Monthly spend</span><div className="value-lg">$4,812</div><div className="metric-foot"><span className="row-meta">October to date</span><span className="metric-change green">−8.4%</span></div></Panel><Panel className="metric-card"><span className="mini-label">Cash runway</span><div className="value-lg">7.4 mo</div><div className="metric-foot"><span className="row-meta">at current burn</span><span className="metric-change gold">Watch</span></div></Panel></div>
      <div className="two-col"><Panel className="panel-pad"><SectionHeading title="Net worth trend" detail="Illustrative history" action={<div className="chips">{['1M', '6M', '1Y'].map((item) => <button className={`prompt-chip ${range === item ? 'active-chip' : ''}`} key={item} onClick={() => setRange(item)} data-testid={`button-range-${item}`}>{item}</button>)}</div>} /><div className="value-xl">$84,260 <span className="metric-change green" style={{ fontSize: 12 }}><TrendingUp /> +$1,842</span></div><div className="bars">{[42, 48, 45, 57, 53, 64, 62, 76, 71, 84, 81, 94].map((height, index) => <div className={`bar ${index === 11 ? 'highlight' : ''}`} style={{ height: `${height}%` }} key={index} />)}</div><div className="divider" style={{ marginTop: 14 }} /><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 11 }}><span className="row-meta">May 15</span><span className="row-meta">Oct 15</span></div></Panel><Panel className="panel-pad"><SectionHeading title="Accounts" detail="Setup required" /><div className="list-row"><span className="row-icon"><WalletCards /></span><div><div className="row-title">High-yield savings</div><div className="row-meta">Manual balance</div></div><div className="row-end mono">$12,480</div></div><div className="list-row"><span className="row-icon"><CreditCard /></span><div><div className="row-title">Daily checking</div><div className="row-meta">Manual balance</div></div><div className="row-end mono">$3,260</div></div><div className="list-row"><span className="row-icon"><CircleDollarSign /></span><div><div className="row-title">Brokerage</div><div className="row-meta">Paper portfolio</div></div><div className="row-end mono">$68,520</div></div><Button variant="secondary" testId="button-connect-finance" style={{ marginTop: 16 } as never}><Plus /> Add account</Button></Panel></div>
    </>
  );
}

function MarketsPage() {
  const [paused, setPaused] = useState(false);
  const watchlist = [
    ['SPY', 'S&P 500 ETF', '$582.11', '+0.41%', false],
    ['QQQ', 'Nasdaq 100 ETF', '$495.03', '+0.68%', false],
    ['NVDA', 'NVIDIA Corporation', '$138.07', '−0.82%', true],
    ['BTC-USD', 'Bitcoin / USD', '$67,842', '+1.24%', false],
  ];
  return (
    <>
      <div className="page-header"><div><div className="eyebrow">Markets · paper trading only</div><h1 className="display-title" style={{ margin: '11px 0 10px' }}>Observe, then decide.</h1><p className="lede">Prices are illustrative snapshots. There is no Robinhood connection, live feed, or trade execution in Phase 1.</p></div><div className="page-header-actions"><StatusPill tone="amber">Paper trading</StatusPill><Button variant="secondary" onClick={() => setPaused(!paused)} testId="button-pause-market-feed">{paused ? <Play /> : <Pause />}{paused ? 'Resume' : 'Pause'} feed</Button></div></div>
      <div className="safety-banner" style={{ marginBottom: 22 }}><ShieldCheck /><div><div className="safety-title">Trading safety is on</div><div className="safety-copy">JARVIS can explain a setup, but cannot place an order. Confirm every decision outside this workspace.</div></div><span className="mono muted" style={{ marginLeft: 'auto', fontSize: 10 }}>GUARDRAIL 01</span></div>
      <div className="two-col"><Panel className="panel-pad"><SectionHeading title="Watchlist" detail={paused ? 'Feed paused · demo snapshot' : 'Demo snapshot · 09:32 ET'} action={<Button variant="quiet" testId="button-add-symbol"><Plus /> Add symbol</Button>} /><div className="table-scroll"><table className="data-table"><thead><tr><th>Instrument</th><th>Price</th><th>Day</th><th>Trend</th></tr></thead><tbody>{watchlist.map(([symbol, name, price, change, down]) => <tr key={symbol}><td><div className="table-name">{symbol}</div><div className="table-sub">{name}</div></td><td className="mono">{price}</td><td className={down ? 'red mono' : 'green mono'}>{change}</td><td><div className="sparkline">{[12, 18, 13, 22, 18, 25, 20].map((height, index) => <i className={down ? 'down' : ''} style={{ height }} key={index} />)}</div></td></tr>)}</tbody></table></div></Panel><div className="dashboard-stack"><Panel className="panel-pad"><SectionHeading title="Market posture" detail="JARVIS readout" /><div className="value-xl">Measured</div><p className="row-meta" style={{ lineHeight: 1.55, marginTop: 8 }}>Breadth is constructive, but no single signal earns a trade today.</p><div className="divider" style={{ margin: '16px 0' }} /><div className="list-row"><span className="status-dot" /><div><div className="row-title">Volatility</div><div className="row-meta">Contained</div></div><span className="mono muted" style={{ fontSize: 10 }}>VIX 18.4</span></div><div className="list-row"><span className="status-dot amber" /><div><div className="row-title">Next review</div><div className="row-meta">After market close</div></div><span className="mono muted" style={{ fontSize: 10 }}>16:10</span></div></Panel><Panel className="panel-pad"><div className="mini-label">Paper portfolio</div><div className="value-lg" style={{ marginTop: 8 }}>$68,520</div><div className="metric-change green" style={{ marginTop: 6 }}><TrendingUp /> +$412 today</div><Button variant="secondary" testId="button-review-paper-portfolio" style={{ marginTop: 17 } as never}><ArrowUpRight /> Review portfolio</Button></Panel></div></div>
    </>
  );
}

function PersonalPage() {
  const [routines, setRoutines] = useState(['Morning walk', 'Read for 20 minutes']);
  const reminders = [{ title: 'Book dentist appointment', when: 'Tomorrow · Personal' }, { title: 'Call Mum', when: 'Friday · Personal' }, { title: 'Renew passport', when: 'Oct 30 · Admin' }];
  return (
    <>
      <div className="page-header"><div><div className="eyebrow">Personal · routines and reminders</div><h1 className="display-title" style={{ margin: '11px 0 10px' }}>Keep life human.</h1><p className="lede">Lightweight prompts for the parts of your day that do not belong in a project plan.</p></div><Button testId="button-add-reminder"><Plus /> Add reminder</Button></div>
      <div className="two-col"><Panel className="panel-pad"><SectionHeading title="Today's rhythm" detail="2 of 4 complete" /><div className="progress-track" style={{ marginBottom: 18 }}><div className="progress-fill" style={{ width: '50%' }} /></div>{['Morning walk', 'Read for 20 minutes', 'No screens after 22:30', 'Prep tomorrow'].map((item, index) => { const checked = routines.includes(item); return <div className="list-row" key={item}><button className={`check-button ${checked ? 'checked' : ''}`} onClick={() => setRoutines((current) => checked ? current.filter((routine) => routine !== item) : [...current, item])} data-testid={`button-routine-${index}`}><Check /></button><div><div className="row-title">{item}</div><div className="row-meta">{index < 2 ? 'Routine · today' : 'Routine · suggested'}</div></div><span className="row-end mono muted" style={{ fontSize: 10 }}>{index < 2 ? 'done' : 'later'}</span></div>; })}</Panel><Panel className="panel-pad"><SectionHeading title="Reminders" detail="Next 7 days" /><div>{reminders.map((reminder, index) => <div className="list-row" key={reminder.title}><span className="row-icon"><Bell /></span><div><div className="row-title">{reminder.title}</div><div className="row-meta">{reminder.when}</div></div><button className="button-quiet row-end" aria-label={`Snooze ${reminder.title}`} data-testid={`button-snooze-reminder-${index}`}><Clock3 /></button></div>)}</div><Button variant="secondary" testId="button-manage-reminders" style={{ marginTop: 17 } as never}><Settings /> Manage reminders</Button></Panel></div>
    </>
  );
}

function AutomationsPage() {
  const [rules, setRules] = useState([{ title: 'Morning briefing', copy: 'Weekdays at 08:00 · JARVIS summary', icon: Bot, on: true }, { title: 'Low balance nudge', copy: 'When cash runway dips below 6 months', icon: CircleDollarSign, on: true }, { title: 'Friday reset', copy: 'Fridays at 16:00 · prepare next week', icon: RotateCcwFallback, on: false }, { title: 'Market close note', copy: 'Weekdays at 16:15 · paper portfolio', icon: TrendingUp, on: false }]);
  return (
    <>
      <div className="page-header"><div><div className="eyebrow">Automations · local rules</div><h1 className="display-title" style={{ margin: '11px 0 10px' }}>Let the small things run.</h1><p className="lede">Simple rules for recurring care. Every automation is visible, pausable, and local to this demo workspace.</p></div><Button testId="button-create-automation"><Plus /> New automation</Button></div>
      <div className="two-col"><Panel className="panel-pad"><SectionHeading title="Your rules" detail={`${rules.filter((rule) => rule.on).length} active`} />{rules.map((rule, index) => { const Icon = rule.icon; return <div className="rule-row" key={rule.title}><span className="row-icon"><Icon /></span><div className="switch-copy"><strong>{rule.title}</strong><span>{rule.copy}</span></div><Toggle on={rule.on} onClick={() => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, on: !item.on } : item))} label={`Toggle ${rule.title}`} /></div>; })}</Panel><div className="dashboard-stack"><Panel className="panel-pad"><div className="mini-label">Automation health</div><div className="value-xl" style={{ marginTop: 9 }}>100%</div><p className="row-meta" style={{ lineHeight: 1.6, marginTop: 7 }}>All active rules ran successfully in the last demo cycle.</p><div className="divider" style={{ margin: '16px 0' }} /><div className="list-row"><span className="status-dot" /><div><div className="row-title">Last run</div><div className="row-meta">Morning briefing</div></div><span className="mono muted" style={{ fontSize: 10 }}>08:00</span></div></Panel><Panel className="panel-pad"><Zap className="gold" size={18} /><div className="row-title" style={{ marginTop: 12 }}>Build slowly</div><p className="row-meta" style={{ lineHeight: 1.6 }}>Start with rules you can explain in one sentence. More control is better than more automation.</p></Panel></div></div>
    </>
  );
}

function RotateCcwFallback(props: { size?: number }) {
  return <RefreshCw {...props} />;
}

function IntegrationsPage() {
  const [connected, setConnected] = useState(['Apple Calendar', 'Notion']);
  const services = [{ name: 'Apple Calendar', category: 'Schedule', icon: CalendarClock }, { name: 'Notion', category: 'Knowledge', icon: FileText }, { name: 'Robinhood', category: 'Markets', icon: TrendingUp }, { name: 'Gmail', category: 'Communication', icon: MessageSquare }, { name: 'iCloud Reminders', category: 'Personal', icon: Bell }];
  return (
    <>
      <div className="page-header"><div><div className="eyebrow">Integrations · connection health</div><h1 className="display-title" style={{ margin: '11px 0 10px' }}>Choose what gets in.</h1><p className="lede">JARVIS is more useful when it knows enough, not everything. You stay in control of every connection.</p></div><Button variant="secondary" testId="button-scan-integrations"><RefreshCw /> Check status</Button></div>
      <div className="safety-banner" style={{ marginBottom: 22 }}><LockKeyhole /><div><div className="safety-title">Private by default</div><div className="safety-copy">Connections are simulated in this Phase 1 workspace. No credentials are stored or transmitted.</div></div></div>
      <Panel className="panel-pad"><SectionHeading title="Service connections" detail={`${connected.length} connected · ${services.length - connected.length} setup required`} />{services.map((service) => { const Icon = service.icon; const isConnected = connected.includes(service.name); return <div className="connection-row" key={service.name}><span className="row-icon"><Icon /></span><div className="switch-copy"><strong>{service.name}</strong><span>{service.category} · {isConnected ? 'Ready for demo context' : service.name === 'Robinhood' ? 'Paper trading only' : 'Not connected'}</span></div><div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>{isConnected ? <StatusPill>Connected</StatusPill> : <StatusPill tone="amber">{service.name === 'Robinhood' ? 'Paper only' : 'Setup required'}</StatusPill>}<Button variant="secondary" onClick={() => setConnected((current) => isConnected ? current.filter((item) => item !== service.name) : [...current, service.name])} testId={`button-connection-${service.name.toLowerCase().replaceAll(' ', '-')}`}>{isConnected ? <Unplug /> : <Link2 />}{isConnected ? 'Disconnect' : 'Connect'}</Button></div></div>; })}</Panel>
    </>
  );
}

function SettingsPage() {
  const [dark, setDark] = useState(false);
  const [quiet, setQuiet] = useState(true);
  const [section, setSection] = useState('Personalization');
  const sections = ['Personalization', 'Security', 'Notifications'];
  return (
    <>
      <div className="page-header"><div><div className="eyebrow">Settings · your cockpit</div><h1 className="display-title" style={{ margin: '11px 0 10px' }}>Make it yours.</h1><p className="lede">A few considered choices keep the workspace useful without making it loud.</p></div><Button variant="secondary" testId="button-save-settings"><Check /> Saved locally</Button></div>
      <div className="settings-grid"><div className="settings-nav">{sections.map((item) => <button className={section === item ? 'active' : ''} onClick={() => setSection(item)} key={item} data-testid={`button-settings-${item.toLowerCase()}`}>{item}</button>)}</div><Panel className="settings-card"><h3>{section}</h3><p>{section === 'Personalization' ? 'Tune the feel and focus of your command center.' : section === 'Security' ? 'Boundaries for the private workspace.' : 'Decide what deserves your attention.'}</p>{section === 'Personalization' && <><div className="setting-row"><span className="row-icon"><Moon /></span><div className="switch-copy"><strong>Low-light cockpit</strong><span>Use the deep marine palette when working late.</span></div><Toggle on={dark} onClick={() => { setDark(!dark); document.documentElement.classList.toggle('dark', !dark); }} label="Low-light cockpit" /></div><div className="setting-row"><span className="row-icon"><Sparkles /></span><div className="switch-copy"><strong>Quiet recommendations</strong><span>Prefer fewer, higher-confidence suggestions from JARVIS.</span></div><Toggle on={quiet} onClick={() => setQuiet(!quiet)} label="Quiet recommendations" /></div><div className="setting-row"><span className="row-icon"><UserRound /></span><div className="switch-copy"><strong>Display name</strong><span>Used in greetings and briefings.</span></div><input className="text-input" style={{ maxWidth: 160 }} defaultValue="Shane" aria-label="Display name" data-testid="input-display-name" /></div></>}{section === 'Security' && <><div className="setting-row"><span className="row-icon"><KeyRound /></span><div className="switch-copy"><strong>Private workspace</strong><span>Local demo data stays in this browser session.</span></div><StatusPill>Enabled</StatusPill></div><div className="setting-row"><span className="row-icon"><ShieldCheck /></span><div className="switch-copy"><strong>Trade safety guardrail</strong><span>Live order placement is unavailable by design.</span></div><StatusPill tone="amber">Paper only</StatusPill></div><Button variant="secondary" testId="button-review-permissions"><LockKeyhole /> Review permissions</Button></>}{section === 'Notifications' && <><div className="setting-row"><span className="row-icon"><Bell /></span><div className="switch-copy"><strong>Morning briefing</strong><span>One daily summary at 08:00.</span></div><Toggle on={true} onClick={() => undefined} label="Morning briefing" /></div><div className="setting-row"><span className="row-icon"><MessageSquare /></span><div className="switch-copy"><strong>Task nudges</strong><span>Only when a due date is within 24 hours.</span></div><Toggle on={quiet} onClick={() => setQuiet(!quiet)} label="Task nudges" /></div></>}</Panel></div>
    </>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return <RoutedErrorBoundary><Shell><Switch><Route path="/" component={Home} /><Route path="/jarvis" component={JarvisPage} /><Route path="/work" component={WorkPage} /><Route path="/finance" component={FinancePage} /><Route path="/markets" component={MarketsPage} /><Route path="/personal" component={PersonalPage} /><Route path="/automations" component={AutomationsPage} /><Route path="/integrations" component={IntegrationsPage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></Shell></RoutedErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;