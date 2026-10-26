// Interactive SVG road network. Everything is drawn from the fixed road graph in sim/network.ts,
// so vehicles always move along real road paths.
import { memo, useCallback, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  Building2,
  CarFront,
  Construction,
  Flame,
  Gauge,
  Hospital,
  Maximize2,
  Minus,
  Plane,
  Plus,
  Radio,
  ShieldCheck,
  TriangleAlert,
  Waves,
  CloudFog,
  CloudRain,
  CloudSun,
  CloudDrizzle,
  Moon,
  type LucideIcon,
} from 'lucide-react';
import { useStore, useSim } from '../../store/simStore';
import {
  CROSSINGS,
  GATEWAYS,
  JUNCTIONS,
  MAP_HEIGHT,
  MAP_WIDTH,
  NODES,
  NODE_MAP,
  ROADS,
  ROAD_MAP,
  STOP_OFFSET,
  pointOnRoad,
  roadPoint,
} from '../../sim/network';
import { lightFor } from '../../sim/signals';
import { WEATHER_PRESETS } from '../../sim/weather';
import type { Congestion, Device, Incident, IncidentType, LightColor, Vehicle } from '../../sim/types';
import { cx } from '../ui';

export interface MapLayers {
  density: boolean;
  vehicles: boolean;
  signals: boolean;
  sensors: boolean;
  incidents: boolean;
  lights: boolean;
  labels: boolean;
  network: boolean;
}

export const DEFAULT_LAYERS: MapLayers = {
  density: true,
  vehicles: true,
  signals: true,
  sensors: false,
  incidents: true,
  lights: true,
  labels: true,
  network: false,
};

export const CONGESTION_COLOR: Record<Congestion, string> = {
  free: 'var(--t-free)',
  moderate: 'var(--t-moderate)',
  heavy: 'var(--t-heavy)',
  blocked: 'var(--t-blocked)',
};

const LIGHT_COLOR: Record<LightColor, string> = { green: '#1e8e3e', yellow: '#f9ab00', red: '#d93025' };

const TERMINAL_ICON: Record<string, LucideIcon> = { FIRE: Flame, POLICE: ShieldCheck, AIRPORT: Plane, TECH: Building2, HOSPITAL: Hospital };
const INCIDENT_ICON: Record<IncidentType, LucideIcon> = {
  collision: CarFront,
  blockage: Construction,
  congestion: Gauge,
  waterlogging: Waves,
  low_visibility: CloudFog,
  severe_weather: CloudRain,
  road_damage: TriangleAlert,
};
const SEV_FILL: Record<string, string> = { critical: '#8c1d18', high: '#d93025', medium: '#e37400', low: '#1a73e8' };

// ---------- Static base map (drawn once) ----------
interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'city' | 'park' | 'campus' | 'water';
}

const REGIONS: Block[] = [
  { x: 16, y: 16, w: 222, h: 162, kind: 'city' },
  { x: 16, y: 222, w: 222, h: 256, kind: 'city' },
  { x: 16, y: 522, w: 222, h: 162, kind: 'campus' },
  { x: 282, y: 16, w: 296, h: 162, kind: 'city' },
  { x: 282, y: 222, w: 296, h: 256, kind: 'park' },
  { x: 282, y: 522, w: 296, h: 70, kind: 'campus' },
  { x: 622, y: 16, w: 296, h: 162, kind: 'city' },
  { x: 622, y: 222, w: 296, h: 256, kind: 'city' },
  { x: 622, y: 522, w: 296, h: 70, kind: 'city' },
  { x: 962, y: 16, w: 222, h: 162, kind: 'city' },
  { x: 962, y: 222, w: 222, h: 256, kind: 'water' },
  { x: 962, y: 522, w: 222, h: 70, kind: 'city' },
];

function subdivide(b: Block): Block[] {
  const cols = Math.max(1, Math.round(b.w / 105));
  const rows = Math.max(1, Math.round(b.h / 78));
  const gap = 9;
  const cw = (b.w - gap * (cols - 1)) / cols;
  const ch = (b.h - gap * (rows - 1)) / rows;
  const out: Block[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: b.x + c * (cw + gap), y: b.y + r * (ch + gap), w: cw, h: ch, kind: b.kind });
  return out;
}

const BaseMap = memo(function BaseMap() {
  return (
    <g aria-hidden>
      <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill="var(--m-bg)" />
      {REGIONS.map((r, i) => {
        if (r.kind === 'park')
          return (
            <g key={i}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={14} fill="var(--m-park)" />
              <path d={`M ${r.x + 40} ${r.y + 200} C ${r.x + 110} ${r.y + 140}, ${r.x + 180} ${r.y + 210}, ${r.x + 250} ${r.y + 90}`} stroke="var(--m-bg)" strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.8} />
              <circle cx={r.x + 210} cy={r.y + 175} r={26} fill="var(--m-water)" />
            </g>
          );
        if (r.kind === 'water')
          return (
            <g key={i}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={14} fill="var(--m-park)" />
              <path
                d={`M ${r.x + 30} ${r.y + 60} C ${r.x + 60} ${r.y + 10}, ${r.x + 170} ${r.y + 20}, ${r.x + 195} ${r.y + 80} C ${r.x + 215} ${r.y + 140}, ${r.x + 170} ${r.y + 230}, ${r.x + 100} ${r.y + 225} C ${r.x + 30} ${r.y + 220}, ${r.x + 5} ${r.y + 120}, ${r.x + 30} ${r.y + 60} Z`}
                fill="var(--m-water)"
              />
            </g>
          );
        return subdivide(r).map((b, j) => <rect key={`${i}-${j}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={7} fill={r.kind === 'campus' ? 'var(--m-block-line)' : 'var(--m-block)'} />);
      })}
      {/* River along the south of the city */}
      <path d="M 282 640 C 420 610, 560 660, 700 632 S 980 610, 1200 640 L 1200 700 L 282 700 Z" fill="var(--m-water)" />
      {/* Road casings, surfaces and centre lines */}
      {ROADS.map((r) => {
        const a = NODE_MAP[r.from];
        const b = NODE_MAP[r.to];
        return <line key={`c-${r.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--m-casing)" strokeWidth={34} strokeLinecap="round" />;
      })}
      {ROADS.map((r) => {
        const a = NODE_MAP[r.from];
        const b = NODE_MAP[r.to];
        return <line key={`s-${r.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--m-road)" strokeWidth={30} strokeLinecap="round" />;
      })}
      {ROADS.map((r) => {
        const p1 = roadPoint(r, STOP_OFFSET / r.length);
        const p2 = roadPoint(r, 1 - STOP_OFFSET / r.length);
        return <line key={`m-${r.id}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--m-center)" strokeWidth={1.5} strokeDasharray="10 8" />;
      })}
      {JUNCTIONS.map((j) => (
        <rect key={j.id} x={j.x - 22} y={j.y - 22} width={44} height={44} rx={6} fill="var(--m-junction)" />
      ))}
      {/* Pedestrian crossings (zebra) */}
      {CROSSINGS.map((c) => {
        const road = ROAD_MAP[c.roadId];
        const horizontal = road.axis === 'EW';
        return (
          <g key={c.id} transform={`translate(${c.x} ${c.y}) rotate(${horizontal ? 0 : 90})`}>
            {[-12, -6, 0, 6, 12].map((o) => (
              <rect key={o} x={-4} y={o - 1.5} width={8} height={3.2} fill="var(--m-center)" opacity={0.9} />
            ))}
          </g>
        );
      })}
    </g>
  );
});

// ---------- Labels ----------
const Labels = memo(function Labels() {
  return (
    <g className="select-none" style={{ pointerEvents: 'none' }}>
      {ROADS.filter((r) => NODE_MAP[r.from].kind === 'junction' && NODE_MAP[r.to].kind === 'junction').map((r) => {
        const vertical = r.axis === 'NS';
        const p = roadPoint(r, vertical ? 0.62 : 0.5, vertical ? 0 : 0);
        return (
          <text
            key={r.id}
            x={vertical ? p.x + 24 : p.x}
            y={vertical ? p.y : p.y - 25}
            textAnchor={vertical ? 'start' : 'middle'}
            dominantBaseline="middle"
            fontSize={12}
            fontWeight={500}
            fill="var(--m-label)"
            stroke="var(--m-label-halo)"
            strokeWidth={3.5}
            paintOrder="stroke"
          >
            {r.name}
          </text>
        );
      })}
      <text x={430} y={352} textAnchor="middle" fontSize={12} fontWeight={500} fill="var(--t-free)" opacity={0.8}>
        City Park
      </text>
      <text x={1072} y={352} textAnchor="middle" fontSize={12} fontWeight={500} fill="var(--c-primary)" opacity={0.8}>
        Lake
      </text>
      <text x={760} y={668} textAnchor="middle" fontSize={12} fontWeight={500} fill="var(--c-primary)" opacity={0.7}>
        River
      </text>
    </g>
  );
});

// ---------- Traffic density overlay ----------
const TrafficOverlay = memo(function TrafficOverlay({ roadStats }: { roadStats: ReturnType<typeof selectRoadStats> }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {ROADS.map((r) => {
        const rs = roadStats[r.id];
        if (!rs) return null;
        return ([1, -1] as const).map((dir) => {
          const trim = NODE_MAP[dir === 1 ? r.from : r.to].kind === 'junction' ? 24 : 6;
          const trimEnd = NODE_MAP[dir === 1 ? r.to : r.from].kind === 'junction' ? 24 : 6;
          const a = pointOnRoad(r, dir, trim, 8);
          const b = pointOnRoad(r, dir, r.length - trimEnd, 8);
          const level = dir === 1 ? rs.dirCongestion.fwd : rs.dirCongestion.back;
          return (
            <line
              key={`${r.id}${dir}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={CONGESTION_COLOR[level]}
              strokeWidth={level === 'blocked' ? 6 : 5}
              strokeLinecap="round"
              strokeDasharray={level === 'blocked' ? '9 6' : undefined}
              opacity={0.92}
            />
          );
        });
      })}
    </g>
  );
});

const selectRoadStats = (s: { roadStats: Record<string, { dirCongestion: { fwd: Congestion; back: Congestion } }> }) => s.roadStats;

// ---------- Signals (stop bars + signal heads) ----------
const SignalsLayer = memo(function SignalsLayer({ signals }: { signals: ReturnType<typeof useSignals> }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {JUNCTIONS.map((j) => {
        const sig = signals[j.id];
        if (!sig) return null;
        return ROADS.filter((r) => r.from === j.id || r.to === j.id).map((r) => {
          const dir: 1 | -1 = r.to === j.id ? 1 : -1;
          const p = pointOnRoad(r, dir, r.length - STOP_OFFSET + 1, 7.5);
          const color = LIGHT_COLOR[lightFor(sig, r.axis)];
          const horizontal = r.axis === 'EW';
          return (
            <g key={`${j.id}-${r.id}`}>
              <rect x={p.x - (horizontal ? 2 : 7)} y={p.y - (horizontal ? 7 : 2)} width={horizontal ? 4 : 14} height={horizontal ? 14 : 4} rx={2} fill={color} />
              {sig.priority && sig.priority.axis === r.axis && <circle cx={p.x} cy={p.y} r={10} fill="none" stroke="#1a73e8" strokeWidth={2} className="pulse-ring" />}
            </g>
          );
        });
      })}
    </g>
  );
});
const useSignals = () => useSim((s) => s.signals);

// ---------- Vehicles ----------
const VEHICLE_SIZE: Record<string, [number, number]> = { car: [10, 5.6], bike: [6.5, 3.4], bus: [16, 6.4], truck: [13.5, 6.2], ambulance: [13, 6.6], fire: [15, 6.8], police: [12, 6.2] };
const CAR_TINTS = ['var(--veh-1)', 'var(--veh-2)', 'var(--veh-3)', 'var(--veh-4)', 'var(--veh-5)'];
const VEHICLE_FILL: Record<string, string> = { bike: '#12858f', bus: '#e37400', truck: '#6d5a4b', ambulance: '#ffffff', fire: '#d93025', police: '#1a4fa0' };

const VehiclesLayer = memo(function VehiclesLayer({ vehicles }: { vehicles: Vehicle[] }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {vehicles.map((v) => {
        const road = ROAD_MAP[v.roadId];
        const em = v.kind === 'ambulance' || v.kind === 'fire' || v.kind === 'police';
        const p = pointOnRoad(road, v.dir, v.pos, em ? 2.5 : 7.5);
        const [w, h] = VEHICLE_SIZE[v.kind];
        const fill = v.kind === 'car' ? CAR_TINTS[v.tint % CAR_TINTS.length] : VEHICLE_FILL[v.kind];
        return (
          <g key={v.id} className="veh" style={{ transform: `translate(${p.x}px, ${p.y}px) rotate(${p.angle}deg)` }}>
            {em && <circle r={11} fill={v.kind === 'police' ? '#1a73e8' : '#d93025'} opacity={0.25} className="pulse-ring" />}
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2.6} fill={fill} stroke={em ? (v.kind === 'ambulance' ? '#d93025' : '#ffffff') : 'rgba(255,255,255,0.55)'} strokeWidth={em ? 1.6 : 0.8} />
            {em && <rect x={-1.2} y={-h / 2 + 1} width={2.4} height={h - 2} rx={1} fill={v.kind === 'ambulance' ? '#d93025' : '#ffffff'} />}
          </g>
        );
      })}
    </g>
  );
});

// ---------- Devices / sensors ----------
const DEVICE_COLOR = (d: Device, gwOnline: boolean) => (d.status === 'failed' ? '#d93025' : d.status === 'offline' || !gwOnline ? '#9aa0a6' : '#1a73e8');

const SensorsLayer = memo(function SensorsLayer({ devices, showLinks }: { devices: Device[]; showLinks: boolean }) {
  const gwStatus = Object.fromEntries(devices.filter((d) => d.type === 'gateway').map((d) => [d.id, d.status === 'online']));
  return (
    <g style={{ pointerEvents: 'none' }}>
      {showLinks &&
        devices
          .filter((d) => d.type === 'vehicle_sensor' && !d.custom)
          .map((d) => {
            const gw = GATEWAYS.find((g) => g.id === d.gatewayId);
            if (!gw) return null;
            const ok = gwStatus[gw.id] && d.status === 'online';
            return <line key={`l-${d.id}`} x1={d.x} y1={d.y} x2={gw.x} y2={gw.y} stroke={ok ? '#1a73e8' : '#d93025'} strokeWidth={1.5} strokeDasharray="4 5" opacity={0.55} className={ok ? 'flow-dash' : undefined} />;
          })}
      {devices.map((d) => {
        if (d.type === 'streetlight_controller' || d.type === 'motion_sensor') return null;
        const c = DEVICE_COLOR(d, d.gatewayId ? gwStatus[d.gatewayId] !== false : true);
        if (d.type === 'gateway')
          return (
            <g key={d.id} transform={`translate(${d.x} ${d.y})`}>
              <rect x={-15} y={-15} width={30} height={30} rx={9} fill="var(--c-surface)" stroke={c} strokeWidth={2} />
              <Radio x={-9} y={-9} width={18} height={18} color={c} strokeWidth={2.2} />
              <text y={28} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--m-label)" stroke="var(--m-label-halo)" strokeWidth={3} paintOrder="stroke">
                {d.name}
              </text>
            </g>
          );
        const r = d.type === 'weather_sensor' ? 6.5 : 4.8;
        return (
          <g key={d.id}>
            {d.type === 'vehicle_sensor' || d.type === 'rfid_reader' ? (
              <rect x={d.x - r} y={d.y - r} width={r * 2} height={r * 2} rx={2} fill="var(--c-surface)" stroke={c} strokeWidth={2} transform={d.type === 'rfid_reader' ? `rotate(45 ${d.x} ${d.y})` : undefined} />
            ) : (
              <circle cx={d.x} cy={d.y} r={r} fill="var(--c-surface)" stroke={c} strokeWidth={2} />
            )}
            <circle cx={d.x} cy={d.y} r={1.8} fill={c} />
          </g>
        );
      })}
    </g>
  );
});

// ---------- Streetlights ----------
const LightsLayer = memo(function LightsLayer({ lights }: { lights: Array<{ id: string; x: number; y: number; brightness: number; failSafe: boolean }> }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {lights.map((l) => (
        <g key={l.id}>
          {l.brightness > 1 && <circle cx={l.x} cy={l.y} r={8 + l.brightness * 0.2} fill="#fbbc04" opacity={0.12 + (l.brightness / 100) * 0.3} />}
          <circle cx={l.x} cy={l.y} r={3.6} fill={l.brightness > 1 ? '#fbbc04' : 'var(--m-casing)'} stroke={l.failSafe ? '#d93025' : 'var(--c-surface)'} strokeWidth={1.4} />
        </g>
      ))}
    </g>
  );
});

// ---------- Incidents ----------
function IncidentPin({ inc }: { inc: Incident }) {
  if (inc.location.kind !== 'road') return null;
  const r = ROAD_MAP[inc.location.id];
  const p = roadPoint(r, inc.position, 0);
  const Icon = INCIDENT_ICON[inc.type];
  const fill = SEV_FILL[inc.severity];
  return (
    <g transform={`translate(${p.x} ${p.y})`} opacity={inc.status === 'acknowledged' ? 0.85 : 1}>
      {inc.status === 'active' && <circle r={16} fill={fill} opacity={0.35} className="pulse-ring" />}
      <circle r={13} fill={fill} stroke="#fff" strokeWidth={2.5} />
      <Icon x={-7.5} y={-7.5} width={15} height={15} color="#fff" strokeWidth={2.4} />
    </g>
  );
}

// ---------- Main component ----------
export interface RoadMapProps {
  layers?: Partial<MapLayers>;
  height?: number | string;
  showZoom?: boolean;
  routeNodes?: string[] | null;
  className?: string;
  interactive?: boolean;
  showWeatherChip?: boolean;
}

export function RoadMap({ layers: layerProp, height = 520, showZoom = true, routeNodes, className, interactive = true, showWeatherChip = true }: RoadMapProps) {
  const layers = { ...DEFAULT_LAYERS, ...layerProp };
  const roadStats = useSim((s) => s.roadStats);
  const signals = useSim((s) => s.signals);
  const vehicles = useSim((s) => s.vehicles);
  const devices = useSim((s) => s.devices);
  const lights = useSim((s) => s.streetlights);
  const incidents = useSim((s) => s.incidents);
  const pedestrians = useSim((s) => s.pedestrians);
  const time = useSim((s) => Math.floor(s.time));
  const weather = useSim((s) => s.weather);
  const roadHealth = useSim((s) => s.roadHealth);
  const emergencies = useSim((s) => s.emergencies);
  const potholeThreshold = useStore((st) => st.settings.potholeThreshold);
  const daylightLux = useStore((st) => st.settings.daylightLux);
  const selection = useStore((st) => st.selection);
  const select = useStore((st) => st.select);

  const [view, setView] = useState({ x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT });
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const zoom = useCallback((factor: number) => {
    setView((v) => {
      const w = Math.min(MAP_WIDTH, Math.max(MAP_WIDTH / 3, v.w * factor));
      const h = (w / MAP_WIDTH) * MAP_HEIGHT;
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      return clampView({ x: cx - w / 2, y: cy - h / 2, w, h });
    });
  }, []);

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (view.w >= MAP_WIDTH) return;
    drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const svg = svgRef.current;
    if (!d || !svg) return;
    const scale = view.w / svg.clientWidth;
    const dx = (e.clientX - d.px) * scale;
    const dy = (e.clientY - d.py) * scale;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setView((v) => clampView({ ...v, x: d.vx - dx, y: d.vy - dy }));
  };
  const onPointerUp = () => {
    window.setTimeout(() => (drag.current = null), 0);
  };
  const click = (sel: { kind: 'junction' | 'road'; id: string }) => {
    if (!interactive || drag.current?.moved) return;
    select(selection && selection.kind === sel.kind && selection.id === sel.id ? null : sel);
  };

  const openIncidents = useMemo(() => incidents.filter((i) => i.status !== 'resolved'), [incidents]);
  const networkIncidents = openIncidents.filter((i) => i.location.kind === 'network');
  const damaged = useMemo(() => ROADS.filter((r) => (roadHealth[r.id]?.potholeRisk ?? 0) >= potholeThreshold), [roadHealth, potholeThreshold]);
  const darkness = Math.max(0, Math.min(1, (daylightLux - weather.ambientLux) / daylightLux));
  const activeRoute = routeNodes ?? emergencies.find((e) => e.status === 'en_route')?.routeNodes ?? null;
  const activePeds = CROSSINGS.filter((c) => (pedestrians[c.id] ?? -1) > time);
  const condition = weather.condition;
  const WeatherIcon = condition === 'clear' ? CloudSun : condition === 'rain' ? CloudDrizzle : condition === 'heavy_rain' ? CloudRain : condition === 'fog' ? CloudFog : Moon;

  return (
    <div className={cx('relative overflow-hidden rounded-xl bg-[var(--m-bg)]', className)} style={{ height }}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className={cx('size-full touch-none', view.w < MAP_WIDTH ? 'cursor-grab active:cursor-grabbing' : '')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        role="img"
        aria-label="Simulated city road network with six signalised junctions"
      >
        <BaseMap />
        {damaged.map((r) => {
          const p = roadPoint(r, 0.36, -1);
          return (
            <g key={`dmg-${r.id}`} transform={`translate(${p.x} ${p.y}) rotate(45)`} style={{ pointerEvents: 'none' }}>
              <rect x={-6} y={-6} width={12} height={12} rx={2} fill="#e37400" stroke="#fff" strokeWidth={1.8} />
            </g>
          );
        })}
        {layers.density && <TrafficOverlay roadStats={roadStats} />}
        {activeRoute && activeRoute.length > 1 && (
          <polyline
            points={activeRoute.map((n) => `${NODE_MAP[n].x},${NODE_MAP[n].y}`).join(' ')}
            fill="none"
            stroke="#1a73e8"
            strokeWidth={7}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="2 12"
            opacity={0.9}
            className="flow-dash"
            style={{ pointerEvents: 'none' }}
          />
        )}
        {layers.labels && <Labels />}

        {/* Hit targets */}
        {interactive &&
          ROADS.map((r) => {
            const a = NODE_MAP[r.from];
            const b = NODE_MAP[r.to];
            const sel = selection?.kind === 'road' && selection.id === r.id;
            return (
              <g key={`hit-${r.id}`}>
                {sel && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1a73e8" strokeWidth={40} strokeLinecap="round" opacity={0.18} style={{ pointerEvents: 'none' }} />}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={34}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect ${r.name}`}
                  onClick={() => click({ kind: 'road', id: r.id })}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && click({ kind: 'road', id: r.id })}
                />
              </g>
            );
          })}

        {layers.signals && <SignalsLayer signals={signals} />}
        {layers.lights && <LightsLayer lights={lights} />}
        {layers.sensors && <SensorsLayer devices={devices} showLinks={layers.network} />}
        {!layers.sensors && layers.network && <SensorsLayer devices={devices.filter((d) => d.type === 'gateway' || d.type === 'vehicle_sensor')} showLinks />}
        {layers.vehicles && <VehiclesLayer vehicles={vehicles} />}

        {activePeds.map((c) => (
          <g key={`ped-${c.id}`} transform={`translate(${c.x + (ROAD_MAP[c.roadId].axis === 'EW' ? 0 : 0)} ${c.y})`} style={{ pointerEvents: 'none' }}>
            <circle r={5.5} fill="#7b1fa2" stroke="#fff" strokeWidth={1.5} />
          </g>
        ))}

        {/* Junctions & terminals */}
        {NODES.map((n) => {
          const sel = selection?.kind === 'junction' && selection.id === n.id;
          if (n.kind === 'terminal') {
            const Icon = TERMINAL_ICON[n.id] ?? Building2;
            const labelBelow = n.id === 'TECH';
            return (
              <g key={n.id} transform={`translate(${n.x} ${n.y})`} style={{ pointerEvents: 'none' }}>
                <circle r={15} fill="var(--c-surface)" stroke="var(--m-casing)" strokeWidth={2} />
                <Icon x={-8.5} y={-8.5} width={17} height={17} color={n.id === 'HOSPITAL' || n.id === 'FIRE' ? '#d93025' : '#1a73e8'} strokeWidth={2.2} />
                {layers.labels && (
                  <text
                    x={labelBelow ? 22 : 0}
                    y={labelBelow ? 4 : n.id === 'POLICE' ? 4 : -22}
                    dx={n.id === 'POLICE' ? 22 : 0}
                    textAnchor={labelBelow || n.id === 'POLICE' ? 'start' : 'middle'}
                    fontSize={11.5}
                    fontWeight={600}
                    fill="var(--m-label)"
                    stroke="var(--m-label-halo)"
                    strokeWidth={3.5}
                    paintOrder="stroke"
                  >
                    {n.name}
                  </text>
                )}
              </g>
            );
          }
          const st = signals[n.id];
          return (
            <g
              key={n.id}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={interactive ? `Inspect Junction ${n.id}, ${n.name}` : undefined}
              aria-pressed={interactive ? sel : undefined}
              className={interactive ? 'cursor-pointer focus:outline-none' : undefined}
              onClick={() => click({ kind: 'junction', id: n.id })}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && click({ kind: 'junction', id: n.id })}
            >
              <rect x={n.x - 22} y={n.y - 22} width={44} height={44} rx={6} fill="transparent" />
              {sel && <rect x={n.x - 30} y={n.y - 30} width={60} height={60} rx={12} fill="none" stroke="#1a73e8" strokeWidth={3} />}
              {st?.mode === 'manual' && <rect x={n.x - 26} y={n.y - 26} width={52} height={52} rx={9} fill="none" stroke="#6250d6" strokeWidth={2.5} strokeDasharray="5 4" />}
              <g transform={`translate(${n.x - 46} ${n.y - 46})`}>
                <circle r={12} fill={sel ? '#1a73e8' : 'var(--c-surface)'} stroke={sel ? '#fff' : 'var(--m-casing)'} strokeWidth={2} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill={sel ? '#fff' : 'var(--c-ink)'}>
                  {n.id}
                </text>
              </g>
              {layers.labels && (
                <text x={n.x - 30} y={n.y - 46} dominantBaseline="central" fontSize={11.5} fontWeight={600} fill="var(--m-label)" stroke="var(--m-label-halo)" strokeWidth={3.5} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                  {n.name}
                </text>
              )}
            </g>
          );
        })}

        {layers.incidents && openIncidents.map((inc) => <IncidentPin key={inc.id} inc={inc} />)}

        {/* Weather & night overlays */}
        {condition === 'fog' && <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill="var(--m-fog)" opacity={0.34} style={{ pointerEvents: 'none' }} />}
        {(condition === 'rain' || condition === 'heavy_rain') && <RainOverlay heavy={condition === 'heavy_rain'} />}
        {darkness > 0 && <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill="rgb(var(--m-night))" opacity={darkness * 0.2} style={{ pointerEvents: 'none' }} />}
      </svg>

      {showWeatherChip && (
        <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface/95 px-3 text-xs font-medium text-ink shadow-card">
            <WeatherIcon size={15} className="text-primary" aria-hidden />
            {WEATHER_PRESETS[condition].label} · {Math.round(weather.temperature)} °C · {weather.speedAdvisory} km/h advisory
          </span>
          {networkIncidents.map((i) => (
            <span key={i.id} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-bad-soft px-3 text-xs font-medium text-bad shadow-card">
              <TriangleAlert size={14} aria-hidden /> {i.title}
            </span>
          ))}
        </div>
      )}

      {showZoom && (
        <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <button type="button" aria-label="Zoom in" className="grid size-9 place-items-center text-ink-2 hover:bg-surface-2" onClick={() => zoom(0.75)}>
            <Plus size={17} />
          </button>
          <button type="button" aria-label="Zoom out" className="grid size-9 place-items-center border-t border-line text-ink-2 hover:bg-surface-2" onClick={() => zoom(1 / 0.75)}>
            <Minus size={17} />
          </button>
          <button type="button" aria-label="Reset view" className="grid size-9 place-items-center border-t border-line text-ink-2 hover:bg-surface-2" onClick={() => setView({ x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT })}>
            <Maximize2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function clampView(v: { x: number; y: number; w: number; h: number }) {
  return { ...v, x: Math.max(0, Math.min(MAP_WIDTH - v.w, v.x)), y: Math.max(0, Math.min(MAP_HEIGHT - v.h, v.y)) };
}

const RainOverlay = memo(function RainOverlay({ heavy }: { heavy: boolean }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      <defs>
        <pattern id={heavy ? 'rain-h' : 'rain-l'} width={heavy ? 22 : 34} height={heavy ? 22 : 34} patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
          <line x1={0} y1={0} x2={0} y2={heavy ? 10 : 7} stroke="#1a73e8" strokeWidth={1.2} opacity={heavy ? 0.45 : 0.3} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${heavy ? 'rain-h' : 'rain-l'})`} />
      <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill="#1a73e8" opacity={heavy ? 0.06 : 0.03} />
    </g>
  );
});

/** Colour legend for the traffic overlay (always text + colour). */
export function TrafficLegend({ className }: { className?: string }) {
  const items: Array<[Congestion, string]> = [
    ['free', 'Free-flowing'],
    ['moderate', 'Moderate'],
    ['heavy', 'Heavy'],
    ['blocked', 'Blocked'],
  ];
  return (
    <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2', className)}>
      {items.map(([k, label]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <svg width={22} height={6} aria-hidden>
            <line x1={2} y1={3} x2={20} y2={3} stroke={CONGESTION_COLOR[k]} strokeWidth={5} strokeLinecap="round" strokeDasharray={k === 'blocked' ? '5 3' : undefined} />
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}
