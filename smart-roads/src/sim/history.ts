import { JUNCTIONS, ROADS } from './network';
import { lightingTotals } from './lighting';
import { averageHealth } from './roadHealth';
import { deviceReachable, networkSummary } from './devices';
import type { HistorySample, Settings, SimState } from './types';

export function takeSample(s: SimState, cfg: Settings) {
  const jd: Record<string, number> = {};
  const jc: Record<string, number> = {};
  const jw: Record<string, number> = {};
  let dSum = 0;
  let wSum = 0;
  for (const j of JUNCTIONS) {
    const st = s.junctionStats[j.id];
    jd[j.id] = st.density;
    jc[j.id] = st.vehicles;
    jw[j.id] = st.avgWait;
    dSum += st.density;
    wSum += st.avgWait;
  }
  const rh: Record<string, number> = {};
  for (const r of ROADS) rh[r.id] = Math.round(s.roadHealth[r.id].health * 10) / 10;

  let heavyLen = 0;
  let totalLen = 0;
  for (const r of ROADS) {
    totalLen += r.length;
    const c = s.roadStats[r.id].congestion;
    if (c === 'heavy' || c === 'blocked') heavyLen += r.length;
    else if (c === 'moderate') heavyLen += r.length * 0.4;
  }
  const lights = lightingTotals(s);
  const net = networkSummary(s);
  const sensors = s.devices.filter((d) => d.type !== 'gateway');
  const sample: HistorySample = {
    t: Math.round(s.time),
    vehicles: s.vehicles.length,
    avgDensity: Math.round((dSum / JUNCTIONS.length) * 10) / 10,
    avgWait: Math.round((wSum / JUNCTIONS.length) * 10) / 10,
    congestion: Math.round((heavyLen / totalLen) * 1000) / 10,
    junctionDensity: jd,
    junctionCount: jc,
    junctionWait: jw,
    energyWh: Math.round(lights.energy * 10) / 10,
    baselineWh: Math.round(lights.baseline * 10) / 10,
    avgHealth: Math.round(averageHealth(s) * 10) / 10,
    roadHealth: rh,
    online: sensors.filter((d) => deviceReachable(s, d)).length,
    total: sensors.length,
    deliveryRate: Math.round(net.deliveryRate * 10) / 10,
    latency: Math.round(net.latency),
    throughput: Math.round(net.throughput * 10) / 10,
    activeIncidents: s.incidents.filter((i) => i.status !== 'resolved').length,
  };
  s.history.push(sample);
  const max = Math.max(60, Math.round((cfg.historyMinutes * 60) / 5));
  if (s.history.length > max) s.history.splice(0, s.history.length - max);
  s.lastSampleAt = s.time;
}
