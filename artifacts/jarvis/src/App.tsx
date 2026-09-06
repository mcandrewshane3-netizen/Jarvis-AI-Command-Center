import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useUser, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';

// Icons
import { 
  Menu, X, Command, Home as HomeIcon, Bot, BriefcaseBusiness, 
  CircleDollarSign, TrendingUp, CalendarClock, Microscope, 
  Zap, Link2, Settings as SettingsIcon, Bell, RefreshCw, Network,
  Landmark, ShoppingCart
} from 'lucide-react';

// Pages
import { OverviewPage } from '@/pages/OverviewPage';
import { JarvisPage } from '@/pages/JarvisPage';
import { WorkPage } from '@/pages/WorkPage';
import { FinancePage } from '@/pages/FinancePage';
import { MarketsPage } from '@/pages/MarketsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ResearchPage } from '@/pages/ResearchPage';
import { CareerPage } from '@/pages/CareerPage';
import { BusinessPage } from '@/pages/BusinessPage';
import { SoftwarePage } from '@/pages/SoftwarePage';
import { ActionPlansPage } from '@/pages/ActionPlansPage';
import { EmptyModulePage } from '@/pages/EmptyPages';
import { SystemMapPage } from '@/pages/SystemMapPage';
import { EconomicsPage } from '@/pages/EconomicsPage';
import { CommercePage } from '@/pages/CommercePage';

// Primitives
import { StatusDot, TechValue, Button, JARVISCore } from '@/components/primitives';
import { useSettings } from '@/hooks/use-settings';

const queryClient = new QueryClient();

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || publishableKeyFromHost(window.location.hostname);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const navGroups = [
  {
    label: 'Command',
    items: [
      { href: '/', label: 'Overview', icon: HomeIcon },
      { href: '/jarvis', label: 'JARVIS Core', icon: Bot, highlight: true },
      { href: '/plans', label: 'Plans', icon: Network },
    ],
  },
  {
    label: 'Subsystems',
    items: [
      { href: '/work', label: 'Work', icon: BriefcaseBusiness },
      { href: '/finance', label: 'Finance', icon: CircleDollarSign },
      { href: '/economics', label: 'Economics', icon: Landmark },
      { href: '/markets', label: 'Markets', icon: TrendingUp },
      { href: '/commerce', label: 'Commerce', icon: ShoppingCart },
      { href: '/research', label: 'Research', icon: Microscope },
      { href: '/career', label: 'Career', icon: BriefcaseBusiness },
      { href: '/business', label: 'Business', icon: Bot },
      { href: '/software', label: 'Software', icon: Command },
      { href: '/personal', label: 'Personal', icon: CalendarClock },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { href: '/automations', label: 'Automations', icon: Zap },
      { href: '/integrations', label: 'Integrations', icon: Link2 },
      { href: '/system-map', label: 'System Map', icon: Network },
      { href: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
];

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout">
      <div className="w-full max-w-md bg-black/60 border border-primary/20 backdrop-blur-xl p-8 relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary/50 shadow-[0_0_15px_hsl(var(--primary))]" />
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 border border-primary/40 bg-primary/10 rounded-full flex items-center justify-center relative">
            <Command className="text-primary w-8 h-8" />
            <div className="absolute inset-0 border-t border-primary/80 rounded-full animate-[spin-slow_3s_linear_infinite]" />
          </div>
        </div>
        <div className="text-center font-mono text-sm tracking-widest text-primary uppercase mb-8">
          Secure Authentication Required
        </div>
        {children}
      </div>
    </div>
  );
}

function AuthWelcome() {
  return (
    <div className="auth-layout px-6">
      <div className="auth-welcome-grid">
        <div className="auth-intro">
          <div className="font-mono text-[10px] tracking-[0.28em] text-primary/70 uppercase mb-5">
            Private Personal Intelligence System
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-light tracking-tight text-white mb-5">
            JARVIS
          </h1>
          <p className="text-muted-foreground leading-relaxed max-w-xl mb-8">
            An authenticated command environment for persistent conversations, work queues,
            system context, and controlled research.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link className="btn-tech solid" href="/sign-in">SIGN IN</Link>
            <Link className="btn-tech" href="/sign-up">CREATE ACCOUNT</Link>
          </div>
          <div className="mt-8 font-mono text-[10px] tracking-widest text-amber-500/80 uppercase">
            Live trading disabled // External systems not connected
          </div>
        </div>
        <div className="auth-core-wrap">
          <JARVISCore processText="AUTHENTICATION REQUIRED" />
          <div className="auth-orbit-label auth-orbit-a">PRIVATE</div>
          <div className="auth-orbit-label auth-orbit-b">PERSISTENT</div>
          <div className="auth-orbit-label auth-orbit-c">CONTROLLED</div>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const { user } = useUser();
  const { signOut } = useAuth();
  
  // Call useSettings to initialize global reduced motion state
  useSettings();

  const closeMenu = () => setMobileMenuOpen(false);

  useEffect(() => {
    if (refreshed) {
      const timer = setTimeout(() => setRefreshed(false), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [refreshed]);

  useEffect(() => {
    const viewport = window.visualViewport;
    let layoutResizeTimer = 0;
    let layoutResizeSettling = false;

    const setViewportHeight = (height: number) => {
      document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(height)}px`);
    };

    const syncVisualViewportHeight = () => {
      if (layoutResizeSettling) {
        setViewportHeight(window.innerHeight);
        return;
      }
      const activeElement = document.activeElement;
      const inputFocused = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;
      const keyboardContraction = viewport
        ? window.innerHeight - viewport.height
        : 0;
      if (inputFocused && keyboardContraction > 160 && viewport) {
        setViewportHeight(viewport.height);
      } else {
        setViewportHeight(window.innerHeight);
      }
    };

    const syncLayoutViewportHeight = () => {
      layoutResizeSettling = true;
      setViewportHeight(window.innerHeight);
      window.clearTimeout(layoutResizeTimer);
      layoutResizeTimer = window.setTimeout(() => {
        layoutResizeSettling = false;
        syncVisualViewportHeight();
      }, 200);
    };

    syncLayoutViewportHeight();
    window.addEventListener('resize', syncLayoutViewportHeight);
    viewport?.addEventListener('resize', syncVisualViewportHeight);
    viewport?.addEventListener('scroll', syncVisualViewportHeight);
    return () => {
      window.clearTimeout(layoutResizeTimer);
      window.removeEventListener('resize', syncLayoutViewportHeight);
      viewport?.removeEventListener('resize', syncVisualViewportHeight);
      viewport?.removeEventListener('scroll', syncVisualViewportHeight);
      document.documentElement.style.removeProperty('--app-viewport-height');
    };
  }, []);

  useEffect(() => {
    closeMenu();
  }, [location]);

  return (
    <div className="cmd-layout bg-background">
      {/* Sidebar */}
      <aside className={`cmd-sidebar ${mobileMenuOpen ? 'open' : ''}`} aria-label="Primary navigation">
        <div className="h-20 px-6 flex items-center justify-between border-b border-primary/10">
          <Link href="/" className="flex items-center gap-3 no-underline group logo-wrap" onClick={closeMenu}>
            <div className="w-8 h-8 flex-shrink-0 bg-primary/10 border border-primary/40 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
              <Command size={16} />
            </div>
            <div className="logo-text">
              <div className="font-display font-bold text-white tracking-widest text-sm leading-none">JARVIS</div>
              <div className="font-mono text-[9px] text-primary/70 tracking-widest uppercase mt-1">KERNEL</div>
            </div>
          </Link>
          <button className="mobile-menu-btn text-primary p-2" onClick={closeMenu} aria-label="Collapse navigation">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8 scrollbar-hide">
          {navGroups.map(group => (
            <div key={group.label}>
              <div className="font-mono text-[10px] text-primary/40 tracking-widest uppercase mb-3 px-3 nav-group-label">
                {group.label}
              </div>
              <nav className="space-y-1">
                {group.items.map(item => {
                  const active = location === item.href;
                  return (
                    <Link 
                      key={item.href} 
                      href={item.href} 
                      className={`nav-link ${active ? 'active' : ''}`}
                      onClick={closeMenu}
                      title={item.label}
                    >
                      <item.icon size={16} className={active ? 'text-primary' : 'text-muted-foreground'} />
                      <span className="flex-1">{item.label}</span>
                      {item.highlight && <StatusDot status="online" pulse />}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-primary/10 profile-wrap">
          <div className="flex items-center gap-3 p-3 bg-black/40 border border-primary/10">
            <div className="w-8 h-8 flex-shrink-0 bg-primary/20 border border-primary/30 flex items-center justify-center font-mono text-xs text-primary">
              {user?.firstName?.[0] || 'OP'}
            </div>
            <div className="flex-1 min-w-0 profile-info">
              <div className="font-mono text-xs text-white truncate">{user?.firstName || 'Operator'}</div>
              <div className="font-mono text-[9px] text-primary/60 truncate">Authenticated</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`cmd-main ${location === '/jarvis' ? 'cmd-main-workspace' : ''}`}>
        <header className="cmd-header">
          <div className="flex items-center gap-4">
            <button className="mobile-menu-btn text-primary p-2 border border-primary/20 bg-primary/5 hover:bg-primary/10" onClick={() => setMobileMenuOpen(true)} aria-label="Expand navigation">
              <Menu size={20} />
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 border border-primary/30 bg-primary/5">
              <span className="font-mono text-[10px] text-primary tracking-widest">RESEARCH ONLY</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 border border-red-500/30 bg-red-500/5">
              <span className="font-mono text-[10px] text-red-500 tracking-widest">AGENTIC AUTO DISABLED</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-4">
            <Button variant="icon" testId="btn-refresh" onClick={() => setRefreshed(true)}>
              <RefreshCw size={16} className={refreshed ? 'animate-spin' : ''} />
            </Button>
            
            <Button variant="icon" testId="btn-notifications" disabled>
              <Bell size={16} />
            </Button>
          </div>
        </header>

        <div className={`cmd-content ${location === '/jarvis' ? 'cmd-content-workspace' : ''}`}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
        <div className="cmd-menu-backdrop" onClick={closeMenu} aria-hidden="true" />
      )}
    </div>
  );
}

function AuthenticatedApp() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={OverviewPage} />
        <Route path="/jarvis" component={JarvisPage} />
        <Route path="/plans" component={ActionPlansPage} />
        <Route path="/work" component={WorkPage} />
        <Route path="/finance" component={FinancePage} />
        <Route path="/economics" component={EconomicsPage} />
        <Route path="/markets" component={MarketsPage} />
        <Route path="/commerce" component={CommercePage} />
        <Route path="/research" component={ResearchPage} />
        <Route path="/career" component={CareerPage} />
        <Route path="/business" component={BusinessPage} />
        <Route path="/software" component={SoftwarePage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/system-map" component={SystemMapPage} />
        <Route path="/personal">
          <EmptyModulePage title="Personal" id="personal" />
        </Route>
        <Route path="/automations">
          <EmptyModulePage title="Automations" id="automations" />
        </Route>
        <Route path="/integrations">
          <EmptyModulePage title="Integrations" id="integrations" />
        </Route>
        <Route>
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <TechValue size="lg" className="text-red-500 mb-4">404 - SECTOR NOT FOUND</TechValue>
            <p className="font-mono text-muted-foreground mb-8">The requested subsystem trajectory is invalid.</p>
            <Link href="/" className="btn-tech">RETURN TO ORIGIN</Link>
          </div>
        </Route>
      </Switch>
    </Shell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ClerkProvider
        publishableKey={clerkPubKey!}
        proxyUrl={clerkProxyUrl}
        appearance={{
          theme: shadcn,
          cssLayerName: 'clerk',
          variables: {
            colorPrimary: '#00e7f5',
            colorForeground: '#d8f7fa',
            colorMutedForeground: '#739ca1',
            colorBackground: '#071114',
            colorInput: '#0b1b1f',
            colorInputForeground: '#d8f7fa',
            colorDanger: '#ff5d57',
            colorNeutral: '#6b8e92',
            fontFamily: 'DM Sans, sans-serif',
            borderRadius: '0.25rem',
          },
        }}
      >
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Switch>
            <Route path="/" component={EntryRoute} />
            <Route path="/sign-in(.*)">
              <AuthLayout>
                <SignIn routing="path" path="/sign-in" />
              </AuthLayout>
            </Route>
            <Route path="/sign-up(.*)">
              <AuthLayout>
                <SignUp routing="path" path="/sign-up" />
              </AuthLayout>
            </Route>
            <Route>
              {/* Only show AuthenticatedApp if signed in, but we handle the protection 
                  in a wrapper to respect ClerkProvider context */}
              <ProtectedWrapper />
            </Route>
          </Switch>
        </WouterRouter>
      </ClerkProvider>
    </QueryClientProvider>
  );
}

function EntryRoute() {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
        <div className="font-mono text-xs text-primary tracking-widest uppercase animate-pulse">Initializing secure shell...</div>
      </div>
    );
  }
  return userId ? <AuthenticatedApp /> : <AuthWelcome />;
}

function ProtectedWrapper() {
  const { isLoaded, userId } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && !userId) {
      setLocation('/sign-in');
    }
  }, [isLoaded, userId, setLocation]);

  if (!isLoaded || !userId) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
        <div className="font-mono text-xs text-primary tracking-widest uppercase animate-pulse">Initializing Kernel...</div>
      </div>
    );
  }

  return <AuthenticatedApp />;
}
