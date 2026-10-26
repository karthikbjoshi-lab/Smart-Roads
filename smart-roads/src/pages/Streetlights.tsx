import { useMemo, useState } from 'react';
import { Lightbulb, LightbulbOff, Moon, Sun, Sunrise, Sunset, Leaf, Hand, Sparkles, Zap, Activity } from 'lucide-react';
import { CartesianGrid, Line, LineChart, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { useStore, useSim } from '../store/simStore';
import { ROAD_MAP } from '../sim/network';
import { lightingTotals } from '../sim/lighting';
import { setClock } from '../sim/weather';
import { fmtEnergy, nowClock } from '../sim/format';
import { Badge, Button, Card, CardHeader, InfoTip, Meter, MiniStat, PageHeader, Segmented, SimNote, Switch, cx } from '../components/ui';
import { ChartFrame, ChartTooltip, LegendRow, RangePicker, axisProps, gridProps, useClockFormatter, useHistory, type RangeKey } from '../components/charts';
import type { LightMode, SimState } from '../sim/types';

const MODE_TEXT: Record<LightMode, string> = {
  auto: 'Off in daylight. After dark, brightness follows how dark it is (30–80 %) and jumps to 100 % for a few seconds when a vehicle or pedestrian is detected.',
  eco: 'Off in daylight. After dark, lights idle at the minimum brightness and only brighten to 100 % when motion is detected — the biggest energy saving.',
  manual: 'The operator controls each light directly with the on/off switch and brightness slider.',
};

const TIMES: Array<{ label: string; hour: number; icon: typeof Sun }> = [
  { label: 'Day 12:00', hour: 12, icon: Sun },
  { label: 'Dusk 18:20', hour: 18.33, icon: Sunset },
  { label: 'Night 21:00', hour: 21, icon: Moon },
  { label: 'Dawn 06:15', hour: 6.25, icon: Sunrise },
];

export function Streetlights() {
  const lights = useSim((s) => s.streetlights);
  const devices = useSim((s) => s.devices);
  const lux = useSim((s) => s.weather.ambientLux);
  const clock = useSim((s) => nowClock(s, false));
  const cfg = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const [range, setRange] = useState<RangeKey>('all');
  const history = useHistory(range);
  const fmt = useClockFormatter();
  const totals = useMemo(() => lightingTotals({ streetlights: lights } as SimState), [lights]);
  const dark = lux < cfg.daylightLux;
  const savedPct = totals.baseline > 0 ? (totals.saved / totals.baseline) * 100 : 0;

  const setAllManual = (on: boolean) =>
    act((s) => {
      for (const l of s.streetlights) l.manualOn = on;
    });

  return (
    <>
      <PageHeader
        title="Smart Streetlights"
        description="Twelve simulated LED streetlights with motion sensing and ambient-light control. Energy figures are simulated estimates, not measured electrical consumption."
        icon={Lightbulb}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MiniStat label="Total streetlights" value={totals.total} />
        <MiniStat label="Active now" value={totals.active} hint={dark ? 'dark conditions' : 'daylight'} />
        <MiniStat label="Power now (est.)" value={`${Math.round(totals.power)} W`} />
        <MiniStat label="Energy used (est.)" value={fmtEnergy(totals.energy)} hint="this run" />
        <MiniStat label="Saved vs baseline (est.)" value={fmtEnergy(totals.saved)} tone={totals.saved >= 0 ? 'good' : 'bad'} hint={totals.baseline > 0 ? `${savedPct.toFixed(0)} % of ${fmtEnergy(totals.baseline)}` : 'no dark period yet'} />
        <MiniStat label="Ambient light" value={`${Math.round(lux).toLocaleString()} lx`} hint={`threshold ${cfg.daylightLux.toLocaleString()} lx`} tone={dark ? 'warn' : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Operating mode" subtitle="Applies to every light" icon={Sparkles} />
          <div className="flex flex-col gap-3 px-5 pb-5">
            <Segmented
              label="Lighting mode"
              value={cfg.lightingMode}
              onChange={(m) => {
                update({ lightingMode: m });
                toast({ title: `Streetlights: ${m === 'auto' ? 'automatic' : m === 'eco' ? 'energy-saving' : 'manual'} mode`, tone: 'success' });
              }}
              options={[
                { value: 'auto', label: 'Automatic', icon: Sparkles },
                { value: 'eco', label: 'Energy-saving', icon: Leaf },
                { value: 'manual', label: 'Manual', icon: Hand },
              ]}
            />
            <p className="text-[13px] leading-5 text-ink-2">{MODE_TEXT[cfg.lightingMode]}</p>
            {cfg.lightingMode === 'eco' && (
              <div>
                <label htmlFor="eco-min" className="text-xs font-medium text-ink-2">
                  Minimum brightness: {cfg.ecoMinBrightness} %
                </label>
                <input id="eco-min" type="range" min={0} max={60} step={5} value={cfg.ecoMinBrightness} onChange={(e) => update({ ecoMinBrightness: Number(e.target.value) })} className="mt-1 w-full" />
              </div>
            )}
            {cfg.lightingMode === 'manual' && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={Lightbulb} onClick={() => setAllManual(true)}>
                  All on
                </Button>
                <Button size="sm" variant="secondary" icon={LightbulbOff} onClick={() => setAllManual(false)}>
                  All off
                </Button>
              </div>
            )}
            <p className="text-xs text-ink-3">
              Motion hold time {cfg.motionHoldSeconds} s · LED rated {cfg.ratedWatts} W · baseline lamp {cfg.baselineWatts} W (change in Settings)
            </p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Virtual time of day" subtitle={`Simulated clock ${clock} · ambient light ${Math.round(lux).toLocaleString()} lx`} icon={Sun} actions={<InfoTip text="Ambient light comes from a daylight curve for the simulated time, reduced by cloud, rain or fog." />} />
          <div className="flex flex-col gap-3 px-5 pb-5">
            <div className="flex flex-wrap gap-2">
              {TIMES.map((t) => (
                <Button
                  key={t.label}
                  size="sm"
                  variant="secondary"
                  icon={t.icon}
                  onClick={() => {
                    act((s) => setClock(s, t.hour));
                    toast({ title: `Virtual time set to ${t.label.split(' ')[1]}`, tone: 'info' });
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-ink-3">
                <span>Darkness level</span>
                <span className="tabular">{dark ? `${Math.round(((cfg.daylightLux - lux) / cfg.daylightLux) * 100)} %` : 'Daylight — lights off'}</span>
              </div>
              <Meter value={dark ? ((cfg.daylightLux - lux) / cfg.daylightLux) * 100 : 0} tone="warn" label="Darkness level" />
            </div>
            <p className="text-xs leading-5 text-ink-3">Tip: “Low light” or “Heavy rain” on the weather panel also darkens the sky and switches lights on during the day.</p>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {lights.map((l) => {
          const ctrl = devices.find((d) => d.ref === l.id);
          const online = ctrl?.status === 'online';
          return (
            <Card key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cx('grid size-9 shrink-0 place-items-center rounded-full', l.brightness > 1 ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-3')}>
                    {l.brightness > 1 ? <Lightbulb size={17} aria-hidden /> : <LightbulbOff size={17} aria-hidden />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{l.id}</p>
                    <p className="truncate text-xs text-ink-3">{ROAD_MAP[l.roadId].name}</p>
                  </div>
                </div>
                <Badge tone={l.failSafe ? 'bad' : online ? 'good' : 'neutral'}>{l.failSafe ? 'Fail-safe' : online ? 'Connected' : 'Offline'}</Badge>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Meter value={l.brightness} tone="warn" label={`${l.id} brightness`} />
                <span className="w-11 text-right text-sm font-semibold text-ink tabular">{Math.round(l.brightness)} %</span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-ink-3">Mode</dt>
                  <dd className="font-medium text-ink">{l.failSafe ? 'Fail-safe' : cfg.lightingMode === 'auto' ? 'Auto' : cfg.lightingMode === 'eco' ? 'Eco' : 'Manual'}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Power</dt>
                  <dd className="font-medium text-ink tabular">{l.powerW.toFixed(0)} W</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Energy</dt>
                  <dd className="font-medium text-ink tabular">{fmtEnergy(l.energyWh)}</dd>
                </div>
              </dl>
              <p className={cx('mt-2 inline-flex items-center gap-1.5 text-xs', l.motion ? 'font-medium text-primary-ink' : 'text-ink-3')}>
                <Activity size={13} aria-hidden /> {l.motion ? `Motion detected (${l.motionSource})` : 'No motion'}
              </p>
              {cfg.lightingMode === 'manual' && !l.failSafe && (
                <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                  <Switch
                    checked={l.manualOn}
                    onChange={(v) =>
                      act((s) => {
                        const x = s.streetlights.find((y) => y.id === l.id);
                        if (x) x.manualOn = v;
                      })
                    }
                    label={<span className="text-[13px]">{l.manualOn ? 'On' : 'Off'}</span>}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={l.manualBrightness}
                    aria-label={`${l.id} brightness`}
                    disabled={!l.manualOn}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      act((s) => {
                        const x = s.streetlights.find((y) => y.id === l.id);
                        if (x) x.manualBrightness = v;
                      });
                    }}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader title="Energy estimate" subtitle="Cumulative, all 12 lights · simulated estimate" icon={Zap} actions={<RangePicker value={range} onChange={setRange} />} />
        <div className="px-5 pb-5">
          <LegendRow
            className="mb-2"
            items={[
              { label: 'Smart LED lights (estimated)', color: 'var(--s-1)' },
              { label: `Baseline: conventional ${cfg.baselineWatts} W lamps, full power when dark`, color: 'var(--chart-axis)', dashed: true },
            ]}
          />
          <ChartFrame height={240} empty={history.length < 2}>
            <LineChart data={history} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" tickFormatter={fmt} {...axisProps} minTickGap={40} />
              <YAxis {...axisProps} width={52} />
              <RTooltip content={<ChartTooltip fmtLabel={fmt} unit=" Wh" digits={1} />} />
              <Line type="monotone" dataKey="energyWh" name="Smart LED" stroke="var(--s-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="baselineWh" name="Baseline" stroke="var(--chart-axis)" strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ChartFrame>
          <div className="mt-3">
            <SimNote>Illustrative comparison only — not a measured or guaranteed energy saving.</SimNote>
          </div>
        </div>
      </Card>
    </>
  );
}
