import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Ambulance,
  Bell,
  BellOff,
  ChartColumn,
  Construction,
  Cpu,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  Map as MapIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
  Siren,
  TrafficCone,
  UserRound,
  X,
  Clock,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useStore, useSim, type PageId } from '../../store/simStore';
import { StorageService } from '../../services/storage';
import { nowClock, simClockAt } from '../../sim/format';
import { EVENT_SEVERITY_RANK } from '../../sim/defaults';
import { Badge, Button, IconButton, SeverityBadge, StatusDot, Tooltip, cx } from '../ui';
import { ControlBar } from './ControlBar';

export const NAV: Array<{ id: PageId; label: string; icon: LucideIcon; hint: string }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, hint: 'System summary' },
  { id: 'network', label: 'Live Road Network', icon: MapIcon, hint: 'Interactive map' },
  { id: 'traffic', label: 'Traffic Management', icon: TrafficCone, hint: 'Adaptive signals' },
  { id: 'incidents', label: 'Incidents & Alerts', icon: Siren, hint: 'Detection & response' },
  { id: 'emergency', label: 'Emergency Response', icon: Ambulance, hint: 'Signal priority' },
  { id: 'health', label: 'Road Health', icon: Construction, hint: 'Predictive maintenance' },
  { id: 'lights', label: 'Smart Streetlights', icon: Lightbulb, hint: 'Adaptive lighting' },
  { id: 'analytics', label: 'Analytics & Reports', icon: ChartColumn, hint: 'Charts & export' },
  { id: 'devices', label: 'Device Simulator', icon: Cpu, hint: 'Virtual IoT devices' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, hint: 'Configuration' },
];

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#1a73e8" />
      <path d="M11 26 L14 6 M21 26 L18 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 9v3M16 15v3M16 21v3" stroke="#fbbc04" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function useNavCounts() {
  const incidents = useSim((s) => s.incidents);
  const emergencies = useSim((s) => s.emergencies);
  const maintenance = useSim((s) => s.maintenance);
  const devices = useSim((s) => s.devices);
  return useMemo(
    () => ({
      incidents: incidents.filter((i) => i.status === 'active').length,
      emergency: emergencies.filter((e) => e.status === 'en_route').length,
      health: maintenance.filter((m) => m.status === 'open').length,
      devices: devices.filter((d) => d.status !== 'online').length,
    }),
    [incidents, emergencies, maintenance, devices],
  );
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const page = useStore((s) => s.page);
  const navigate = useStore((s) => s.navigate);
  const counts = useNavCounts();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = page === item.id;
        const count = (counts as Record<string, number>)[item.id] ?? 0;
        const Icon = item.icon;
        const btn = (
          <button
            type="button"
            onClick={() => {
              navigate(item.id);
              onNavigate?.();
            }}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'relative flex h-10 w-full items-center gap-3 rounded-full text-sm font-medium transition-colors',
              collapsed ? 'justify-center px-0' : 'px-4',
              active ? 'bg-primary-soft text-primary-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
          >
            <Icon size={19} strokeWidth={active ? 2.3 : 2} aria-hidden className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {count > 0 &&
              (collapsed ? (
                <span className="absolute top-1.5 right-2 size-2 rounded-full bg-bad-fill" aria-label={`${count} need attention`} />
              ) : (
                <span className={cx('ml-auto rounded-full px-2 text-xs leading-5 tabular', item.id === 'devices' || item.id === 'health' ? 'bg-warn-soft text-warn' : 'bg-bad-soft text-bad')}>{count}</span>
              ))}
          </button>
        );
        return (
          <div key={item.id}>
            {collapsed ? (
              <Tooltip label={item.label} side="right" className="w-full">
                {btn}
              </Tooltip>
            ) : (
              btn
            )}
          </div>
        );
      })}
    </nav>
  );
}

function StatusPill() {
  const status = useSim((s) => s.status);
  const tone = status === 'running' ? 'good' : status === 'paused' ? 'warn' : 'neutral';
  const label = status === 'running' ? 'Running' : status === 'paused' ? 'Paused' : 'Stopped';
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink" role="status" aria-live="polite">
      <StatusDot tone={tone} pulse={status === 'running'} />
      {label}
    </span>
  );
}

function SimClock() {
  const clock = useSim((s) => nowClock(s));
  const speed = useStore((s) => s.settings.speed);
  return (
    <Tooltip label="Simulated time of day. It runs faster at higher simulation speeds.">
      <span className="hidden h-8 items-center gap-2 rounded-full bg-surface-2 px-3 text-[13px] font-medium text-ink sm:inline-flex">
        <Clock size={15} className="text-ink-3" aria-hidden />
        <span className="tabular">{clock}</span>
        <span className="text-xs text-ink-3">sim · {speed}×</span>
      </span>
    </Tooltip>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const events = useSim((s) => s.events);
  const startClock = useSim((s) => s.startClock);
  const markAllRead = useStore((s) => s.markAllRead);
  const navigate = useStore((s) => s.navigate);
  const ref = useRef<HTMLDivElement>(null);
  const alerts = useMemo(() => events.filter((e) => EVENT_SEVERITY_RANK[e.severity] >= 2).slice(0, 30), [events]);
  const unread = useMemo(() => events.filter((e) => !e.read && EVENT_SEVERITY_RANK[e.severity] >= 2).length, [events]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <IconButton icon={Bell} label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={() => setOpen((o) => !o)} active={open} />
      {unread > 0 && (
        <span className="pointer-events-none absolute top-1 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad-fill px-1 text-[10px] font-semibold text-white tabular">{unread > 99 ? '99+' : unread}</span>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="fixed top-16 right-2 left-2 z-[70] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop sm:absolute sm:top-12 sm:right-0 sm:left-auto sm:w-[400px]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Alerts</p>
                <p className="text-xs text-ink-3">Medium severity and above · simulated</p>
              </div>
              <Button size="sm" variant="ghost" onClick={markAllRead} disabled={!unread}>
                Mark all read
              </Button>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto scroll-thin">
              {alerts.length === 0 && (
                <li className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-ink-3">
                  <BellOff size={20} aria-hidden /> No alerts yet. Simulate an accident or heavy rain to see some.
                </li>
              )}
              {alerts.map((e) => (
                <li key={e.id} className={cx('flex gap-3 border-b border-line px-4 py-3 last:border-0', !e.read && 'bg-primary-soft/40')}>
                  <div className="pt-0.5">
                    <SeverityBadge severity={e.severity} />
                  </div>
                  <div className="min-w-0 text-[13px]">
                    <p className="text-ink">{e.message}</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {simClockAt({ startClock }, e.t)} · {e.location}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-line p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  navigate('incidents');
                }}
              >
                Open Incidents & Alerts
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function subscribeDark(cb: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  mq.addEventListener('change', cb);
  return () => {
    obs.disconnect();
    mq.removeEventListener('change', cb);
  };
}
const readDark = () => document.documentElement.classList.contains('dark');

/** One click switches between light and dark mode (the choice is remembered). */
function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeDark, readDark);
  const update = useStore((s) => s.updateSettings);
  return (
    <IconButton
      icon={dark ? Sun : Moon}
      label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => update({ theme: dark ? 'light' : 'dark' })}
    />
  );
}

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const setOnboarding = useStore((s) => s.setOnboarding);
  const navigate = useStore((s) => s.navigate);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Tooltip label="Demo operator">
        <button type="button" aria-label="Operator menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="ml-1 grid size-9 place-items-center rounded-full bg-violet text-sm font-semibold text-white dark:text-[#16123a]">
          OP
        </button>
      </Tooltip>
      {open && (
        <div className="absolute top-12 right-0 z-[70] w-64 rounded-2xl border border-line bg-surface p-2 shadow-pop">
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2">
              <UserRound size={20} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Demo operator</p>
              <p className="text-xs text-ink-3">Local demo · no sign-in needed</p>
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          <button type="button" className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-ink hover:bg-surface-2" onClick={() => (setOpen(false), setOnboarding(true))}>
            <GraduationCap size={16} className="text-ink-3" aria-hidden /> Show welcome guide
          </button>
          <button type="button" className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-ink hover:bg-surface-2" onClick={() => (setOpen(false), navigate('settings'))}>
            <SettingsIcon size={16} className="text-ink-3" aria-hidden /> Settings
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => StorageService.sidebarCollapsed);
  const [drawer, setDrawer] = useState(false);
  const navigate = useStore((s) => s.navigate);
  const page = useStore((s) => s.page);
  const current = NAV.find((n) => n.id === page);

  useEffect(() => {
    StorageService.sidebarCollapsed = collapsed;
  }, [collapsed]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Top app bar */}
      <header style={{ top: "env(safe-area-inset-top, 0px)" }} className="sticky z-40 flex h-16 items-center gap-2 border-b border-line bg-surface/95 px-2 backdrop-blur sm:px-4">
        <span className="lg:hidden">
          <IconButton icon={Menu} label="Open navigation" onClick={() => setDrawer(true)} />
        </span>
        <span className="hidden lg:inline-flex">
          <IconButton icon={collapsed ? PanelLeftOpen : PanelLeftClose} label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed((c) => !c)} />
        </span>
        <button type="button" onClick={() => navigate('overview')} className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 text-left">
          <Logo />
          <span className="min-w-0">
            <span className="block text-[17px] leading-5 font-semibold tracking-tight text-ink">Smart Roads</span>
            <span className="hidden truncate text-xs leading-4 text-ink-3 sm:block">Intelligent Transportation Control Center</span>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Badge tone="violet" className="hidden md:inline-flex">
            Simulation mode
          </Badge>
          <StatusPill />
          <SimClock />
          <Notifications />
          <ThemeToggle />
          <span className="hidden sm:inline-flex">
            <IconButton icon={SettingsIcon} label="Settings" onClick={() => navigate('settings')} active={page === 'settings'} />
          </span>
          <ProfileMenu />
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className={cx('sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-3 py-4 transition-[width] duration-200 scroll-thin lg:flex', collapsed ? 'w-[76px]' : 'w-64')}>
          <NavList collapsed={collapsed} />
          {!collapsed && (
            <div className="mt-auto rounded-2xl bg-surface-2 p-4 text-xs leading-5 text-ink-2">
              <p className="font-semibold text-ink">College IoT microproject</p>
              <p className="mt-1">Every sensor, message and outcome here is simulated in your browser. No real traffic is controlled.</p>
            </div>
          )}
        </aside>

        {/* Mobile drawer */}
        <AnimatePresence>
          {drawer && (
            <div className="fixed inset-0 z-[60] lg:hidden">
              <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
              <motion.aside
                className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-3 overflow-y-auto bg-surface p-3 shadow-pop"
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                transition={{ type: 'tween', duration: 0.2 }}
                aria-label="Navigation"
              >
                <div className="flex items-center justify-between px-2 py-1">
                  <div className="flex items-center gap-2">
                    <Logo />
                    <span className="font-semibold text-ink">Smart Roads</span>
                  </div>
                  <IconButton icon={X} label="Close navigation" onClick={() => setDrawer(false)} />
                </div>
                <NavList collapsed={false} onNavigate={() => setDrawer(false)} />
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        <main id="main" className="min-w-0 flex-1" aria-label={current?.label}>
          <ControlBar />
          <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
