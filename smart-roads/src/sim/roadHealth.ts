// Predictive maintenance SIMULATION — a transparent rule-based model, not a trained ML model.
//
// Per road, once per simulated second:
//   surface      slowly wears with each vehicle passage (heavy vehicles ×3, ×1.8 when raining)
//   vibration    = 0.5 + 0.045 × (100 − surface) + 0.008 × traffic density + damage boost   (mm/s, simulated)
//   waterRisk    → rises towards rainfall/42 × 100 × (1.25 − drainage) + 0.15 × (100 − surface)
//   potholeRisk  = 0.9 × (100 − surface) + 9 × max(0, vibration − 1.6) + 0.2 × waterRisk
//   health       = 0.6 × surface + 0.25 × (100 − potholeRisk) + 0.15 × (100 − waterRisk)
// Rules every 5 s create maintenance recommendations when a configurable threshold is crossed.

import { SEVERITY_RANK } from './defaults';
import { addEvent, nextId, takeCooldown } from './events';
import { createIncident, resolveIncident } from './incidents';
import { ROADS, ROAD_MAP, roadLabel } from './network';
import { clamp, range } from './random';
import type { MaintenanceKind, MaintenanceTask, RoadHealth, Settings, Severity, SimState } from './types';

const INITIAL_SURFACE: Record<string, number> = {
  'A-B': 88,
  'B-C': 76,
  'D-E': 84,
  'E-F': 63,
  'A-D': 81,
  'B-E': 72,
  'C-F': 69,
  'FIRE-A': 91,
  'POLICE-B': 94,
  'C-AIRPORT': 92,
  'D-TECH': 79,
  'F-HOSPITAL': 86,
};

const DAY = 86400;

export function initRoadHealth(): Record<string, RoadHealth> {
  const out: Record<string, RoadHealth> = {};
  ROADS.forEach((road, i) => {
    const surface = INITIAL_SURFACE[road.id] ?? 85;
    const rh: RoadHealth = {
      roadId: road.id,
      surface,
      vibration: 0,
      damageBoost: 0,
      potholeRisk: 0,
      waterRisk: 0,
      health: 0,
      priority: 'low',
      lastInspection: -DAY * (1 + ((i * 5) % 12)) - 3600 * ((i * 7) % 9),
      passages: 0,
      wear: 0,
      sensorOnline: true,
    };
    recompute(rh, 0);
    out[road.id] = rh;
  });
  return out;
}

export function priorityFor(health: number, healthThreshold: number): Severity {
  if (health < 40) return 'critical';
  if (health < healthThreshold) return 'high';
  if (health < 75) return 'medium';
  return 'low';
}

function recompute(rh: RoadHealth, density: number, healthThreshold = 60) {
  rh.vibration = clamp(0.5 + 0.045 * (100 - rh.surface) + 0.008 * density + rh.damageBoost, 0.2, 12);
  rh.potholeRisk = clamp(0.9 * (100 - rh.surface) + 9 * Math.max(0, rh.vibration - 1.6) + 0.2 * rh.waterRisk, 0, 100);
  rh.health = clamp(0.6 * rh.surface + 0.25 * (100 - rh.potholeRisk) + 0.15 * (100 - rh.waterRisk), 0, 100);
  rh.priority = priorityFor(rh.health, healthThreshold);
}

export function waterTarget(rainfall: number, drainage: number, surface: number) {
  if (rainfall <= 0.2) return 0;
  return clamp((rainfall / 42) * 100 * (1.25 - drainage) + 0.15 * (100 - surface), 0, 100);
}

export function updateRoadHealth(s: SimState, cfg: Settings) {
  const raining = s.weather.rainfall > 2;
  for (const road of ROADS) {
    const rh = s.roadHealth[road.id];
    const sensor = s.devices.find((d) => d.type === 'road_sensor' && d.location.kind === 'road' && d.location.id === road.id && !d.custom);
    const gwOnline = sensor?.gatewayId ? isGatewayOnline(s, sensor.gatewayId) : true;
    rh.sensorOnline = !!sensor && sensor.status === 'online' && gwOnline;

    // Physical model (always runs — the road does not stop wearing when a sensor is offline).
    if (rh.wear > 0) {
      rh.surface = clamp(rh.surface - rh.wear * 0.004 * (raining ? 1.8 : 1), 5, 100);
      rh.wear = 0;
    }
    const target = waterTarget(s.weather.rainfall, road.drainage, rh.surface);
    const tau = target > rh.waterRisk ? 6 : 25;
    rh.waterRisk = clamp(rh.waterRisk + (target - rh.waterRisk) / tau, 0, 100);
    if (rh.waterRisk < 0.3 && target === 0) rh.waterRisk = 0;

    const density = s.roadStats[road.id]?.density ?? 0;
    const prevVib = rh.vibration;
    recompute(rh, density, cfg.healthThreshold);
    // Small sensor noise on vibration so the trace looks like a live reading.
    rh.vibration = clamp(rh.vibration + range(s, -0.06, 0.06), 0.2, 12);
    if (!rh.sensorOnline) rh.vibration = prevVib;
  }
  if (Math.floor(s.time) % 5 === 0) checkMaintenance(s, cfg);
}

function isGatewayOnline(s: SimState, gatewayId: string) {
  const gw = s.devices.find((d) => d.id === gatewayId);
  return !gw || gw.status === 'online';
}

function riskFrom(value: number): Severity {
  if (value >= 90) return 'critical';
  if (value >= 75) return 'high';
  if (value >= 50) return 'medium';
  return 'low';
}

interface TaskInput {
  roadId: string;
  kind: MaintenanceKind;
  issue: string;
  action: string;
  risk: Severity;
  reading: string;
}

export function addTask(s: SimState, input: TaskInput): MaintenanceTask | null {
  const key = `${input.kind}:${input.roadId}`;
  const existing = s.maintenance.find((m) => m.key === key && m.status !== 'completed');
  if (existing) {
    if (SEVERITY_RANK[input.risk] > SEVERITY_RANK[existing.risk]) {
      existing.risk = input.risk;
      existing.priority = input.risk;
      existing.reading = input.reading;
      existing.updatedAt = s.time;
    }
    return null;
  }
  const until = s.cooldowns[`mt:${key}`];
  if (until !== undefined && s.time < until) return null;
  const task: MaintenanceTask = {
    id: nextId(s, 'MT'),
    key,
    roadId: input.roadId,
    issue: input.issue,
    kind: input.kind,
    risk: input.risk,
    action: input.action,
    priority: input.risk,
    status: 'open',
    createdAt: s.time,
    updatedAt: s.time,
    reading: input.reading,
  };
  s.maintenance.unshift(task);
  if (s.maintenance.length > 120) s.maintenance.length = 120;
  addEvent(s, {
    category: 'maintenance',
    severity: SEVERITY_RANK[input.risk] >= 3 ? 'medium' : 'low',
    location: roadLabel(input.roadId),
    message: `Maintenance recommended: ${input.issue.toLowerCase()} (${input.reading})`,
    status: 'Open',
  });
  return task;
}

export function checkMaintenance(s: SimState, cfg: Settings) {
  for (const road of ROADS) {
    const rh = s.roadHealth[road.id];
    if (!rh.sensorOnline) continue;
    if (rh.potholeRisk >= cfg.potholeThreshold) {
      addTask(s, {
        roadId: road.id,
        kind: 'pothole',
        issue: 'Pothole risk exceeded the configured threshold',
        action: 'Schedule pothole patching within 24 hours and place warning signs',
        risk: riskFrom(rh.potholeRisk),
        reading: `pothole risk ${Math.round(rh.potholeRisk)} % ≥ ${cfg.potholeThreshold} %`,
      });
    }
    if (rh.health < cfg.healthThreshold) {
      addTask(s, {
        roadId: road.id,
        kind: 'surface',
        issue: 'Road health score below threshold',
        action: 'Plan a detailed inspection and resurfacing of the segment',
        risk: rh.health < 40 ? 'critical' : 'high',
        reading: `health ${Math.floor(rh.health)} / 100 < ${cfg.healthThreshold}`,
      });
    }
    if (rh.waterRisk >= cfg.waterloggingThreshold) {
      addTask(s, {
        roadId: road.id,
        kind: 'drainage',
        issue: 'Drainage capacity exceeded',
        action: 'Clear roadside drains and keep pumps on standby',
        risk: riskFrom(rh.waterRisk),
        reading: `waterlogging risk ${Math.round(rh.waterRisk)} % ≥ ${cfg.waterloggingThreshold} %`,
      });
    }
    if (rh.vibration >= 4.5) {
      addTask(s, {
        roadId: road.id,
        kind: 'vibration',
        issue: 'Abnormal vibration detected',
        action: 'Send an inspection crew to check for structural damage',
        risk: rh.vibration >= 6 ? 'high' : 'medium',
        reading: `vibration ${rh.vibration.toFixed(1)} mm/s ≥ 4.5 mm/s`,
      });
    }
  }
}

/** Operator action: simulate sudden surface damage (e.g. a pothole after a heavy truck). */
export function simulateDamage(s: SimState, roadId: string, cfg: Settings) {
  const rh = s.roadHealth[roadId];
  if (!rh) return;
  rh.surface = clamp(rh.surface - 24, 5, 100);
  rh.damageBoost = Math.min(4, rh.damageBoost + 2.8);
  recompute(rh, s.roadStats[roadId]?.density ?? 0, cfg.healthThreshold);
  addEvent(s, {
    category: 'maintenance',
    severity: 'high',
    location: roadLabel(roadId),
    message: `Road-condition sensor reports a vibration spike of ${rh.vibration.toFixed(1)} mm/s — possible pothole (simulated damage event)`,
    status: 'Detected',
  });
  addTask(s, {
    roadId,
    kind: 'damage',
    issue: 'Sudden surface damage detected',
    action: 'Close the damaged lane, place warning signs and dispatch a repair crew',
    risk: riskFrom(rh.potholeRisk),
    reading: `vibration ${rh.vibration.toFixed(1)} mm/s, pothole risk ${Math.round(rh.potholeRisk)} %`,
  });
  if (rh.potholeRisk >= cfg.potholeThreshold) {
    createIncident(s, { type: 'road_damage', severity: rh.potholeRisk >= 85 ? 'high' : 'medium', location: { kind: 'road', id: roadId }, source: 'detector', position: 0.45 });
  }
}

export function inspectRoad(s: SimState, roadId: string) {
  const rh = s.roadHealth[roadId];
  if (!rh) return;
  rh.lastInspection = s.time;
  if (!takeCooldown(s, `inspect:${roadId}`, 2)) return;
  addEvent(s, {
    category: 'maintenance',
    severity: 'info',
    location: roadLabel(roadId),
    message: `Inspection logged: health ${Math.round(rh.health)}, surface ${Math.round(rh.surface)}, vibration ${rh.vibration.toFixed(1)} mm/s, pothole risk ${Math.round(rh.potholeRisk)} %`,
    status: 'Inspected',
  });
}

export function acknowledgeTask(s: SimState, id: string) {
  const task = s.maintenance.find((m) => m.id === id);
  if (!task || task.status !== 'open') return;
  task.status = 'acknowledged';
  task.updatedAt = s.time;
  addEvent(s, { category: 'maintenance', severity: 'info', location: roadLabel(task.roadId), message: `${task.id} acknowledged — crew scheduled (simulated)`, status: 'Acknowledged' });
}

export function completeTask(s: SimState, id: string, cfg: Settings) {
  const task = s.maintenance.find((m) => m.id === id);
  if (!task || task.status === 'completed') return;
  const rh = s.roadHealth[task.roadId];
  task.status = 'completed';
  task.updatedAt = s.time;
  switch (task.kind) {
    case 'pothole':
    case 'damage':
      rh.surface = clamp(rh.surface + 20, 0, 96);
      rh.damageBoost = 0;
      break;
    case 'surface':
      rh.surface = Math.max(rh.surface, 95);
      rh.damageBoost = 0;
      break;
    case 'vibration':
      rh.damageBoost = 0;
      rh.surface = clamp(rh.surface + 5, 0, 96);
      break;
    case 'drainage':
      rh.waterRisk *= 0.4;
      break;
  }
  rh.lastInspection = s.time;
  recompute(rh, s.roadStats[task.roadId]?.density ?? 0, cfg.healthThreshold);
  s.cooldowns[`mt:${task.key}`] = s.time + 60;
  // Close any matching road-damage incident.
  if (task.kind !== 'drainage') {
    const inc = s.incidents.find((i) => i.type === 'road_damage' && i.location.id === task.roadId && i.status !== 'resolved');
    if (inc) resolveIncident(s, inc.id, 'system');
  }
  addEvent(s, {
    category: 'maintenance',
    severity: 'low',
    location: roadLabel(task.roadId),
    message: `${task.id} completed — ${ROAD_MAP[task.roadId].name} health now ${Math.round(rh.health)} / 100`,
    status: 'Completed',
  });
}

export function averageHealth(s: Pick<SimState, 'roadHealth'>) {
  const list = Object.values(s.roadHealth);
  return list.reduce((sum, r) => sum + r.health, 0) / Math.max(1, list.length);
}
