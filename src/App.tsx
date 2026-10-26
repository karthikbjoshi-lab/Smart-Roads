import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore, type PageId } from './store/simStore';
import { AppLayout } from './components/layout/AppLayout';
import { Toasts } from './components/layout/Toasts';
import { GuidedDemoPanel, Onboarding } from './demo/GuidedDemo';
import { Overview } from './pages/Overview';
import { LiveNetwork } from './pages/LiveNetwork';
import { TrafficManagement } from './pages/TrafficManagement';
import { Incidents } from './pages/Incidents';
import { Emergency } from './pages/Emergency';
import { RoadHealth } from './pages/RoadHealth';
import { Streetlights } from './pages/Streetlights';
import { Analytics } from './pages/Analytics';
import { Devices } from './pages/Devices';
import { Settings } from './pages/Settings';

const PAGES: Record<PageId, () => React.ReactElement> = {
  overview: Overview,
  network: LiveNetwork,
  traffic: TrafficManagement,
  incidents: Incidents,
  emergency: Emergency,
  health: RoadHealth,
  lights: Streetlights,
  analytics: Analytics,
  devices: Devices,
  settings: Settings,
};

const TITLES: Record<PageId, string> = {
  overview: 'Overview',
  network: 'Live Road Network',
  traffic: 'Traffic Management',
  incidents: 'Incidents & Alerts',
  emergency: 'Emergency Response',
  health: 'Road Health',
  lights: 'Smart Streetlights',
  analytics: 'Analytics & Reports',
  devices: 'Device Simulator',
  settings: 'Settings',
};

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const root = document.documentElement;
    const apply = () => {
      // "System" follows the host page's theme attribute first, then the OS setting.
      const host = root.getAttribute('data-theme');
      const dark = theme === 'dark' || (theme === 'system' && (host ? host === 'dark' : mq.matches));
      root.classList.toggle('dark', dark);
      root.classList.toggle('light', !dark);
    };
    apply();
    mq.addEventListener('change', apply);
    const obs = new MutationObserver(apply);
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', apply);
      obs.disconnect();
    };
  }, [theme]);
}

export default function App() {
  const page = useStore((s) => s.page);
  useTheme();
  useEffect(() => {
    document.title = `${TITLES[page]} · Smart Roads`;
  }, [page]);
  const Page = PAGES[page];
  return (
    <>
      <AppLayout>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={page} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
            <Page />
          </motion.div>
        </AnimatePresence>
      </AppLayout>
      <GuidedDemoPanel />
      <Onboarding />
      <Toasts />
    </>
  );
}
