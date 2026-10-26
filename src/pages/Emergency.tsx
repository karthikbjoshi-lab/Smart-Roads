import { useMemo, useState } from 'react';
import { Ambulance, Flame, Route, ShieldCheck, Square, Send, TrafficCone, History, type LucideIcon } from 'lucide-react';
import { useStore, useSim } from '../store/simStore';
import { NODES, NODE_MAP } from '../sim/network';
import { planRoute } from '../sim/routing';
import { endEmergencyDemo, EMERGENCY_LABEL, BASE_SPEED } from '../sim/vehicles';
import { AXIS_LABEL, lightFor, phaseLabel } from '../sim/signals';
import { fmtDuration, simClockAt } from '../sim/format';
import { quick } from '../store/quickActions';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, PageHeader, Segmented, Select, SimNote, Switch, cx } from '../components/ui';
import { RoadMap } from '../components/map/RoadMap';
import type { EmergencyInfo, EmergencyKind } from '../sim/types';

const KIND_ICON: Record<EmergencyKind, LucideIcon> = { ambulance: Ambulance, fire: Flame, police: ShieldCheck };
const DEFAULT_ROUTE: Record<EmergencyKind, [string, string]> = { ambulance: ['TECH', 'HOSPITAL'], fire: ['FIRE', 'C'], police: ['POLICE', 'D'] };
const NODE_OPTIONS = NODES.map((n) => ({ value: n.id, label: n.kind === 'junction' ? `Junction ${n.id} · ${n.name}` : n.name, group: n.kind === 'junction' ? 'Junctions' : 'Entry points' }));

function RouteChips({ nodes, current }: { nodes: string[]; current?: string | null }) {
  const idx = current ? nodes.indexOf(current) : -1;
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {nodes.map((n, i) => {
        const node = NODE_MAP[n];
        const passed = idx >= 0 && i < idx;
        const isCur = i === idx;
        return (
          <li key={`${n}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-ink-3" aria-hidden>→</span>}
            <span className={cx('rounded-md px-1.5 py-0.5 font-medium', isCur ? 'bg-primary text-white dark:text-[#0b1a33]' : passed ? 'bg-surface-2 text-ink-3 line-through' : 'bg-surface-2 text-ink')}>
              {node.kind === 'junction' ? node.id : node.short}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function VehicleCard({ e, startClock }: { e: EmergencyInfo; startClock: number }) {
  const Icon = KIND_ICON[e.kind];
  const signals = useSim((s) => s.signals);
  const sig = e.priorityAt ? signals[e.priorityAt] : null;
  return (
    <Card as="article" className="p-4">
      <div className="flex items-start gap-3">
        <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', e.kind === 'police' ? 'bg-primary-soft text-primary-ink' : 'bg-bad-soft text-bad')}>
          <Icon size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{e.label}</h3>
            <Badge tone={e.status === 'en_route' ? 'primary' : e.status === 'arrived' ? 'good' : 'neutral'}>{e.status === 'en_route' ? 'En route' : e.status === 'arrived' ? 'Arrived' : 'Stood down'}</Badge>
            {e.status === 'en_route' && (sig ? <Badge tone="good">Priority active at {e.priorityAt}</Badge> : <Badge tone="neutral">Awaiting next junction</Badge>)}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-4">
            <Item label="Type" value={EMERGENCY_LABEL[e.kind]} />
            <Item label="Current location" value={e.status === 'en_route' ? e.location : NODE_MAP[e.destination].name} />
            <Item label="Destination" value={NODE_MAP[e.destination].name} />
            <Item label={e.status === 'arrived' ? 'Journey time' : 'Est. arrival'} value={e.status === 'arrived' && e.arrivedAt !== null ? fmtDuration(e.arrivedAt - e.spawnedAt) : e.status === 'en_route' ? `≈ ${fmtDuration(e.eta)}` : '—'} />
          </dl>
          <div className="mt-2.5">
            <RouteChips nodes={e.routeNodes} current={e.status === 'en_route' ? e.nextJunction : null} />
          </div>
          {sig && e.status === 'en_route' && (
            <p className="mt-2 text-xs text-ink-2">
              Junction {e.priorityAt}: current phase <b>{phaseLabel(sig.phase)}</b> → requested <b>{AXIS_LABEL[sig.priority?.axis ?? 'NS']} green</b>
            </p>
          )}
          <p className="mt-1.5 text-xs text-ink-3">
            Dispatched {simClockAt({ startClock }, e.spawnedAt)} · priority at {e.priorityGranted.length ? e.priorityGranted.join(', ') : 'none yet'} · waited {e.delay.toFixed(0)} s · stops {e.stops}
            {e.replans ? ` · re-routed ${e.replans}×` : ''}
          </p>
        </div>
      </div>
    </Card>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="truncate font-medium text-ink">{value}</dd>
    </div>
  );
}

export function Emergency() {
  const [kind, setKind] = useState<EmergencyKind>('ambulance');
  const [origin, setOrigin] = useState(DEFAULT_ROUTE.ambulance[0]);
  const [dest, setDest] = useState(DEFAULT_ROUTE.ambulance[1]);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const emergencies = useSim((s) => s.emergencies);
  const roadStats = useSim((s) => s.roadStats);
  const incidents = useSim((s) => s.incidents);
  const signals = useSim((s) => s.signals);
  const startClock = useSim((s) => s.startClock);
  const priority = useStore((s) => s.settings.emergencyPriority);
  const update = useStore((s) => s.updateSettings);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);

  const preview = useMemo(() => (origin === dest ? null : planRoute({ roadStats, incidents }, origin, dest)), [origin, dest, roadStats, incidents]);
  const active = emergencies.filter((e) => e.status === 'en_route');
  const done = emergencies.filter((e) => e.status !== 'en_route');
  const error = origin === dest ? 'Start point and destination must be different.' : !preview ? 'No open route — a road on the way may be blocked.' : null;

  return (
    <>
      <PageHeader
        title="Emergency Response"
        description="A demonstration of how a connected emergency vehicle could receive signal priority. The route is calculated with Dijkstra's algorithm (busy and blocked roads are avoided), and each junction on the route gives the vehicle a green light as it approaches."
        icon={Ambulance}
        actions={
          <Button variant="secondary" icon={Square} disabled={!active.length} onClick={() => setConfirmEnd(true)}>
            End demonstration
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Dispatch a vehicle" subtitle="Simulation only — no real services are contacted" icon={Send} />
            <div className="flex flex-col gap-4 px-5 pb-5">
              <Segmented
                label="Vehicle type"
                value={kind}
                onChange={(k) => {
                  setKind(k);
                  setOrigin(DEFAULT_ROUTE[k][0]);
                  setDest(DEFAULT_ROUTE[k][1]);
                }}
                options={[
                  { value: 'ambulance', label: 'Ambulance', icon: Ambulance },
                  { value: 'fire', label: 'Fire engine', icon: Flame },
                  { value: 'police', label: 'Police', icon: ShieldCheck },
                ]}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Field label="Start point" htmlFor="em-from">
                  <Select id="em-from" value={origin} onChange={setOrigin} options={NODE_OPTIONS} />
                </Field>
                <Field label="Destination" htmlFor="em-to">
                  <Select id="em-to" value={dest} onChange={setDest} options={NODE_OPTIONS} />
                </Field>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-3">
                  <Route size={13} aria-hidden /> Planned route (Dijkstra, congestion-aware)
                </p>
                {preview ? (
                  <>
                    <RouteChips nodes={preview.nodes} />
                    <p className="mt-1.5 text-xs text-ink-2 tabular">
                      {Math.round(preview.length)} m · ≈ {fmtDuration(preview.length / BASE_SPEED[kind] + (preview.nodes.length - 2) * (priority ? 1.5 : 9))} with {priority ? 'priority' : 'normal signals'}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-bad">{error}</p>
                )}
              </div>
              <Switch
                checked={priority}
                onChange={(v) => {
                  update({ emergencyPriority: v });
                  toast({ title: v ? 'Emergency priority enabled' : 'Emergency priority disabled', message: v ? 'Junctions will turn green for approaching emergency vehicles.' : 'Emergency vehicles now wait at red signals like other traffic.', tone: 'info' });
                }}
                label="Emergency signal priority"
                description="Send a priority request to each junction on the route"
              />
              <Button variant="primary" icon={KIND_ICON[kind]} disabled={!!error} onClick={() => quick.emergency(kind, origin, dest)}>
                Dispatch {EMERGENCY_LABEL[kind].toLowerCase()}
              </Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="Junction priority status" icon={TrafficCone} />
            <ul className="divide-y divide-line px-5 pb-3">
              {Object.values(signals).map((sig) => (
                <li key={sig.junctionId} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">
                      {sig.junctionId} · {NODE_MAP[sig.junctionId].name}
                    </span>
                    <span className="block text-xs text-ink-3">{phaseLabel(sig.phase)}</span>
                  </span>
                  {sig.priority ? (
                    <Badge tone={lightFor(sig, sig.priority.axis) === 'green' ? 'good' : 'primary'}>
                      {sig.priority.vehicleId}: {lightFor(sig, sig.priority.axis) === 'green' ? 'green granted' : 'switching'}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Normal</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Route view" subtitle={active.length ? 'Live route of the active vehicle' : 'Preview of the planned route'} icon={Route} />
            <div className="px-3 pb-3">
              <RoadMap height="clamp(280px, 40vw, 460px)" routeNodes={active.length ? undefined : (preview?.nodes ?? null)} layers={{ lights: false }} />
            </div>
          </Card>
          <div className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold text-ink">Active vehicles ({active.length})</h2>
            {active.length === 0 ? (
              <Card>
                <EmptyState icon={Ambulance} title="No emergency vehicles on the road" body="Choose a vehicle, start point and destination, then press Dispatch." />
              </Card>
            ) : (
              active.map((e) => <VehicleCard key={e.vehicleId} e={e} startClock={startClock} />)
            )}
          </div>
          {done.length > 0 && (
            <Card>
              <CardHeader title="Completed runs" icon={History} />
              <div className="overflow-x-auto px-2 pb-3">
                <table className="w-full min-w-[560px] text-left text-[13px]">
                  <thead>
                    <tr className="text-xs text-ink-3">
                      <th className="px-3 py-2 font-medium">Vehicle</th>
                      <th className="px-3 py-2 font-medium">Route</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                      <th className="px-3 py-2 font-medium">Journey</th>
                      <th className="px-3 py-2 font-medium">Waiting</th>
                      <th className="px-3 py-2 font-medium">Priority junctions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.slice(0, 10).map((e) => (
                      <tr key={e.vehicleId} className="border-t border-line">
                        <td className="px-3 py-2.5 font-medium text-ink">{e.label}</td>
                        <td className="px-3 py-2.5 text-ink-2">
                          {NODE_MAP[e.origin].short} → {NODE_MAP[e.destination].short}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={e.status === 'arrived' ? 'good' : 'neutral'}>{e.status === 'arrived' ? 'Arrived' : 'Stood down'}</Badge>
                        </td>
                        <td className="px-3 py-2.5 tabular">{e.arrivedAt !== null ? fmtDuration(e.arrivedAt - e.spawnedAt) : '—'}</td>
                        <td className="px-3 py-2.5 tabular">{e.delay.toFixed(0)} s</td>
                        <td className="px-3 py-2.5 text-ink-2">{e.priorityGranted.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 pb-4">
                <SimNote>Tip: dispatch the same route with priority on and off to compare waiting time in this illustrative simulation.</SimNote>
              </div>
            </Card>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmEnd}
        title="End the emergency demonstration?"
        body="All active emergency vehicles are removed and every junction returns to normal signal operation."
        confirmLabel="End demonstration"
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() => {
          setConfirmEnd(false);
          const n = act((s) => endEmergencyDemo(s));
          toast({ title: 'Demonstration ended', message: `${n} vehicle(s) stood down. Normal signal operation resumed.`, tone: 'success' });
        }}
      />
    </>
  );
}
