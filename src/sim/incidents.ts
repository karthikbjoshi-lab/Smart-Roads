// IncidentDetection — creates, deduplicates, escalates and resolves incidents.
// Detector rules (checked once per simulated second):
//   • Heavy congestion: road density ≥ threshold for 15 s  → resolves after 20 s below (threshold − 15)
//   • Waterlogging:     waterlogging risk ≥ threshold       → resolves when risk < threshold − 20
//   • Low visibility:   visibility < threshold              → resolves when visibility > 1.5 × threshold
//   • Severe weather:   rainfall ≥ 30 mm/h                  → resolves when rainfall < 10 mm/h
//   • Road damage:      pothole risk ≥ 85                   → resolves after repair or when risk falls
// One incident exists per (type, location) until it is resolved, and a resolved detector incident cannot
// re-open for 60 s — so the same unresolved problem never produces repeated alerts.

import { SEVERITY_RANK } from './defaults';
import { addEvent, nextId } from './events';
import { ROAD_MAP, ROADS, locationLabel, nodeLabel, roadLabel } from './network';
import { planRoute } from './routing';
import type { EventSeverity, Incident, IncidentType, LocationRef, Settings, Severity, SimState } from './types';

export const INCIDENT_LABEL: Record<IncidentType, string> = {
  collision: 'Vehicle collision',
  blockage: 'Road blockage',
  congestion: 'Heavy congestion',
  waterlogging: 'Waterlogging',
  low_visibility: 'Low visibility',
  severe_weather: 'Severe weather',
  road_damage: 'Road damage',
};

const RESOLVE_COOLDOWN = 60;

function detourText(s: SimState, roadId: string): string {
  const road = ROAD_MAP[roadId];
  const alt = planRoute(s, road.from, road.to, { avoidRoads: [roadId], congestionAware: true });
  if (!alt) return 'no alternative route is available, so hold traffic at the nearest junctions';
  return `divert traffic via ${alt.nodes.join(' → ')}`;
}

function recommendation(s: SimState, type: IncidentType, severity: Severity, loc: LocationRef): string {
  const onRoad = loc.kind === 'road';
  switch (type) {
    case 'collision':
      return severity === 'critical' || severity === 'high'
        ? `Dispatch an ambulance and traffic police (simulated), close the segment and ${onRoad ? detourText(s, loc.id) : 'divert traffic'}.`
        : 'Send a patrol unit to clear the vehicles, keep one lane open and lower the speed limit to 30 km/h.';
    case 'blockage':
      return `Close the segment, ${onRoad ? detourText(s, loc.id) : 'divert traffic'}, and dispatch a clearance crew.`;
    case 'congestion':
      return 'Extend green on the congested approach (adaptive signals) and show a delay warning on variable message signs.';
    case 'waterlogging':
      return 'Deploy drainage pumps, keep speed under 30 km/h on this segment and close it if water keeps rising.';
    case 'low_visibility':
      return 'Lower the speed advisory to 25 km/h, raise streetlight brightness and display fog warnings.';
    case 'severe_weather':
      return 'Issue a weather advisory, reduce speed limits network-wide and put maintenance crews on standby.';
    case 'road_damage':
      return 'Place warning signs, reduce speed on the segment and schedule pothole repair in the maintenance queue.';
  }
}

function description(type: IncidentType, severity: Severity, loc: LocationRef, source: Incident['source']): string {
  const where = locationLabel(loc);
  const by = source === 'operator' ? 'Simulated by the operator' : 'Detected automatically from simulated sensor data';
  switch (type) {
    case 'collision':
      return `${by}: ${severity} collision on ${where}.`;
    case 'blockage':
      return `${by}: the carriageway on ${where} is blocked.`;
    case 'congestion':
      return `${by}: traffic density stayed above the congestion threshold on ${where}.`;
    case 'waterlogging':
      return `${by}: rainfall and poor drainage raised the waterlogging risk on ${where}.`;
    case 'low_visibility':
      return `${by}: visibility fell below the safety threshold across the network.`;
    case 'severe_weather':
      return `${by}: heavy rainfall is affecting the whole network.`;
    case 'road_damage':
      return `${by}: vibration and surface readings indicate potholes on ${where}.`;
  }
}

export function toEventSeverity(sev: Severity): EventSeverity {
  return sev;
}

export interface IncidentInput {
  type: IncidentType;
  severity: Severity;
  location: LocationRef;
  position?: number;
  source: Incident['source'];
}

export function activeIncidents(s: SimState) {
  return s.incidents.filter((i) => i.status !== 'resolved');
}

/** Creates an incident unless the same (type, location) is already open. Returns the open incident. */
export function createIncident(s: SimState, input: IncidentInput): { incident: Incident; created: boolean } | null {
  const { type, severity, location, source } = input;
  if (location.kind === 'road' && !ROAD_MAP[location.id]) return null;
  const key = `${type}:${location.kind}:${location.id}`;
  const existing = s.incidents.find((i) => i.key === key && i.status !== 'resolved');
  if (existing) {
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity]) {
      existing.severity = severity;
      existing.blocksRoad = blocks(type, severity);
      existing.recommendation = recommendation(s, type, severity, location);
      existing.log.push({ t: s.time, text: `Escalated to ${severity}` });
      addEvent(s, {
        category: 'incident',
        severity: toEventSeverity(severity),
        location: locationLabel(location),
        message: `${existing.title} escalated to ${severity} severity`,
        status: 'Escalated',
      });
    }
    return { incident: existing, created: false };
  }
  if (source === 'detector') {
    const until = s.cooldowns[`inc:${key}`];
    if (until !== undefined && s.time < until) return null;
  }

  const where = locationLabel(location);
  const incident: Incident = {
    id: nextId(s, 'INC'),
    key,
    type,
    severity,
    location,
    status: 'active',
    createdAt: s.time,
    acknowledgedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    title: `${INCIDENT_LABEL[type]}${location.kind === 'network' ? ' (network-wide)' : ` — ${location.kind === 'road' ? ROAD_MAP[location.id].name : nodeLabel(location.id)}`}`,
    description: description(type, severity, location, source),
    recommendation: '',
    source,
    blocksRoad: blocks(type, severity),
    position: input.position ?? 0.5,
    speedFactor: speedFactor(type, severity),
    log: [{ t: s.time, text: source === 'operator' ? 'Created by operator (simulation)' : 'Raised by detector rule' }],
  };
  incident.recommendation = recommendation(s, type, severity, location);
  s.incidents.unshift(incident);
  if (s.incidents.length > 200) s.incidents.length = 200;
  addEvent(s, {
    category: 'incident',
    severity: toEventSeverity(severity),
    location: where,
    message: `${INCIDENT_LABEL[type]} ${source === 'operator' ? 'simulated' : 'detected'} — ${severity} severity${incident.blocksRoad ? ', road closed to traffic' : ''}`,
    status: 'Active',
  });
  return { incident, created: true };
}

function blocks(type: IncidentType, severity: Severity) {
  if (type === 'blockage') return true;
  if (type === 'collision') return SEVERITY_RANK[severity] >= 3;
  return false;
}

function speedFactor(type: IncidentType, severity: Severity) {
  switch (type) {
    case 'collision':
      return SEVERITY_RANK[severity] >= 3 ? 0.3 : 0.45;
    case 'waterlogging':
      return severity === 'critical' ? 0.4 : 0.6;
    case 'road_damage':
      return 0.7;
    case 'blockage':
      return 0.3;
    default:
      return 1;
  }
}

export function acknowledgeIncident(s: SimState, id: string) {
  const inc = s.incidents.find((i) => i.id === id);
  if (!inc || inc.status !== 'active') return;
  inc.status = 'acknowledged';
  inc.acknowledgedAt = s.time;
  inc.log.push({ t: s.time, text: 'Acknowledged by operator' });
  addEvent(s, {
    category: 'incident',
    severity: 'low',
    location: locationLabel(inc.location),
    message: `${inc.id} acknowledged — ${INCIDENT_LABEL[inc.type].toLowerCase()} response in progress`,
    status: 'Acknowledged',
  });
}

export function resolveIncident(s: SimState, id: string, by: 'operator' | 'system' = 'operator') {
  const inc = s.incidents.find((i) => i.id === id);
  if (!inc || inc.status === 'resolved') return;
  inc.status = 'resolved';
  inc.resolvedAt = s.time;
  inc.resolvedBy = by;
  inc.log.push({ t: s.time, text: by === 'operator' ? 'Resolved by operator' : 'Cleared automatically (condition no longer detected)' });
  s.cooldowns[`inc:${inc.key}`] = s.time + RESOLVE_COOLDOWN;
  addEvent(s, {
    category: 'incident',
    severity: 'low',
    location: locationLabel(inc.location),
    message: `${inc.id} resolved${by === 'system' ? ' automatically' : ''} — ${INCIDENT_LABEL[inc.type].toLowerCase()} cleared${inc.blocksRoad ? ', road reopened' : ''}`,
    status: 'Resolved',
  });
}

function findOpen(s: SimState, type: IncidentType, loc: LocationRef) {
  const key = `${type}:${loc.kind}:${loc.id}`;
  return s.incidents.find((i) => i.key === key && i.status !== 'resolved');
}

export function detectIncidents(s: SimState, cfg: Settings) {
  const t = s.time;
  // Heavy congestion on a road segment.
  for (const road of ROADS) {
    const rs = s.roadStats[road.id];
    if (!rs) continue;
    const loc: LocationRef = { kind: 'road', id: road.id };
    if (rs.density >= cfg.congestionThreshold) {
      rs.lowSince = null;
      if (rs.highSince === null) rs.highSince = t;
      if (t - rs.highSince >= 15) {
        createIncident(s, { type: 'congestion', severity: rs.density >= 90 ? 'high' : 'medium', location: loc, source: 'detector' });
      }
    } else {
      rs.highSince = null;
      const open = findOpen(s, 'congestion', loc);
      if (open && open.source === 'detector' && rs.density < cfg.congestionThreshold - 15) {
        if (rs.lowSince === null) rs.lowSince = t;
        if (t - rs.lowSince >= 20) resolveIncident(s, open.id, 'system');
      } else if (!open) rs.lowSince = null;
    }

    // Waterlogging & road damage.
    const rh = s.roadHealth[road.id];
    if (!rh) continue;
    if (rh.waterRisk >= cfg.waterloggingThreshold) {
      createIncident(s, {
        type: 'waterlogging',
        severity: rh.waterRisk >= 97 ? 'critical' : rh.waterRisk >= 88 ? 'high' : 'medium',
        location: loc,
        source: 'detector',
        position: 0.55,
      });
    } else if (rh.waterRisk < cfg.waterloggingThreshold - 20) {
      const open = findOpen(s, 'waterlogging', loc);
      if (open && open.source === 'detector') resolveIncident(s, open.id, 'system');
    }
    if (rh.potholeRisk >= 85) {
      createIncident(s, { type: 'road_damage', severity: 'high', location: loc, source: 'detector', position: 0.45 });
    } else if (rh.potholeRisk < cfg.potholeThreshold - 10) {
      const open = findOpen(s, 'road_damage', loc);
      if (open) resolveIncident(s, open.id, 'system');
    }
  }

  // Network-wide weather hazards.
  const net: LocationRef = { kind: 'network', id: 'network' };
  if (s.weather.visibility < cfg.visibilityThreshold) {
    createIncident(s, { type: 'low_visibility', severity: s.weather.visibility < cfg.visibilityThreshold / 2 ? 'high' : 'medium', location: net, source: 'detector' });
  } else if (s.weather.visibility > cfg.visibilityThreshold * 1.5) {
    const open = findOpen(s, 'low_visibility', net);
    if (open) resolveIncident(s, open.id, 'system');
  }
  if (s.weather.rainfall >= 30) {
    createIncident(s, { type: 'severe_weather', severity: 'medium', location: net, source: 'detector' });
  } else if (s.weather.rainfall < 10) {
    const open = findOpen(s, 'severe_weather', net);
    if (open) resolveIncident(s, open.id, 'system');
  }
}

/** Short label for a location, e.g. "Lake Road (B–C)". */
export function incidentWhere(inc: Incident) {
  return inc.location.kind === 'road' ? roadLabel(inc.location.id) : locationLabel(inc.location);
}
