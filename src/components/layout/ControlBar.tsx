// Persistent simulation control panel (sticky under the top bar on every page).
import { useState } from 'react';
import { Ambulance, Ban, CarFront, CloudRain, GraduationCap, Pause, Play, RotateCcw, Square, Sun, WifiOff, Zap } from 'lucide-react';
import { useStore, useSim } from '../../store/simStore';
import { quick } from '../../store/quickActions';
import { SPEED_OPTIONS } from '../../sim/defaults';
import { Button, ConfirmDialog, Segmented, Tooltip } from '../ui';

export function ControlBar() {
  const status = useSim((s) => s.status);
  const hasRun = useSim((s) => s.hasRun);
  const raining = useSim((s) => s.weather.condition === 'heavy_rain');
  const speed = useStore((s) => s.settings.speed);
  const { start, pause, resume, stop, reset, newRun, setSpeed, setDemo } = useStore.getState();
  const demoActive = useStore((s) => s.demo.active);
  const [confirm, setConfirm] = useState<null | 'reset' | 'newrun'>(null);

  const actions = [
    { label: 'Generate traffic', icon: Zap, onClick: () => quick.generateTraffic(), tip: 'Send a surge of vehicles into Junction B (Market Circle)' },
    { label: 'Accident', icon: CarFront, onClick: () => quick.accident(), tip: 'Simulate a high-severity collision (choose location on the Incidents page)' },
    { label: raining ? 'Clear weather' : 'Heavy rain', icon: raining ? Sun : CloudRain, onClick: () => quick.heavyRain(), tip: raining ? 'Return to clear weather' : 'Simulate heavy rain across the network' },
    { label: 'Road blockage', icon: Ban, onClick: () => quick.blockage(), tip: 'Close a road segment to traffic' },
    { label: 'Emergency vehicle', icon: Ambulance, onClick: () => quick.emergency(), tip: 'Dispatch an ambulance from Tech Park to City Hospital' },
    { label: 'Sensor failure', icon: WifiOff, onClick: () => quick.sensorFailure(), tip: 'Fail a vehicle detection sensor (selected junction, or Junction C)' },
  ];

  return (
    <div style={{ top: "calc(4rem + env(safe-area-inset-top, 0px))" }} className="sticky z-30 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1480px] items-center gap-3 overflow-x-auto px-4 py-2.5 scroll-thin sm:px-6 lg:px-8" role="toolbar" aria-label="Simulation controls">
        <div className="flex shrink-0 items-center gap-1.5">
          {status === 'stopped' && (
            <Button variant="primary" size="sm" icon={Play} onClick={() => (hasRun ? setConfirm('newrun') : start())}>
              {hasRun ? 'Start new run' : 'Start'}
            </Button>
          )}
          {status === 'running' && (
            <Button variant="primary" size="sm" icon={Pause} onClick={pause}>
              Pause
            </Button>
          )}
          {status === 'paused' && (
            <Button variant="primary" size="sm" icon={Play} onClick={resume}>
              Resume
            </Button>
          )}
          <Tooltip label="Stop the run and keep its results for review">
            <Button variant="secondary" size="sm" icon={Square} onClick={stop} disabled={status === 'stopped'}>
              Stop
            </Button>
          </Tooltip>
          <Tooltip label="Return everything to the initial scenario">
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setConfirm('reset')}>
              Reset
            </Button>
          </Tooltip>
        </div>
        <Segmented
          label="Simulation speed"
          size="sm"
          value={speed}
          onChange={(v) => setSpeed(v)}
          options={SPEED_OPTIONS.map((v) => ({ value: v, label: `${v}×`, title: `Run at ${v}× speed` }))}
        />
        <span className="h-6 w-px shrink-0 bg-line-strong" aria-hidden />
        <div className="flex shrink-0 items-center gap-1.5">
          {actions.map((a) => (
            <Tooltip key={a.label} label={a.tip}>
              <Button variant="secondary" size="sm" icon={a.icon} onClick={a.onClick}>
                {a.label}
              </Button>
            </Tooltip>
          ))}
        </div>
        <span className="ml-auto" />
        <Button variant={demoActive ? 'tonal' : 'ghost'} size="sm" icon={GraduationCap} onClick={() => {
            const d = useStore.getState().demo;
            setDemo({ active: !d.active, step: d.step });
          }}>
          {demoActive ? 'Hide guide' : 'Guided demo'}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm === 'reset'}
        title="Reset the simulation?"
        body="Vehicles, signals, weather, sensors, incidents and history return to the initial scenario. Settings are kept."
        confirmLabel="Reset simulation"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          reset();
          useStore.getState().toast({ title: 'Simulation reset', message: 'The initial scenario is loaded. Press Start to run it.', tone: 'success' });
        }}
      />
      <ConfirmDialog
        open={confirm === 'newrun'}
        title="Start a new run?"
        body="The stopped run's history and event log will be cleared. Download a report from Analytics first if you need it."
        confirmLabel="Start new run"
        danger={false}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          newRun();
        }}
      />
    </div>
  );
}
