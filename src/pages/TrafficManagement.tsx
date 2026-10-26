import { useMemo } from 'react';
import { ArrowRight, Hand, Radio, Repeat, Sparkles, TrafficCone, Zap } from 'lucide-react';
import { useStore, useSim } from '../store/simStore';
import { quick } from '../store/quickActions';
import { JUNCTIONS, NODE_MAP } from '../sim/network';
import { AXIS_LABEL, lightFor, phaseLabel, requestPhaseSwitch, setSignalMode, OTHER } from '../sim/signals';
import { simClockAt } from '../sim/format';
import { Badge, Button, Card, CardHeader, EmptyState, InfoTip, Meter, PageHeader, SimNote, Switch, densityTone, cx } from '../components/ui';
import type { Axis, JunctionStats, LightColor, Settings, SignalState } from '../sim/types';

const LIGHT_HEX: Record<LightColor, string> = { green: '#1e8e3e', yellow: '#f9ab00', red: '#d93025' };

function recommendation(st: JunctionStats, sig: SignalState, cfg: Settings): { text: string; tone: 'good' | 'warn' | 'bad' | 'primary' | 'neutral' } {
  if (!st.sensorOnline) return { text: `Restore VDS-${sig.junctionId} — junction is running the fixed-time fallback`, tone: 'bad' };
  if (sig.priority) return { text: `Holding ${AXIS_LABEL[sig.priority.axis]} green for ${sig.priority.vehicleId}`, tone: 'primary' };
  if (sig.mode === 'manual') return { text: 'Manual control — press “Switch phase” when the waiting approach needs to move', tone: 'primary' };
  const heavier: Axis = st.queue.NS >= st.queue.EW ? 'NS' : 'EW';
  if (st.density >= cfg.congestionThreshold)
    return { text: `Congested — extend ${AXIS_LABEL[heavier]} green (${st.queue[heavier]} queued)${cfg.adaptive ? '' : '; enable adaptive control'}`, tone: 'bad' };
  const other = OTHER[heavier];
  if (st.queue[heavier] - st.queue[other] >= 4) return { text: `Give the next green to ${AXIS_LABEL[heavier]} (${st.queue[heavier]} waiting)`, tone: 'warn' };
  return { text: 'No action needed — traffic is flowing', tone: 'good' };
}

function SignalHead({ color, label }: { color: LightColor; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex flex-col gap-1 rounded-lg bg-[#202124] p-1.5" aria-hidden>
        {(['red', 'yellow', 'green'] as LightColor[]).map((c) => (
          <span key={c} className="size-3 rounded-full transition-colors duration-200" style={{ background: c === color ? LIGHT_HEX[c] : '#3c4043', boxShadow: c === color ? `0 0 8px ${LIGHT_HEX[c]}` : undefined }} />
        ))}
      </div>
      <div className="text-xs">
        <p className="font-medium text-ink">{label}</p>
        <p className="text-ink-3 capitalize">{color}</p>
      </div>
    </div>
  );
}

function JunctionCard({ id }: { id: string }) {
  const node = NODE_MAP[id];
  const st = useSim((s) => s.junctionStats[id]);
  const sig = useSim((s) => s.signals[id]);
  const cfg = useStore((s) => s.settings);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const rec = recommendation(st, sig, cfg);
  const isGreen = sig.phase.endsWith('GREEN');
  const held = sig.mode === 'manual' && isGreen && !sig.priority;
  const progress = held ? 100 : Math.max(0, Math.min(100, (sig.remaining / Math.max(0.1, sig.phaseDuration)) * 100));
  const controlBadge =
    sig.control === 'adaptive'
      ? { tone: 'good' as const, label: 'Adaptive' }
      : sig.control === 'fixed'
        ? { tone: 'neutral' as const, label: 'Fixed cycle' }
        : sig.control === 'fallback'
          ? { tone: 'warn' as const, label: 'Fallback' }
          : sig.control === 'manual'
            ? { tone: 'violet' as const, label: 'Manual' }
            : { tone: 'primary' as const, label: 'Priority' };

  return (
    <Card className={cx('flex flex-col', sig.mode === 'manual' && 'ring-2 ring-violet/60')}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-3">Junction {id}</p>
          <h3 className="truncate text-base font-semibold text-ink">{node.name}</h3>
        </div>
        <Badge tone={controlBadge.tone}>{controlBadge.label}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 px-5 pt-3">
        <Stat label="Vehicles" value={st.vehicles} />
        <Stat label="Avg. wait" value={`${st.avgWait.toFixed(0)} s`} />
        <Stat label="Queue N–S / E–W" value={`${st.queue.NS} / ${st.queue.EW}`} />
      </div>
      <div className="px-5 pt-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-ink-2">Traffic density</span>
          <span className="font-medium text-ink tabular">{st.density} %</span>
        </div>
        <Meter value={st.density} tone={densityTone(st.density, cfg.congestionThreshold)} label={`Density at junction ${id}`} />
      </div>

      <div className="mx-5 mt-4 rounded-xl bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-3">
          <SignalHead color={lightFor(sig, 'NS')} label="North–South" />
          <SignalHead color={lightFor(sig, 'EW')} label="East–West" />
          <div className="text-right">
            <p className="text-xl font-semibold text-ink tabular">{held ? 'Hold' : `${Math.max(0, Math.ceil(sig.remaining))} s`}</p>
            <p className="text-[11px] text-ink-3">{phaseLabel(sig.phase)}</p>
          </div>
        </div>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-ink-3 transition-[width] duration-150" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-ink-3 tabular">
          Planned green · N–S {sig.plannedGreen.NS} s · E–W {sig.plannedGreen.EW} s · cycle {sig.cycles}
        </p>
      </div>

      <div className="flex items-start gap-2 px-5 pt-3 text-[13px]">
        <Sparkles size={15} className={cx('mt-0.5 shrink-0', rec.tone === 'bad' ? 'text-bad' : rec.tone === 'warn' ? 'text-warn' : rec.tone === 'good' ? 'text-good' : 'text-primary')} aria-hidden />
        <p className="text-ink-2">
          <span className="font-medium text-ink">Recommended: </span>
          {rec.text}
        </p>
      </div>
      <div className="flex items-center gap-2 px-5 pt-2 text-xs text-ink-3">
        <Radio size={13} aria-hidden /> VDS-{id}:{' '}
        <span className={st.sensorOnline ? 'font-medium text-good' : 'font-medium text-bad'}>{st.sensorOnline ? 'online, reporting every 2 s' : 'offline — no live data'}</span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 mt-4">
        <Switch
          checked={sig.mode === 'manual'}
          onChange={(v) => {
            act((s) => setSignalMode(s, id, v ? 'manual' : 'auto'));
            toast({ title: v ? `Manual control at Junction ${id}` : `Junction ${id} back to automatic`, message: v ? 'The current green is held until you switch phase.' : undefined, tone: 'info' });
          }}
          label={<span className="text-[13px]">Manual demo mode</span>}
        />
        <span className="ml-auto" />
        {sig.mode === 'manual' ? (
          <Button size="sm" variant="tonal" icon={Repeat} disabled={!isGreen || sig.switchRequested} onClick={() => act((s) => requestPhaseSwitch(s, id))}>
            {sig.switchRequested ? 'Switching…' : 'Switch phase'}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" icon={Zap} onClick={() => quick.generateTraffic(id)}>
            Surge traffic
          </Button>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line px-2.5 py-2">
      <p className="truncate text-[11px] text-ink-3">{label}</p>
      <p className="text-base font-semibold text-ink tabular">{value}</p>
    </div>
  );
}

export function TrafficManagement() {
  const cfg = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const toast = useStore((s) => s.toast);
  const navigate = useStore((s) => s.navigate);
  const adjustments = useSim((s) => s.adjustments);
  const startClock = useSim((s) => s.startClock);
  const recent = useMemo(() => adjustments.slice(0, 12), [adjustments]);

  return (
    <>
      <PageHeader
        title="Traffic Management"
        description="Simulated adaptive traffic signals at six junctions. Each junction alternates between North–South and East–West phases with yellow and all-red clearance, so conflicting approaches are never green together."
        icon={TrafficCone}
        actions={
          <Button variant="secondary" icon={Zap} onClick={() => quick.generateTraffic('B')}>
            Trigger congestion at B
          </Button>
        }
      />

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="flex flex-col gap-4">
            <Switch
              checked={cfg.adaptive}
              onChange={(v) => {
                update({ adaptive: v });
                toast({ title: v ? 'Adaptive signals enabled' : 'Adaptive signals disabled', message: v ? 'Green times now follow the queues measured by the sensors.' : `All junctions now use a fixed ${cfg.fixedGreen} s green.`, tone: 'success' });
              }}
              label="Adaptive traffic management"
              description={cfg.adaptive ? 'Enabled — green time adapts to measured demand.' : `Disabled — every junction runs a fixed ${cfg.fixedGreen} s green cycle.`}
            />
            <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
              <Param label="Min green" value={`${cfg.minGreen} s`} />
              <Param label="Max green" value={`${cfg.maxGreen} s`} />
              <Param label="Per vehicle" value={`${cfg.secondsPerVehicle} s`} />
              <Param label="Fixed green" value={`${cfg.fixedGreen} s`} />
            </div>
            <Button variant="ghost" size="sm" className="self-start" iconRight={ArrowRight} onClick={() => navigate('settings')}>
              Change limits in Settings
            </Button>
          </div>
          <div className="rounded-xl bg-surface-2 p-4 text-[13px] leading-6 text-ink-2">
            <p className="mb-1 font-semibold text-ink">How the simplified adaptive algorithm works</p>
            <ol className="list-decimal space-y-0.5 pl-5">
              <li>
                When an approach turns green, its demand = <b>queued vehicles + ½ × other approaching vehicles</b> (from the junction's vehicle sensor).
              </li>
              <li>
                Green time = <b>min green + {cfg.secondsPerVehicle} s × demand</b>, kept between {cfg.minGreen} s and {cfg.maxGreen} s.
              </li>
              <li>If the green approach empties while the other side has 2+ vehicles waiting, the green ends early (after the minimum).</li>
              <li>Yellow (3 s) and all-red (1.5 s) always run between phases. A junction with an offline sensor falls back to the fixed cycle.</li>
            </ol>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {JUNCTIONS.map((j) => (
          <JunctionCard key={j.id} id={j.id} />
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recent timing changes"
          subtitle="Before → after green times chosen by the adaptive controller"
          icon={Hand}
          actions={<InfoTip text="A change is listed when the controller's new green time differs from the previous plan for that approach by 3 s or more." />}
        />
        {recent.length === 0 ? (
          <EmptyState title="No timing changes yet" body={cfg.adaptive ? 'Start the simulation or trigger congestion to see the controller react.' : 'Adaptive control is disabled, so timings stay fixed.'} />
        ) : (
          <div className="overflow-x-auto px-2 pb-3">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="text-xs text-ink-3">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Junction</th>
                  <th className="px-3 py-2 font-medium">Approach</th>
                  <th className="px-3 py-2 font-medium">Green before → after</th>
                  <th className="px-3 py-2 font-medium">Demand</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="px-3 py-2.5 text-ink-3 tabular">{simClockAt({ startClock }, a.t)}</td>
                    <td className="px-3 py-2.5 font-medium text-ink">
                      {a.junctionId} · {NODE_MAP[a.junctionId].name}
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{AXIS_LABEL[a.axis]}</td>
                    <td className="px-3 py-2.5 tabular">
                      <span className="text-ink-3">{a.before} s</span> → <span className={cx('font-semibold', a.after > a.before ? 'text-primary-ink' : 'text-ink')}>{a.after} s</span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2 tabular">{a.demand}</td>
                    <td className="px-3 py-2.5 text-ink-2">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 pb-4">
          <SimNote>Simulated signal control — no real traffic lights are changed.</SimNote>
        </div>
      </Card>
    </>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-[11px] text-ink-3">{label}</p>
      <p className="font-semibold text-ink tabular">{value}</p>
    </div>
  );
}
