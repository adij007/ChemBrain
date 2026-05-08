import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Outlet } from '@tanstack/react-router';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { can, highestRole, ROLE_LABEL, type Action } from '@/lib/rbac';
import { Beaker, FlaskConical, FolderKanban, Search, Bell, ChevronLeft, LogOut, Settings, User as UserIcon, PanelLeft, Layers, BookOpen, BarChart3, FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SystemHealthBanner } from '@/components/common/SystemHealthBanner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type NavItem = {
  to: string;
  label: string;
  icon: any;
  perm: Action;
  search?: Record<string, string>;
  exact?: boolean;
  children?: NavItem[];
};

const NAV: NavItem[] = [
  { to: '/research', label: 'Research Workspace', icon: Beaker, perm: 'research.read' },
  { to: '/simulation', label: 'Simulation Studio', icon: FlaskConical, perm: 'simulation.read' },
  {
    to: '/programs',
    label: 'Program Hub',
    icon: FolderKanban,
    perm: 'program.read',
    children: [
      { to: '/programs', label: 'Portfolio', icon: Layers, perm: 'program.read', search: { tab: 'portfolio' }, exact: true },
      { to: '/programs', label: 'Evidence Explorer', icon: FileSearch, perm: 'program.read', search: { tab: 'evidence' } },
      { to: '/programs', label: 'Learning Hub', icon: BookOpen, perm: 'learning.read', search: { tab: 'learning' } },
      { to: '/programs', label: 'Executive Insights', icon: BarChart3, perm: 'program.read', search: { tab: 'insights' } },
    ],
  },
  { to: '/settings', label: 'Settings', icon: Settings, perm: 'learning.read' },
];

function EnvBadge() {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  const env = host.includes('preview') ? 'PREVIEW' : host.includes('localhost') ? 'DEV' : 'PROD';
  const color = env === 'PROD' ? 'bg-confidence-high/15 text-confidence-high' : env === 'PREVIEW' ? 'bg-confidence-mid/15 text-confidence-mid' : 'bg-evidence-tag/15 text-evidence-tag';
  return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider', color)}>{env}</span>;
}

export function AppShell() {
  const { user, roles, signOut } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar, drawerOpen, setDrawerOpen } = useUIStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [globalSearch, setGlobalSearch] = useState('');

  const role = highestRole(roles);
  const visibleNav = NAV.filter((n) => can(roles, n.perm));
  const currentTab = (location.search as { tab?: string } | undefined)?.tab ?? '';

  const isItemActive = (item: NavItem) => {
    if (item.search?.tab) {
      return location.pathname === item.to && currentTab === item.search.tab;
    }
    if (item.exact) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  };

  const runGlobalSearch = () => {
    const q = globalSearch.trim();
    navigate({
      to: '/research',
      search: q ? ({ q } as Record<string, string>) : {},
    });
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left rail */}
      <aside className={cn('flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all', sidebarCollapsed ? 'w-16' : 'w-60')}>
        <div className="flex h-14 items-center gap-2 px-4 border-b border-sidebar-border">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold">C</div>
          {!sidebarCollapsed && <div className="font-semibold tracking-tight">ChemBrain</div>}
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const parentActive = location.pathname.startsWith(item.to);
            return (
              <div key={item.label}>
                <Link
                  to={item.to}
                  search={item.search as any}
                  className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    parentActive && !item.children ? 'bg-sidebar-accent text-sidebar-accent-foreground' :
                    parentActive ? 'text-sidebar-accent-foreground' :
                    'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground')}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="size-4 shrink-0" />
                  {!sidebarCollapsed && <span className="font-medium">{item.label}</span>}
                </Link>
                {!sidebarCollapsed && item.children && parentActive && (
                  <div className="mt-1 ml-3 border-l border-sidebar-border/60 pl-2 space-y-0.5">
                    {item.children.filter((c) => can(roles, c.perm)).map((child) => {
                      const ChildIcon = child.icon;
                      const active = isItemActive(child);
                      return (
                        <Link
                          key={child.label}
                          to={child.to}
                          search={child.search as any}
                          className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                            active
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground')}
                        >
                          <ChildIcon className="size-3.5 shrink-0" />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <button onClick={toggleSidebar} className="m-2 flex items-center justify-center gap-2 rounded-md p-2 text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent">
          <ChevronLeft className={cn('size-4 transition-transform', sidebarCollapsed && 'rotate-180')} />
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between gap-4 border-b bg-card px-4">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <Button variant="ghost" size="icon" onClick={toggleSidebar} className="lg:hidden"><PanelLeft className="size-4" /></Button>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    runGlobalSearch();
                  }
                }}
                placeholder="Search drugs, targets, diseases, parasites…"
                className="pl-9 pr-10 h-9"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1 size-7"
                onClick={runGlobalSearch}
                aria-label="Run global search"
              >
                <Search className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <EnvBadge />
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Activity">
                  <Bell className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader><SheetTitle>Activity</SheetTitle></SheetHeader>
                <Tabs defaultValue="logs" className="mt-4">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="logs">Logs</TabsTrigger>
                    <TabsTrigger value="alerts">Alerts</TabsTrigger>
                    <TabsTrigger value="queue">Queue</TabsTrigger>
                  </TabsList>
                  <TabsContent value="logs" className="text-sm text-muted-foreground space-y-2 mt-3">
                    <div className="rounded border p-2"><div className="font-mono text-xs">[INFO] Simulation CBX-1042 completed · 2.4s</div></div>
                    <div className="rounded border p-2"><div className="font-mono text-xs">[INFO] Query "KRAS Oncology" returned 2 candidates</div></div>
                  </TabsContent>
                  <TabsContent value="alerts" className="text-sm text-muted-foreground mt-3">No alerts.</TabsContent>
                  <TabsContent value="queue" className="text-sm text-muted-foreground mt-3">Queue empty.</TabsContent>
                </Tabs>
              </SheetContent>
            </Sheet>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 h-9 px-2">
                  <div className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                    {user?.email?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <div className="text-left hidden sm:block">
                    <div className="text-xs font-medium leading-tight">{user?.email}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">{ROLE_LABEL[role]}</div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium">{user?.email}</div>
                  <div className="text-xs text-muted-foreground">{roles.map((r) => ROLE_LABEL[r]).join(', ') || 'No role'}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: '/settings' })}><UserIcon className="size-4 mr-2" />Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: '/settings' })}><Settings className="size-4 mr-2" />Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => { await signOut(); navigate({ to: '/signin' }); }}>
                  <LogOut className="size-4 mr-2" />Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="px-4 pt-4">
            <SystemHealthBanner />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
