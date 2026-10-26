// Guided demonstration (11 steps) + first-visit welcome dialog.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, GraduationCap, Play, RotateCcw, X, Radio, Router, Brain, Zap } from 'lucide-react';
import { useStore, useSim, type PageId } from '../store/simStore';
import { quick } from '../store/quickActions';
import { setClock, setWeather } from '../sim/weather';
import { Button, IconButton, Modal, cx } from '../components/ui';

interface DemoStep {
  title: string;
  body: string;
  page: PageId;
  action?: { label: string; run: () => void };
}

const STEPS: DemoStep[] = [
  {
    title: 'Start the simulation',
    body: 'The clock starts, vehicles move along the road graph and every virtual sensor begins publishing readings. Watch the status pill in the top bar change to Running.',
    page: 'overview',
    action: { label: 'Start simulation', run: () => useStore.getState().start() },
  },
  {
    title: 'Traffic sensors report vehicle counts',
    body: 'Each junction has a vehicle detection sensor (VDS-A … VDS-F) that reports every 2 simulated seconds. The Vehicles, Density and Queue values on each junction card come from those messages.',
    page: 'traffic',
  },
  {
    title: 'Trigger heavy congestion',
    body: 'Send a surge of vehicles into Junction B (Market Circle). Its approach roads turn yellow and red on the map, and the congestion detector raises an alert if density stays above the threshold.',
    page: 'traffic',
    action: { label: 'Generate traffic surge', run: () => quick.generateTraffic('B') },
  },
  {
    title: 'Adaptive signals respond',
    body: 'When a green phase starts, the controller sets its length from the queue: green = min green + 2.5 s × queued vehicles, capped at the max. Look at Junction B and the “Recent timing changes” table for the before → after timings.',
    page: 'traffic',
  },
  {
    title: 'Simulate an accident',
    body: 'A high-severity collision on Lake Road (B–C) closes the segment. The road turns dark red, vehicles stop behind it and the system recommends a detour.',
    page: 'incidents',
    action: { label: 'Simulate accident', run: () => quick.accident('B-C', 'high') },
  },
  {
    title: 'Inspect the incident alert',
    body: 'Open the incident card to see severity, location and the recommended response. Use Acknowledge, then Resolve — each action is recorded in the event log and the road reopens.',
    page: 'incidents',
  },
  {
    title: 'Ambulance with signal priority',
    body: 'An ambulance is dispatched from the Fire Station to City Hospital along a Dijkstra route. As it approaches each junction it sends a priority request and the signal turns green for it, then returns to normal.',
    page: 'emergency',
    action: {
      label: 'Dispatch ambulance',
      run: () => {
        useStore.getState().updateSettings({ emergencyPriority: true });
        quick.emergency('ambulance', 'FIRE', 'HOSPITAL');
      },
    },
  },
  {
    title: 'Heavy rain raises waterlogging risk',
    body: 'Rain gauges report heavy rainfall. Roads with poor drainage (River Road, Lakeside Drive, Lake Road) build up waterlogging risk, which creates hazard alerts and drainage tasks.',
    page: 'health',
    action: { label: 'Simulate heavy rain', run: () => useStore.getState().act((s) => setWeather(s, 'heavy_rain')) },
  },
  {
    title: 'Road damage warning',
    body: 'A vibration spike on River Road (E–F) pushes its pothole risk over the threshold. The predictive-maintenance rules add a task to the maintenance queue — mark it completed to restore the road.',
    page: 'health',
    action: { label: 'Simulate road damage', run: () => quick.damage('E-F') },
  },
  {
    title: 'Streetlight automation',
    body: 'Jump the virtual clock to night. Streetlights in automatic mode switch on, dim when roads are empty and brighten to 100 % when a vehicle or pedestrian is detected. Energy use is estimated against conventional lamps.',
    page: 'lights',
    action: { label: 'Set time to 20:00', run: () => useStore.getState().act((s) => setClock(s, 20)) },
  },
  {
    title: 'Review the analytics',
    body: 'Every event from this demo is reflected in the charts: traffic density, waiting time, incidents by severity, energy and communication performance. Download a CSV or JSON report for your project file.',
    page: 'analytics',
  },
];

/** Initialise a fresh, useful scenario and open the guide. */
export function startDemo() {
  const st = useStore.getState();
  st.reset();
  st.updateSettings({ speed: 2, adaptive: true, emergencyPriority: true });
  st.start();
  st.setDemo({ active: true, step: 1 });
  st.setOnboarding(false);
  st.navigate('overview');
  st.toast({ title: 'Demo started', message: 'Simulation running at 2×. Follow the guide in the corner.', tone: 'success' });
}

export function resetDemo() {
  const st = useStore.getState();
  st.reset();
  st.act((s) => setWeather(s, st.settings.defaultWeather));
  st.setDemo({ active: true, step: 0 });
  st.navigate('overview');
  st.toast({ title: 'Demo reset', message: 'The original scenario is restored.', tone: 'success' });
}

export function GuidedDemoPanel() {
  const demo = useStore((s) => s.demo);
  const setDemo = useStore((s) => s.setDemo);
  const navigate = useStore((s) => s.navigate);
  const page = useStore((s) => s.page);
  const status = useSim((s) => s.status);
  const step = STEPS[demo.step];

  const go = (i: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, i));
    setDemo({ active: true, step: next });
    navigate(STEPS[next].page);
  };

  return (
    <AnimatePresence>
      {demo.active && step && (
        <motion.aside
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed right-3 bottom-3 left-3 z-[55] rounded-3xl border border-line bg-surface shadow-pop sm:left-auto sm:w-[380px]"
          aria-label="Guided demonstration"
        >
          <div className="flex items-center justify-between gap-2 px-5 pt-4">
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-primary-ink uppercase">
              <GraduationCap size={15} aria-hidden /> Guided demo · step {demo.step + 1} of {STEPS.length}
            </span>
            <IconButton icon={X} label="Close guide" size="sm" onClick={() => setDemo({ ...demo, active: false })} />
          </div>
          <div className="mx-5 mt-2 flex gap-1" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={cx('h-1 flex-1 rounded-full', i <= demo.step ? 'bg-primary' : 'bg-surface-3')} />
            ))}
          </div>
          <div className="px-5 pt-3 pb-2">
            <h2 className="text-base font-semibold text-ink">{step.title}</h2>
            <p className="mt-1 text-[13px] leading-5 text-ink-2">{step.body}</p>
            {page !== step.page && (
              <button type="button" className="mt-2 text-[13px] font-medium text-primary hover:underline" onClick={() => navigate(step.page)}>
                Go to the relevant page →
              </button>
            )}
            {status !== 'running' && demo.step > 0 && (
              <p className="mt-2 text-xs text-warn">The simulation is not running — press Start or Resume in the control bar to see changes.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 px-5 pt-1 pb-4">
            {step.action && (
              <Button
                variant="primary"
                size="sm"
                icon={Play}
                onClick={() => {
                  step.action!.run();
                  navigate(step.page);
                }}
              >
                {step.action.label}
              </Button>
            )}
            <span className="ml-auto" />
            <IconButton icon={ArrowLeft} label="Previous step" size="sm" disabled={demo.step === 0} onClick={() => go(demo.step - 1)} />
            {demo.step < STEPS.length - 1 ? (
              <Button variant="secondary" size="sm" iconRight={ArrowRight} onClick={() => go(demo.step + 1)}>
                Next
              </Button>
            ) : (
              <Button variant="secondary" size="sm" icon={Check} onClick={() => setDemo({ active: false, step: 0 })}>
                Finish
              </Button>
            )}
          </div>
          <div className="border-t border-line px-5 py-2.5">
            <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-ink" onClick={resetDemo}>
              <RotateCcw size={13} aria-hidden /> Reset demo
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function Onboarding() {
  const open = useStore((s) => s.onboardingOpen);
  const setOnboarding = useStore((s) => s.setOnboarding);
  const stages = [
    { icon: Radio, title: 'Sense', body: 'Virtual sensors measure traffic, weather, road condition and motion.' },
    { icon: Router, title: 'Communicate', body: 'Readings are sent through roadside gateways as IoT messages.' },
    { icon: Brain, title: 'Process', body: 'Edge and cloud rules detect congestion, hazards and damage.' },
    { icon: Zap, title: 'Respond', body: 'Signals adapt, emergency vehicles get priority, lights respond.' },
  ];
  return (
    <Modal
      open={open}
      onClose={() => setOnboarding(false)}
      width="max-w-2xl"
      title="Welcome to the Smart Roads Control Center"
      footer={
        <>
          <Button variant="ghost" onClick={() => setOnboarding(false)}>
            Explore on my own
          </Button>
          <Button variant="primary" icon={GraduationCap} onClick={startDemo} data-autofocus>
            Start guided demo
          </Button>
        </>
      }
    >
      <p>
        This is a working simulation of an IoT-enabled road network with six signalised junctions. Everything — sensors, messages, vehicles and outcomes — is
        simulated in your browser. Nothing controls real traffic.
      </p>
      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {stages.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="flex gap-3 rounded-2xl border border-line p-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-ink">
                <Icon size={18} aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {i + 1}. {s.title}
                </p>
                <p className="text-[13px] leading-5 text-ink-2">{s.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-[13px] text-ink-3">The guided demo walks through 11 steps in about five minutes — ideal for a faculty presentation.</p>
    </Modal>
  );
}
