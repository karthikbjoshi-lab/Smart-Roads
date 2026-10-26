// Detail panel for a selected junction or road segment.
import { useMemo } from 'react';
import { ArrowRight, Car, Clock, Gauge, Radio, TrafficCone, X, MousePointerClick, Activity, Droplets } from 'lucide-react';
import { useStore, useSim } from '../../store/simStore';
import { NODE_MAP, ROAD_MAP, ROADS, nodeLabel } from '../../sim/network';
import { AXIS_LABEL, lightFor, phaseLabel } from '../../sim/signals';
import { INCIDENT_LABEL, incidentWhere } from '../../sim/incidents';
import { Badge, Button, EmptyState, IconButton, Meter, MiniStat, SeverityBadge, densityTone, healthTone } from '../ui';
import { CONGESTION_COLOR } from './RoadMap';
import type { Axis, LightColor } from '../../sim/types';

const LIGHT_TONE: Record<LightColor, 'good' | 'warn' | 'bad'> = { green: 'good', yellow: 'warn', red: 'bad' };
const CONGESTION_TEXT = { free: 'Free-flowing', moderate: 'Moderate', heavy: 'Heavy congestion', blocked: 'Blocked' } as const;

export function Inspector({ onClose, compact }: { onClose?: () => void; compact?: boolean }) {
  const selection = useStore((st) => st.selection);
  if (!selection)
    return (
      <EmptyState
        icon={MousePointerClick}
        title="Select a junction or road"
        body="Click any junction (A–F) or road segment on the map to see its live simulated sensor readings, signal phase and incidents."
      />
    );
  return selection.kind === 'junction' ? <JunctionPanel id={selection.id} onClose={onClose} compact={compact} /> : <RoadPanel id={selection.id} onClose={onClose} compact={compact} />;
}

function PanelHead({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{eyebrow}</p>
        <h3 className="truncate text-lg font-semibold text-ink">{title}</h3>
      </div>
      {onClose && <IconButton icon={X} label="Close details" size="sm" onClick={onClose} />}
    </div>
  );
}

function JunctionPanel({ id, onClose, compact }: { id: string; onClose?: () => void; compact?: boolean }) {
  const node = NODE_MAP[id];
  const st = useSim((s) => s.junctionStats[id]);
  const sig = useSim((s) => s.signals[id]);
  const incidents = useSim((s) => s.incidents);
  const devices = useSim((s) => s.devices);
  const threshold = useStore((s) => s.settings.congestionThreshold);
  const navigate = useStore((s) => s.navigate);
  const roads = ROADS.filter((r) => r.from === id || r.to === id);
  const related = useMemo(() => incidents.filter((i) => i.status !== 'resolved' && i.location.kind === 'road' && roads.some((r) => r.id === i.location.id)), [incidents, roads]);
  const sensors = useMemo(() => devices.filter((d) => d.location.kind === 'junction' && d.location.id === id), [devices, id]);
  if (!node || !st || !sig) return null;
  return (
    <div className="flex flex-col gap-4">
      <PanelHead eyebrow={`Junction ${id}`} title={node.name} onClose={onClose} />
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label={<><Car size={13} /> Vehicles nearby</>} value={st.vehicles} hint="within 150 m" />
        <MiniStat label={<><Gauge size={13} /> Density</>} value={`${st.density} %`} tone={densityTone(st.density, threshold)} hint={st.density >= threshold ? 'Heavy' : st.density >= 40 ? 'Moderate' : 'Light'} />
        <MiniStat label={<><Clock size={13} /> Avg. wait</>} value={`${st.avgWait.toFixed(1)} s`} hint="smoothed" />
        <MiniStat label={<><TrafficCone size={13} /> Queued</>} value={st.queue.NS + st.queue.EW} hint={`N–S ${st.queue.NS} · E–W ${st.queue.EW}`} />
      </div>

      <div className="rounded-xl border border-line p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink">Signal phase</p>
          <Badge tone={sig.control === 'priority' ? 'primary' : sig.control === 'manual' ? 'violet' : sig.control === 'fallback' ? 'warn' : 'neutral'}>
            {sig.control === 'adaptive' ? 'Adaptive' : sig.control === 'fixed' ? 'Fixed cycle' : sig.control === 'fallback' ? 'Fallback (sensor offline)' : sig.control === 'manual' ? 'Manual control' : 'Emergency priority'}
          </Badge>
        </div>
        <p className="text-[13px] text-ink-2">
          {phaseLabel(sig.phase)} ·{' '}
          <span className="tabular">{sig.mode === 'manual' && sig.phase.endsWith('GREEN') && !sig.priority ? 'held by operator' : `${Math.max(0, Math.ceil(sig.remaining))} s left`}</span>
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {(['NS', 'EW'] as Axis[]).map((axis) => {
            const color = lightFor(sig, axis);
            return (
              <div key={axis} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2">
                <span className="size-3 rounded-full" style={{ background: color === 'green' ? '#1e8e3e' : color === 'yellow' ? '#f9ab00' : '#d93025' }} aria-hidden />
                <div className="min-w-0 text-xs">
                  <p className="font-medium text-ink">{AXIS_LABEL[axis]}</p>
                  <p className="text-ink-3">
                    <Badge tone={LIGHT_TONE[color]} className="!h-5 !px-1.5">
                      {color}
                    </Badge>{' '}
                    plan {sig.plannedGreen[axis]} s
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!compact && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Sensors at this junction</p>
          <ul className="flex flex-col gap-1.5">
            {sensors.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="flex min-w-0 items-center gap-2 text-ink-2">
                  <Radio size={14} className="shrink-0 text-ink-3" aria-hidden />
                  <span className="truncate">
                    {d.id} · {d.name}
                  </span>
                </span>
                <Badge tone={d.status === 'online' ? 'good' : d.status === 'failed' ? 'bad' : 'neutral'}>{d.status}</Badge>
              </li>
            ))}
            {!st.sensorOnline && <li className="text-xs text-warn">Live data unavailable — showing last known values; signals use the fixed-time fallback.</li>}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Active incidents nearby</p>
        {related.length === 0 ? (
          <p className="text-[13px] text-ink-3">None on the roads connected to this junction.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {related.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate text-ink-2">
                  {INCIDENT_LABEL[i.type]} · {incidentWhere(i)}
                </span>
                <SeverityBadge severity={i.severity} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button variant="tonal" size="sm" iconRight={ArrowRight} onClick={() => navigate('traffic')}>
        Open traffic management
      </Button>
    </div>
  );
}

function RoadPanel({ id, onClose, compact }: { id: string; onClose?: () => void; compact?: boolean }) {
  const road = ROAD_MAP[id];
  const rs = useSim((s) => s.roadStats[id]);
  const rh = useSim((s) => s.roadHealth[id]);
  const incidents = useSim((s) => s.incidents);
  const threshold = useStore((s) => s.settings.congestionThreshold);
  const navigate = useStore((s) => s.navigate);
  const related = useMemo(() => incidents.filter((i) => i.status !== 'resolved' && i.location.kind === 'road' && i.location.id === id), [incidents, id]);
  if (!road || !rs || !rh) return null;
  const fwd = `${NODE_MAP[road.from].kind === 'junction' ? road.from : NODE_MAP[road.from].short} → ${NODE_MAP[road.to].kind === 'junction' ? road.to : NODE_MAP[road.to].short}`;
  const back = `${NODE_MAP[road.to].kind === 'junction' ? road.to : NODE_MAP[road.to].short} → ${NODE_MAP[road.from].kind === 'junction' ? road.from : NODE_MAP[road.from].short}`;
  return (
    <div className="flex flex-col gap-4">
      <PanelHead eyebrow={`Road segment · ${Math.round(road.length)} m`} title={road.name} onClose={onClose} />
      <p className="-mt-2 text-[13px] text-ink-3">
        {nodeLabel(road.from)} ↔ {nodeLabel(road.to)}
      </p>
      <div className="flex items-center gap-2">
        <span className="h-2 w-6 rounded-full" style={{ background: CONGESTION_COLOR[rs.congestion] }} aria-hidden />
        <span className="text-sm font-medium text-ink">{CONGESTION_TEXT[rs.congestion]}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label={<><Car size={13} /> Vehicles</>} value={rs.count} hint={`${fwd}: ${rs.dirCount.fwd} · ${back}: ${rs.dirCount.back}`} />
        <MiniStat label={<><Gauge size={13} /> Density</>} value={`${rs.density} %`} tone={densityTone(rs.density, threshold)} />
        <MiniStat label={<><Activity size={13} /> Avg. speed</>} value={`${rs.avgSpeedKmh.toFixed(0)} km/h`} hint="vehicles on segment" />
        <MiniStat label={<><Droplets size={13} /> Water risk</>} value={`${Math.round(rh.waterRisk)} %`} tone={rh.waterRisk >= 70 ? 'bad' : rh.waterRisk >= 40 ? 'warn' : undefined} />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[13px]">
          <span className="font-medium text-ink">Road health</span>
          <span className="tabular text-ink-2">{Math.round(rh.health)} / 100</span>
        </div>
        <Meter value={rh.health} tone={healthTone(rh.health)} label="Road health" />
        <p className="mt-1.5 text-xs text-ink-3">
          Vibration {rh.vibration.toFixed(1)} mm/s · pothole risk {Math.round(rh.potholeRisk)} %
        </p>
      </div>
      {!compact && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Incidents on this road</p>
          {related.length === 0 ? (
            <p className="text-[13px] text-ink-3">No open incidents.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {related.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate text-ink-2">{INCIDENT_LABEL[i.type]}</span>
                  <SeverityBadge severity={i.severity} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="tonal" size="sm" onClick={() => navigate('incidents')}>
          Incidents
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate('health')}>
          Road health
        </Button>
      </div>
    </div>
  );
}
