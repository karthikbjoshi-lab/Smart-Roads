// One-click scenario actions shared by the control bar, pages and the guided demo.
import { useStore } from './simStore';
import { createIncident } from '../sim/incidents';
import { generateTraffic, spawnEmergency } from '../sim/vehicles';
import { setWeather } from '../sim/weather';
import { setDeviceStatus } from '../sim/devices';
import { simulateDamage } from '../sim/roadHealth';
import { JUNCTIONS, ROAD_MAP, nodeLabel } from '../sim/network';
import type { EmergencyKind, Severity } from '../sim/types';

const ACCIDENT_ROADS = ['B-C', 'D-E', 'A-B', 'E-F', 'C-F'];
const BLOCKAGE_ROADS = ['A-D', 'B-E', 'C-F', 'D-E'];

export const quick = {
  generateTraffic(junctionId = 'B') {
    const { act, toast } = useStore.getState();
    const n = act((s) => generateTraffic(s, junctionId));
    toast({ title: 'Traffic surge generated', message: `${n} extra vehicles heading to ${nodeLabel(junctionId)} for the next 2½ minutes.`, tone: 'info', page: 'traffic' });
  },
  accident(roadId?: string, severity: Severity = 'high') {
    const { act, toast } = useStore.getState();
    const res = act((s) => {
      const candidates = roadId ? [roadId] : ACCIDENT_ROADS;
      for (const id of candidates) {
        const r = createIncident(s, { type: 'collision', severity, location: { kind: 'road', id }, source: 'operator', position: 0.5 });
        if (r?.created) return r.incident;
      }
      return null;
    });
    if (res) toast({ title: 'Accident simulated', message: `${res.title} (${severity}). Open Incidents to acknowledge and resolve it.`, tone: 'warning', page: 'incidents' });
    else toast({ title: 'Already active', message: 'A collision is already open at that location.', tone: 'info' });
    return res;
  },
  blockage(roadId?: string, severity: Severity = 'high') {
    const { act, toast } = useStore.getState();
    const res = act((s) => {
      const candidates = roadId ? [roadId] : BLOCKAGE_ROADS;
      for (const id of candidates) {
        const r = createIncident(s, { type: 'blockage', severity, location: { kind: 'road', id }, source: 'operator', position: 0.5 });
        if (r?.created) return r.incident;
      }
      return null;
    });
    if (res) toast({ title: 'Road blockage simulated', message: `${ROAD_MAP[res.location.id]?.name ?? 'Road'} is closed. Vehicles and emergency routes avoid it.`, tone: 'warning', page: 'incidents' });
    else toast({ title: 'Already blocked', message: 'That road already has an open blockage.', tone: 'info' });
    return res;
  },
  heavyRain() {
    const { act, toast, sim } = useStore.getState();
    if (sim.weather.condition === 'heavy_rain') {
      act((s) => setWeather(s, 'clear'));
      toast({ title: 'Weather cleared', message: 'Weather sensors now report clear conditions.', tone: 'success' });
      return;
    }
    act((s) => setWeather(s, 'heavy_rain'));
    toast({ title: 'Heavy rain simulated', message: 'Watch waterlogging risk rise on poorly drained roads (Road Health).', tone: 'info', page: 'health' });
  },
  emergency(kind: EmergencyKind = 'ambulance', origin = 'TECH', destination = 'HOSPITAL') {
    const { act, toast } = useStore.getState();
    const res = act((s) => spawnEmergency(s, kind, origin, destination));
    toast({ title: res.ok ? 'Emergency vehicle dispatched' : 'Could not dispatch', message: res.message, tone: res.ok ? 'info' : 'danger', page: res.ok ? 'emergency' : undefined });
    return res;
  },
  sensorFailure(junctionId?: string) {
    const { act, toast, sim, selection } = useStore.getState();
    const preferred = junctionId ?? (selection?.kind === 'junction' ? selection.id : undefined);
    const order = [preferred, 'C', 'B', 'D', 'A', 'E', 'F'].filter(Boolean) as string[];
    const target = order.map((j) => sim.devices.find((d) => d.id === `VDS-${j}`)).find((d) => d && d.status === 'online');
    if (!target) {
      toast({ title: 'No online sensors', message: 'Every vehicle detection sensor is already offline.', tone: 'info' });
      return;
    }
    act((s) => setDeviceStatus(s, target.id, 'failed'));
    toast({ title: 'Sensor failure simulated', message: `${target.id} failed — that junction falls back to fixed-time signals. Restore it in Device Simulator.`, tone: 'warning', page: 'devices' });
  },
  damage(roadId = 'E-F') {
    const { act, toast } = useStore.getState();
    act((s, cfg) => simulateDamage(s, roadId, cfg));
    toast({ title: 'Road damage simulated', message: `Vibration spike on ${ROAD_MAP[roadId].name}. A maintenance task was created.`, tone: 'warning', page: 'health' });
  },
};

export const JUNCTION_OPTIONS = JUNCTIONS.map((j) => ({ value: j.id, label: `Junction ${j.id} · ${j.name}` }));
