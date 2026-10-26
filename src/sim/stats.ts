// Turns raw (simulated) vehicle positions into what the roadside sensors would report:
// per-junction queues / density / waiting time and per-road density / congestion level.
// A junction whose vehicle sensor (or gateway) is offline stops updating — the dashboard only knows
// what the sensors tell it.

import { JUNCTIONS, ROADS, ROAD_MAP, STOP_OFFSET, endNode } from './network';
import { isRoadBlocked } from './routing';
import { deviceReachable } from './devices';
import type { Axis, Congestion, JunctionStats, RoadStats, Settings, SimState } from './types';

const APPROACH_ZONE = 150;
const QUEUE_ZONE = 130;
const PER_APPROACH_CAPACITY = 8;

export function congestionLevel(density: number, threshold: number): Congestion {
  if (density >= threshold) return 'heavy';
  if (density >= 40) return 'moderate';
  return 'free';
}

export function emptyJunctionStats(): JunctionStats {
  return {
    queue: { NS: 0, EW: 0 },
    approach: { NS: 0, EW: 0 },
    vehicles: 0,
    density: 0,
    avgWait: 0,
    waitEma: 0,
    passed: 0,
    sensorOnline: true,
    lastUpdate: 0,
  };
}

export function emptyRoadStats(): RoadStats {
  return {
    count: 0,
    dirCount: { fwd: 0, back: 0 },
    density: 0,
    dirDensity: { fwd: 0, back: 0 },
    avgSpeedKmh: 0,
    congestion: 'free',
    dirCongestion: { fwd: 'free', back: 'free' },
    highSince: null,
    lowSince: null,
  };
}

export function computeStats(s: SimState, cfg: Settings) {
  // Roads.
  const speedSum: Record<string, number> = {};
  const counts: Record<string, { fwd: number; back: number }> = {};
  for (const r of ROADS) {
    counts[r.id] = { fwd: 0, back: 0 };
    speedSum[r.id] = 0;
  }
  for (const v of s.vehicles) {
    const c = counts[v.roadId];
    if (!c) continue;
    if (v.dir === 1) c.fwd += 1;
    else c.back += 1;
    speedSum[v.roadId] += v.speed;
  }
  for (const r of ROADS) {
    const rs = s.roadStats[r.id];
    const c = counts[r.id];
    const total = c.fwd + c.back;
    const half = r.capacity / 2;
    rs.count = total;
    rs.dirCount = c;
    rs.density = Math.min(100, Math.round((total / r.capacity) * 100));
    rs.dirDensity = { fwd: Math.min(100, Math.round((c.fwd / half) * 100)), back: Math.min(100, Math.round((c.back / half) * 100)) };
    rs.avgSpeedKmh = total ? Math.round(((speedSum[r.id] / total) * 3.6) * 10) / 10 : 0;
    const blocked = isRoadBlocked(s, r.id);
    rs.congestion = blocked ? 'blocked' : congestionLevel(rs.density, cfg.congestionThreshold);
    rs.dirCongestion = blocked
      ? { fwd: 'blocked', back: 'blocked' }
      : { fwd: congestionLevel(rs.dirDensity.fwd, cfg.congestionThreshold), back: congestionLevel(rs.dirDensity.back, cfg.congestionThreshold) };
  }

  // Junctions.
  for (const j of JUNCTIONS) {
    const st = s.junctionStats[j.id];
    const sensor = s.devices.find((d) => d.id === `VDS-${j.id}`);
    st.sensorOnline = !!sensor && deviceReachable(s, sensor);
    if (!st.sensorOnline) continue;
    const queue: Record<Axis, number> = { NS: 0, EW: 0 };
    const approach: Record<Axis, number> = { NS: 0, EW: 0 };
    let waitSum = 0;
    let waiting = 0;
    let approaches = 0;
    for (const r of ROADS) {
      if (r.from !== j.id && r.to !== j.id) continue;
      approaches += 1;
    }
    for (const v of s.vehicles) {
      const road = ROAD_MAP[v.roadId];
      if (endNode(road, v.dir) !== j.id) continue;
      const dist = road.length - STOP_OFFSET - v.pos;
      if (dist > APPROACH_ZONE || dist < -1) continue;
      approach[road.axis] += 1;
      if (v.speed < 1 && dist < QUEUE_ZONE) {
        queue[road.axis] += 1;
        waitSum += v.wait;
        waiting += 1;
      }
    }
    st.queue = queue;
    st.approach = approach;
    st.vehicles = approach.NS + approach.EW;
    st.density = Math.min(100, Math.round((st.vehicles / (approaches * PER_APPROACH_CAPACITY)) * 100));
    const live = waiting ? waitSum / waiting : 0;
    st.avgWait = Math.round((0.6 * st.waitEma + 0.4 * live) * 10) / 10;
    st.lastUpdate = s.time;
  }
}
