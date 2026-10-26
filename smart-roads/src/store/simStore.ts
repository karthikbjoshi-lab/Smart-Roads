// Central app store (Zustand). The simulation state is immutable from React's point of view:
// every change goes through Immer's `produce`, so components only re-render when the slice
// they read actually changed.

import { create } from 'zustand';
import { produce, setAutoFreeze } from 'immer';
import { createInitialState, step } from '../sim/engine';
import { addEvent } from '../sim/events';
import { EVENT_SEVERITY_RANK } from '../sim/defaults';
import { StorageService } from '../services/storage';
import type { Settings, SimState } from '../sim/types';

// Freezing thousands of objects ten times a second costs more than it is worth here.
setAutoFreeze(false);

export type PageId =
  | 'overview'
  | 'network'
  | 'traffic'
  | 'incidents'
  | 'emergency'
  | 'health'
  | 'lights'
  | 'analytics'
  | 'devices'
  | 'settings';

export const PAGE_IDS: PageId[] = ['overview', 'network', 'traffic', 'incidents', 'emergency', 'health', 'lights', 'analytics', 'devices', 'settings'];

export type Selection = { kind: 'junction' | 'road'; id: string };

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';
export interface Toast {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
  page?: PageId;
}

const WARMUP_SECONDS = 120;
const TICK_MS = 100;
const MAX_STEP = 0.2;

interface StoreState {
  sim: SimState;
  settings: Settings;
  page: PageId;
  selection: Selection | null;
  toasts: Toast[];
  lastToastSeq: number;
  onboardingOpen: boolean;
  demo: { active: boolean; step: number };

  navigate: (page: PageId) => void;
  select: (sel: Selection | null) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
  newRun: () => void;
  setSpeed: (speed: number) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  act: <T>(fn: (s: SimState, cfg: Settings) => T) => T;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  markAllRead: () => void;
  clearHistory: () => void;
  setOnboarding: (open: boolean) => void;
  setDemo: (demo: { active: boolean; step: number }) => void;
}

let toastId = 1;

const HASH_TOKEN: Partial<Record<PageId, string>> = { settings: 'setup' };
function pageFromHash(): PageId {
  let h = '';
  try {
    h = window.location.hash.replace(/^#\/?/, '');
  } catch {
    /* ignore */
  }
  const fromToken = (Object.entries(HASH_TOKEN).find(([, t]) => t === h)?.[0] ?? h) as PageId;
  return PAGE_IDS.includes(fromToken) ? fromToken : 'overview';
}

function freshSim(settings: Settings) {
  return createInitialState(settings, { warmup: WARMUP_SECONDS });
}

/** Turns new high-severity log entries into toasts (respecting notification settings). */
function eventToasts(prev: { lastToastSeq: number; toasts: Toast[] }, sim: SimState, settings: Settings) {
  const newest = sim.events[0]?.seq ?? 0;
  if (newest <= prev.lastToastSeq) return null;
  const toasts = [...prev.toasts];
  if (settings.notifyToasts) {
    const fresh = sim.events.filter((e) => e.seq > prev.lastToastSeq && EVENT_SEVERITY_RANK[e.severity] >= EVENT_SEVERITY_RANK[settings.notifyMinSeverity]);
    for (const e of fresh.slice(0, 3).reverse()) {
      toasts.push({
        id: toastId++,
        title: e.category === 'incident' ? 'Incident alert' : e.category === 'emergency' ? 'Emergency response' : e.category === 'network' ? 'Network warning' : 'Alert',
        message: `${e.message} · ${e.location}`,
        tone: e.severity === 'critical' || e.severity === 'high' ? 'danger' : 'warning',
        page: e.category === 'incident' ? 'incidents' : e.category === 'emergency' ? 'emergency' : e.category === 'network' || e.category === 'device' ? 'devices' : e.category === 'maintenance' ? 'health' : undefined,
      });
    }
  }
  return { lastToastSeq: newest, toasts: toasts.slice(-4) };
}

const initialSettings = StorageService.loadSettings();
const initialSim = freshSim(initialSettings);

export const useStore = create<StoreState>((set, get) => {
  const mutate = (fn: (s: SimState) => void) => {
    const { sim, settings } = get();
    const next = produce(sim, (d) => {
      fn(d as SimState);
    });
    const toastPatch = eventToasts(get(), next, settings);
    set({ sim: next, ...(toastPatch ?? {}) });
  };

  return {
    sim: initialSim,
    settings: initialSettings,
    page: pageFromHash(),
    selection: null,
    toasts: [],
    lastToastSeq: initialSim.events[0]?.seq ?? 0,
    onboardingOpen: !StorageService.onboardingSeen,
    demo: { active: false, step: 0 },

    navigate: (page) => {
      try {
        const token = `#${HASH_TOKEN[page] ?? page}`;
        if (window.location.hash !== token) window.history.replaceState(null, '', token);
      } catch {
        /* the hosting frame may not allow URL changes — navigation still works */
      }
      set({ page });
      window.scrollTo({ top: 0 });
    },
    select: (selection) => set({ selection }),

    start: () =>
      mutate((s) => {
        if (s.status === 'running') return;
        s.status = 'running';
        s.hasRun = true;
        addEvent(s, { category: 'system', severity: 'info', location: 'Control center', message: 'Simulation started', status: 'Running' });
      }),
    pause: () =>
      mutate((s) => {
        if (s.status !== 'running') return;
        s.status = 'paused';
        addEvent(s, { category: 'system', severity: 'info', location: 'Control center', message: 'Simulation paused — time, vehicles and sensors frozen', status: 'Paused' });
      }),
    resume: () =>
      mutate((s) => {
        if (s.status !== 'paused') return;
        s.status = 'running';
        addEvent(s, { category: 'system', severity: 'info', location: 'Control center', message: 'Simulation resumed', status: 'Running' });
      }),
    stop: () =>
      mutate((s) => {
        if (s.status === 'stopped') return;
        s.status = 'stopped';
        addEvent(s, { category: 'system', severity: 'info', location: 'Control center', message: 'Simulation stopped — results kept for review. Start a new run to begin again.', status: 'Stopped' });
      }),
    reset: () => {
      const sim = freshSim(get().settings);
      set({ sim, selection: null, lastToastSeq: sim.events[0]?.seq ?? 0, toasts: [] });
    },
    newRun: () => {
      const sim = freshSim(get().settings);
      set({ sim, selection: null, lastToastSeq: sim.events[0]?.seq ?? 0 });
      get().start();
    },
    setSpeed: (speed) => get().updateSettings({ speed }),
    updateSettings: (patch) => {
      const settings = { ...get().settings, ...patch };
      StorageService.saveSettings(settings);
      set({ settings });
    },
    resetSettings: () => {
      StorageService.clearSettings();
      set({ settings: StorageService.loadSettings() });
    },
    act: (fn) => {
      let result: ReturnType<typeof fn> | undefined;
      const cfg = get().settings;
      mutate((s) => {
        result = fn(s, cfg);
      });
      return result as ReturnType<typeof fn>;
    },
    toast: (t) => set((st) => ({ toasts: [...st.toasts, { ...t, id: toastId++ }].slice(-4) })),
    dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
    markAllRead: () =>
      set((st) => ({
        sim: produce(st.sim, (d) => {
          for (const e of d.events) e.read = true;
        }),
      })),
    clearHistory: () =>
      mutate((s) => {
        s.history = [];
        s.events = [];
        s.adjustments = [];
        s.incidents = s.incidents.filter((i) => i.status !== 'resolved');
        s.maintenance = s.maintenance.filter((m) => m.status !== 'completed');
        s.emergencies = s.emergencies.filter((e) => e.status === 'en_route');
        s.messages = [];
        s.lastSampleAt = -Infinity;
        addEvent(s, { category: 'system', severity: 'info', location: 'Control center', message: 'Simulation history cleared by operator', status: 'Cleared' });
      }),
    setOnboarding: (open) => {
      if (!open) StorageService.onboardingSeen = true;
      set({ onboardingOpen: open });
    },
    setDemo: (demo) => set({ demo }),
  };
});

/** One interval drives the whole simulation, no matter which page is open. */
let timer: number | null = null;
export function startLoop() {
  if (timer !== null) return;
  let last = performance.now();
  timer = window.setInterval(() => {
    const now = performance.now();
    const real = Math.min(0.5, (now - last) / 1000);
    last = now;
    const st = useStore.getState();
    if (st.sim.status !== 'running') return;
    let remaining = real * st.settings.speed;
    const cfg = st.settings;
    const next = produce(st.sim, (d) => {
      while (remaining > 1e-6) {
        const dt = Math.min(MAX_STEP, remaining);
        step(d as SimState, dt, cfg);
        remaining -= dt;
      }
    });
    const toastPatch = eventToasts(st, next, cfg);
    useStore.setState({ sim: next, ...(toastPatch ?? {}) });
  }, TICK_MS);
  window.addEventListener('hashchange', () => useStore.setState({ page: pageFromHash() }));
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  });
}

/** Convenience hooks. */
export const useSim = <T,>(selector: (s: SimState) => T) => useStore((st) => selector(st.sim));
export const useSettings = () => useStore((st) => st.settings);
