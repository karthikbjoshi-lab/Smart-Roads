import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Check, Database, Lightbulb, Monitor, Moon, Palette, Settings as SettingsIcon, SlidersHorizontal, Sun, TrafficCone, TriangleAlert, Router } from 'lucide-react';
import { useStore } from '../store/simStore';
import { SPEED_OPTIONS } from '../sim/defaults';
import { WEATHER_ORDER, WEATHER_PRESETS } from '../sim/weather';
import { Button, Card, CardHeader, ConfirmDialog, Field, NumberField, PageHeader, Segmented, Select, Switch } from '../components/ui';
import type { Settings as SettingsT } from '../sim/types';

function Section({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: typeof Sun; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} icon={icon} />
      <div className="flex flex-col gap-5 px-5 pb-5">{children}</div>
    </Card>
  );
}

function hourLabel(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function Settings() {
  const cfg = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const resetSettings = useStore((s) => s.resetSettings);
  const clearHistory = useStore((s) => s.clearHistory);
  const reset = useStore((s) => s.reset);
  const setOnboarding = useStore((s) => s.setOnboarding);
  const toast = useStore((s) => s.toast);
  const [saved, setSaved] = useState(0);
  const [confirm, setConfirm] = useState<null | 'settings' | 'history' | 'sim'>(null);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(0), 1600);
    return () => window.clearTimeout(t);
  }, [saved]);

  const update = (patch: Partial<SettingsT>) => {
    updateSettings(patch);
    setSaved(Date.now());
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Changes apply immediately and are saved in this browser. Thresholds explain when the simulated detectors raise alerts."
        icon={SettingsIcon}
        actions={
          <span className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-opacity ${saved ? 'bg-good-soft text-good opacity-100' : 'opacity-0'}`} role="status" aria-live="polite">
            <Check size={15} aria-hidden /> {saved ? 'Saved' : ''}
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Simulation" subtitle="Speed and the starting scenario" icon={SlidersHorizontal}>
          <Field label="Simulation speed">
            <Segmented label="Simulation speed" value={cfg.speed} onChange={(v) => update({ speed: v })} options={SPEED_OPTIONS.map((v) => ({ value: v, label: `${v}×` }))} />
          </Field>
          <Field label="Default weather" htmlFor="set-weather" hint="Used when the simulation is reset.">
            <Select id="set-weather" value={cfg.defaultWeather} onChange={(v) => update({ defaultWeather: v as SettingsT['defaultWeather'] })} options={WEATHER_ORDER.map((w) => ({ value: w, label: WEATHER_PRESETS[w].label }))} />
          </Field>
          <Field label={`Start time of day: ${hourLabel(cfg.startHour)}`} htmlFor="set-hour" hint="Virtual clock time when a new scenario starts (applies on reset).">
            <NumberField id="set-hour" value={cfg.startHour} min={0} max={23.75} step={0.25} onChange={(v) => update({ startHour: v })} suffix=" h" />
          </Field>
        </Section>

        <Section title="Adaptive signals" subtitle="Simplified adaptive control algorithm" icon={TrafficCone}>
          <Switch checked={cfg.adaptive} onChange={(v) => update({ adaptive: v })} label="Adaptive traffic management" description="Off = every junction runs a fixed cycle." />
          <Field label="Minimum green" htmlFor="set-min" hint="Shortest green an approach can get.">
            <NumberField id="set-min" value={cfg.minGreen} min={5} max={Math.min(30, cfg.maxGreen - 5)} onChange={(v) => update({ minGreen: v })} suffix=" s" />
          </Field>
          <Field label="Maximum green" htmlFor="set-max" hint="Longest green, so the other approach is never starved.">
            <NumberField id="set-max" value={cfg.maxGreen} min={Math.max(20, cfg.minGreen + 5)} max={90} onChange={(v) => update({ maxGreen: v })} suffix=" s" />
          </Field>
          <Field label="Extra green per queued vehicle" htmlFor="set-spv">
            <NumberField id="set-spv" value={cfg.secondsPerVehicle} min={1} max={5} step={0.5} onChange={(v) => update({ secondsPerVehicle: v })} suffix=" s" />
          </Field>
          <Field label="Fixed-cycle green" htmlFor="set-fixed" hint="Used when adaptive control is off or a sensor is offline.">
            <NumberField id="set-fixed" value={cfg.fixedGreen} min={10} max={60} onChange={(v) => update({ fixedGreen: v })} suffix=" s" />
          </Field>
          <Switch checked={cfg.emergencyPriority} onChange={(v) => update({ emergencyPriority: v })} label="Emergency vehicle priority" description="Junctions give green to approaching emergency vehicles." />
        </Section>

        <Section title="Incident thresholds" subtitle="When detectors raise alerts and maintenance tasks" icon={TriangleAlert}>
          <Field label="Heavy congestion at road density ≥" htmlFor="set-cong" hint="Must stay above for 15 s before an incident is raised.">
            <NumberField id="set-cong" value={cfg.congestionThreshold} min={50} max={95} step={5} onChange={(v) => update({ congestionThreshold: v })} suffix=" %" />
          </Field>
          <Field label="Pothole risk ≥" htmlFor="set-pot">
            <NumberField id="set-pot" value={cfg.potholeThreshold} min={40} max={90} step={5} onChange={(v) => update({ potholeThreshold: v })} suffix=" %" />
          </Field>
          <Field label="Waterlogging risk ≥" htmlFor="set-water">
            <NumberField id="set-water" value={cfg.waterloggingThreshold} min={40} max={95} step={5} onChange={(v) => update({ waterloggingThreshold: v })} suffix=" %" />
          </Field>
          <Field label="Road health below" htmlFor="set-health">
            <NumberField id="set-health" value={cfg.healthThreshold} min={30} max={80} step={5} onChange={(v) => update({ healthThreshold: v })} suffix="" />
          </Field>
          <Field label="Low visibility below" htmlFor="set-vis">
            <NumberField id="set-vis" value={cfg.visibilityThreshold} min={50} max={500} step={25} onChange={(v) => update({ visibilityThreshold: v })} suffix=" m" />
          </Field>
        </Section>

        <Section title="Streetlight automation" subtitle="Rules for automatic and energy-saving modes" icon={Lightbulb}>
          <Field label="Mode">
            <Segmented
              label="Lighting mode"
              value={cfg.lightingMode}
              onChange={(v) => update({ lightingMode: v })}
              options={[
                { value: 'auto', label: 'Automatic' },
                { value: 'eco', label: 'Energy-saving' },
                { value: 'manual', label: 'Manual' },
              ]}
            />
          </Field>
          <Field label="Lights switch on below" htmlFor="set-lux" hint="Ambient light threshold.">
            <NumberField id="set-lux" value={cfg.daylightLux} min={200} max={3000} step={100} onChange={(v) => update({ daylightLux: v })} suffix=" lx" />
          </Field>
          <Field label="Energy-saving minimum brightness" htmlFor="set-eco">
            <NumberField id="set-eco" value={cfg.ecoMinBrightness} min={0} max={60} step={5} onChange={(v) => update({ ecoMinBrightness: v })} suffix=" %" />
          </Field>
          <Field label="Stay bright after motion for" htmlFor="set-hold">
            <NumberField id="set-hold" value={cfg.motionHoldSeconds} min={3} max={30} onChange={(v) => update({ motionHoldSeconds: v })} suffix=" s" />
          </Field>
          <Field label="LED rated power" htmlFor="set-watts">
            <NumberField id="set-watts" value={cfg.ratedWatts} min={30} max={200} step={10} onChange={(v) => update({ ratedWatts: v })} suffix=" W" />
          </Field>
          <Field label="Baseline (conventional lamp) power" htmlFor="set-base" hint="Used to estimate energy saved.">
            <NumberField id="set-base" value={cfg.baselineWatts} min={50} max={400} step={10} onChange={(v) => update({ baselineWatts: v })} suffix=" W" />
          </Field>
        </Section>

        <Section title="Notifications" subtitle="Pop-up alerts for new events" icon={Bell}>
          <Switch checked={cfg.notifyToasts} onChange={(v) => update({ notifyToasts: v })} label="Show alert pop-ups" description="Toast notifications for new events at or above the chosen severity." />
          <Field label="Minimum severity" htmlFor="set-sev">
            <Select
              id="set-sev"
              value={cfg.notifyMinSeverity}
              onChange={(v) => update({ notifyMinSeverity: v as SettingsT['notifyMinSeverity'] })}
              options={[
                { value: 'medium', label: 'Medium and above' },
                { value: 'high', label: 'High and above' },
                { value: 'critical', label: 'Critical only' },
              ]}
            />
          </Field>
        </Section>

        <Section title="Network" subtitle="Simulated gateway behaviour" icon={Router}>
          <Switch checked={cfg.bufferDuringOutage} onChange={(v) => update({ bufferDuringOutage: v })} label="Buffer messages during gateway outages" description="Off = messages fail while their gateway is offline." />
        </Section>

        <Section title="Appearance" subtitle="Light or dark interface" icon={Palette}>
          <Segmented
            label="Theme"
            value={cfg.theme}
            onChange={(v) => update({ theme: v })}
            options={[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor },
            ]}
          />
        </Section>

        <Section title="Data retention & reset" subtitle="History is kept in memory for this tab" icon={Database}>
          <Field label="Keep chart history for" htmlFor="set-ret">
            <Select
              id="set-ret"
              value={String(cfg.historyMinutes)}
              onChange={(v) => update({ historyMinutes: Number(v) })}
              options={[
                { value: '15', label: '15 simulated minutes' },
                { value: '30', label: '30 simulated minutes' },
                { value: '60', label: '60 simulated minutes' },
                { value: '120', label: '120 simulated minutes' },
              ]}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setConfirm('history')}>
              Clear history
            </Button>
            <Button variant="secondary" onClick={() => setConfirm('sim')}>
              Reset simulation
            </Button>
            <Button variant="secondary" onClick={() => setConfirm('settings')}>
              Restore default settings
            </Button>
            <Button variant="ghost" onClick={() => setOnboarding(true)}>
              Show welcome guide
            </Button>
          </div>
        </Section>
      </div>

      <ConfirmDialog
        open={confirm === 'settings'}
        title="Restore default settings?"
        body="Every setting on this page returns to its default value."
        confirmLabel="Restore defaults"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          resetSettings();
          toast({ title: 'Default settings restored', tone: 'success' });
        }}
      />
      <ConfirmDialog
        open={confirm === 'history'}
        title="Clear simulation history?"
        body="Charts, the event log, resolved incidents and completed tasks are cleared. The simulation keeps running."
        confirmLabel="Clear history"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          clearHistory();
          toast({ title: 'History cleared', tone: 'success' });
        }}
      />
      <ConfirmDialog
        open={confirm === 'sim'}
        title="Reset the simulation?"
        body="Vehicles, signals, weather, sensors, incidents and history return to the initial scenario."
        confirmLabel="Reset simulation"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          reset();
          toast({ title: 'Simulation reset', tone: 'success' });
        }}
      />
    </>
  );
}
