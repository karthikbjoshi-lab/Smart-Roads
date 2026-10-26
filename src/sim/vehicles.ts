// Vehicle movement on the fixed road graph.
// Vehicles drive on the left, follow the vehicle ahead with a minimum gap, stop at red signals, never
// enter a full road (spill-back), and choose their next road at each junction (no U-turns).
// Emergency vehicles follow a Dijkstra route, overtake ordinary traffic and request signal priority.

import { BASE_VEHICLES, PRIORITY_DISTANCE } from './defaults';
import { addEvent, nextId } from './events';
import {
  CROSSINGS,
  NODE_MAP,
  ROAD_MAP,
  ROADS,
  STOP_OFFSET,
  TERMINALS,
  dirFrom,
  endNode,
  nodeLabel,
  otherEnd,
  roadBetween,
  roadLabel,
  roadsAt,
} from './network';
import { chance, int, pick, rand, range, weightedPick } from './random';
import { isRoadBlocked, planRoute } from './routing';
import { AXIS_LABEL, lightFor, phaseLabel } from './signals';
import { rfidRead } from './devices';
import type { EmergencyInfo, EmergencyKind, Road, Settings, SimState, Vehicle, VehicleKind } from './types';

export const BASE_SPEED: Record<VehicleKind, number> = {
  car: 13,
  bike: 12,
  bus: 10,
  truck: 9.5,
  ambulance: 17,
  fire: 15.5,
  police: 18,
};

export const EMERGENCY_LABEL: Record<EmergencyKind, string> = { ambulance: 'Ambulance', fire: 'Fire engine', police: 'Police vehicle' };
const EMERGENCY_PREFIX: Record<EmergencyKind, string> = { ambulance: 'AMB', fire: 'FIRE', police: 'POL' };

const GAP = 15;
const ACCEL = 4.5;

export function isEmergency(kind: VehicleKind): kind is EmergencyKind {
  return kind === 'ambulance' || kind === 'fire' || kind === 'police';
}

function laneKey(roadId: string, dir: 1 | -1) {
  return `${roadId}|${dir}`;
}

function randomKind(s: SimState): VehicleKind {
  const r = rand(s);
  if (r < 0.64) return 'car';
  if (r < 0.8) return 'bike';
  if (r < 0.9) return 'truck';
  return 'bus';
}

function activeHotspot(s: SimState) {
  return s.hotspot && s.time < s.hotspot.until ? s.hotspot.junctionId : null;
}

/** Picks the road a vehicle will take at the end of `road`. Null = exit (terminal) or nowhere to go. */
export function chooseNextRoad(s: SimState, road: Road, dir: 1 | -1): string | null {
  const end = endNode(road, dir);
  if (NODE_MAP[end].kind === 'terminal') return null;
  const options = roadsAt(end).filter((r) => r.id !== road.id && !isRoadBlocked(s, r.id));
  if (!options.length) return null;
  const hot = activeHotspot(s);
  const choice = weightedPick(s, options, (r) => {
    const other = otherEnd(r, end);
    let w = NODE_MAP[other].kind === 'terminal' ? 0.45 : 1;
    if (hot) {
      if (other === hot) w *= 6;
      else if (end === hot) w *= 1;
      else if (roadBetween(other, hot)) w *= 2;
    }
    return w;
  });
  return choice?.id ?? null;
}

function laneTail(lanes: Map<string, Vehicle[]>, roadId: string, dir: 1 | -1): number {
  const lane = lanes.get(laneKey(roadId, dir));
  if (!lane || !lane.length) return Infinity;
  let min = Infinity;
  for (const v of lane) if (!isEmergency(v.kind) && v.pos < min) min = v.pos;
  return min;
}

function roadSpeedFactor(s: SimState, roadId: string, cfg: Settings): number {
  let f = s.weather.speedAdvisory / 50;
  for (const inc of s.incidents) {
    if (inc.status !== 'resolved' && inc.location.kind === 'road' && inc.location.id === roadId && !inc.blocksRoad) {
      f = Math.min(f, inc.speedFactor * (s.weather.speedAdvisory / 50));
    }
  }
  const rh = s.roadHealth[roadId];
  if (rh) {
    if (rh.waterRisk >= cfg.waterloggingThreshold) f *= 0.65;
    if (rh.potholeRisk >= cfg.potholeThreshold) f *= 0.8;
  }
  return Math.max(0.2, f);
}

/** Positions (along the travel direction) of incidents that block this road. */
function blockPositions(s: SimState, road: Road, dir: 1 | -1): number[] {
  const out: number[] = [];
  for (const inc of s.incidents) {
    if (inc.status === 'resolved' || !inc.blocksRoad || inc.location.kind !== 'road' || inc.location.id !== road.id) continue;
    out.push(dir === 1 ? inc.position * road.length : (1 - inc.position) * road.length);
  }
  return out;
}

function makeVehicle(s: SimState, roadId: string, dir: 1 | -1, pos: number, kind: VehicleKind = randomKind(s)): Vehicle {
  const road = ROAD_MAP[roadId];
  const v: Vehicle = {
    id: nextId(s, 'V', 4),
    kind,
    roadId,
    dir,
    pos,
    speed: BASE_SPEED[kind] * 0.6,
    wait: 0,
    nextRoadId: null,
    route: null,
    tint: int(s, 0, 4),
  };
  v.nextRoadId = chooseNextRoad(s, road, dir);
  return v;
}

/** Places the starting traffic evenly across the network (no overlaps). */
export function seedVehicles(s: SimState, count = BASE_VEHICLES) {
  let attempts = 0;
  while (s.vehicles.length < count && attempts < count * 30) {
    attempts += 1;
    const road = weightedPick(s, ROADS, (r) => r.length)!;
    const dir: 1 | -1 = chance(s, 0.5) ? 1 : -1;
    const pos = range(s, STOP_OFFSET + 6, road.length - STOP_OFFSET - 6);
    const clash = s.vehicles.some((v) => v.roadId === road.id && v.dir === dir && Math.abs(v.pos - pos) < GAP + 2);
    if (!clash) s.vehicles.push(makeVehicle(s, road.id, dir, pos));
  }
}

function spawnFromTerminals(s: SimState, lanes: Map<string, Vehicle[]>) {
  const hot = activeHotspot(s);
  const target = s.baseVehicles + (hot ? 24 : 0);
  const normal = s.vehicles.filter((v) => !isEmergency(v.kind)).length;
  let toSpawn = Math.min(2, target - normal);
  // During a traffic surge, keep feeding vehicles into the hotspot's approaches.
  if (hot && toSpawn > 0) {
    const incoming = roadsAt(hot).filter((r) => !isRoadBlocked(s, r.id));
    const road = pick(s, incoming);
    const dir: 1 | -1 = road.to === hot ? 1 : -1;
    if (laneTail(lanes, road.id, dir) > STOP_OFFSET + GAP + 6) {
      const v = makeVehicle(s, road.id, dir, STOP_OFFSET + 2);
      s.vehicles.push(v);
      const key = laneKey(road.id, dir);
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key)!.push(v);
      toSpawn -= 1;
    }
  }
  let guard = 0;
  while (toSpawn > 0 && guard < 6) {
    guard += 1;
    const term = pick(s, TERMINALS);
    const road = roadsAt(term.id)[0];
    const dir = dirFrom(road, term.id);
    if (laneTail(lanes, road.id, dir) < GAP + 6) continue;
    const v = makeVehicle(s, road.id, dir, 2);
    s.vehicles.push(v);
    const key = laneKey(road.id, dir);
    if (!lanes.has(key)) lanes.set(key, []);
    lanes.get(key)!.push(v);
    toSpawn -= 1;
  }
}

/** Operator action: a surge of traffic heading into one junction (to demonstrate congestion). */
export function generateTraffic(s: SimState, junctionId: string, amount = 16) {
  const j = NODE_MAP[junctionId];
  if (!j || j.kind !== 'junction') return 0;
  const incoming = roadsAt(junctionId).filter((r) => !isRoadBlocked(s, r.id));
  let added = 0;
  for (let i = 0; i < amount * 3 && added < amount; i++) {
    const road = incoming[i % incoming.length];
    const dir: 1 | -1 = road.to === junctionId ? 1 : -1;
    const pos = range(s, STOP_OFFSET + 4, road.length * 0.55);
    const clash = s.vehicles.some((v) => v.roadId === road.id && v.dir === dir && Math.abs(v.pos - pos) < GAP + 1);
    if (clash) continue;
    s.vehicles.push(makeVehicle(s, road.id, dir, pos, chance(s, 0.2) ? 'bus' : randomKind(s)));
    added += 1;
  }
  s.hotspot = { junctionId, until: s.time + 150 };
  addEvent(s, {
    category: 'traffic',
    severity: 'medium',
    location: nodeLabel(junctionId),
    message: `Traffic density increasing at Junction ${junctionId} — ${added} additional vehicles approaching (simulated surge)`,
    status: 'Monitoring',
  });
  return added;
}

export interface SpawnResult {
  ok: boolean;
  message: string;
  vehicleId?: string;
}

export function spawnEmergency(s: SimState, kind: EmergencyKind, origin: string, destination: string): SpawnResult {
  if (!NODE_MAP[origin] || !NODE_MAP[destination]) return { ok: false, message: 'Choose a valid start point and destination.' };
  if (origin === destination) return { ok: false, message: 'Start point and destination must be different.' };
  const route = planRoute(s, origin, destination, { congestionAware: true });
  if (!route) return { ok: false, message: 'No open route between those points — a road may be blocked.' };
  const first = ROAD_MAP[route.roads[0]];
  const dir = dirFrom(first, origin);
  const id = nextId(s, EMERGENCY_PREFIX[kind], 2);
  const startPos = NODE_MAP[origin].kind === 'terminal' ? 2 : STOP_OFFSET;
  const v: Vehicle = {
    id,
    kind,
    roadId: first.id,
    dir,
    pos: startPos,
    speed: 8,
    wait: 0,
    nextRoadId: null,
    route: route.nodes.slice(2),
    tint: 0,
  };
  s.vehicles.push(v);
  const info: EmergencyInfo = {
    vehicleId: id,
    kind,
    label: `${EMERGENCY_LABEL[kind]} ${id}`,
    origin,
    destination,
    routeNodes: route.nodes,
    routeLength: route.length,
    status: 'en_route',
    spawnedAt: s.time,
    arrivedAt: null,
    eta: route.length / BASE_SPEED[kind],
    nextJunction: null,
    priorityAt: null,
    priorityGranted: [],
    location: roadLabel(first.id),
    stops: 0,
    delay: 0,
    replans: 0,
  };
  s.emergencies.unshift(info);
  if (s.emergencies.length > 30) s.emergencies.length = 30;
  addEvent(s, {
    category: 'emergency',
    severity: 'high',
    location: nodeLabel(origin),
    message: `${info.label} dispatched (simulation) to ${nodeLabel(destination)} via ${route.nodes.join(' → ')}`,
    status: 'En route',
  });
  return { ok: true, message: `${info.label} is on its way to ${NODE_MAP[destination].name}.`, vehicleId: id };
}

export function endEmergencyDemo(s: SimState) {
  let n = 0;
  for (const e of s.emergencies) {
    if (e.status === 'en_route') {
      e.status = 'cancelled';
      e.arrivedAt = s.time;
      n += 1;
    }
  }
  s.vehicles = s.vehicles.filter((v) => !isEmergency(v.kind));
  for (const sig of Object.values(s.signals)) sig.priority = null;
  if (n) {
    addEvent(s, { category: 'emergency', severity: 'low', location: 'Whole network', message: `Emergency demonstration ended — ${n} vehicle(s) stood down, normal signal operation resumed`, status: 'Ended' });
  }
  return n;
}

function clearPriority(s: SimState, junctionId: string, vehicleId: string) {
  const sig = s.signals[junctionId];
  if (sig?.priority?.vehicleId === vehicleId) {
    sig.priority = null;
    addEvent(s, {
      category: 'signal',
      severity: 'info',
      location: nodeLabel(junctionId),
      message: `${vehicleId} cleared Junction ${junctionId} — normal signal operation resumed`,
      status: 'Resumed',
    });
  }
}

function emergencyArrive(s: SimState, v: Vehicle, info: EmergencyInfo | undefined, gone: Set<string>) {
  gone.add(v.id);
  for (const sig of Object.values(s.signals)) if (sig.priority?.vehicleId === v.id) sig.priority = null;
  if (info) {
    info.status = 'arrived';
    info.arrivedAt = s.time;
    info.eta = 0;
    info.nextJunction = null;
    info.priorityAt = null;
    info.location = NODE_MAP[info.destination].name;
    const secs = Math.round(s.time - info.spawnedAt);
    addEvent(s, {
      category: 'emergency',
      severity: 'low',
      location: nodeLabel(info.destination),
      message: `${info.label} reached ${NODE_MAP[info.destination].name} in ${secs} s (simulated) — ${info.priorityGranted.length} priority signal(s), ${Math.round(info.delay)} s waiting`,
      status: 'Arrived',
    });
  }
}

/** Advances every vehicle by dt seconds. */
export function updateVehicles(s: SimState, dt: number, cfg: Settings) {
  const lanes = new Map<string, Vehicle[]>();
  for (const v of s.vehicles) {
    const key = laneKey(v.roadId, v.dir);
    let lane = lanes.get(key);
    if (!lane) lanes.set(key, (lane = []));
    lane.push(v);
  }
  for (const lane of lanes.values()) lane.sort((a, b) => b.pos - a.pos);

  const gone = new Set<string>();
  const crossings: Array<{ v: Vehicle; junction: string }> = [];
  const factors = new Map<string, number>();
  const speedFactor = (roadId: string) => {
    let f = factors.get(roadId);
    if (f === undefined) factors.set(roadId, (f = roadSpeedFactor(s, roadId, cfg)));
    return f;
  };

  for (const [key, lane] of lanes) {
    const roadId = key.split('|')[0];
    const road = ROAD_MAP[roadId];
    const dir = lane[0]?.dir ?? 1;
    const end = endNode(road, dir);
    const endIsJunction = NODE_MAP[end].kind === 'junction';
    const sig = endIsJunction ? s.signals[end] : null;
    const color = sig ? lightFor(sig, road.axis) : 'green';
    const stopPos = road.length - STOP_OFFSET;
    const blocks = blockPositions(s, road, dir);
    const factor = speedFactor(roadId);

    let leader = Infinity;
    let emLeader = Infinity;
    for (const v of lane) {
      const em = isEmergency(v.kind);
      const info = em ? s.emergencies.find((e) => e.vehicleId === v.id) : undefined;
      let limit = (em ? emLeader : leader) - GAP;
      for (const b of blocks) if (b >= v.pos - 2) limit = Math.min(limit, b - 10);

      // Emergency: arrival & priority requests.
      if (em && info && end === info.destination && v.pos >= (endIsJunction ? stopPos - 1 : road.length - 6)) {
        emergencyArrive(s, v, info, gone);
        continue;
      }
      if (em && info) {
        info.nextJunction = endIsJunction ? end : null;
        if (sig && cfg.emergencyPriority && v.pos <= stopPos + 0.01) {
          const dist = stopPos - v.pos;
          if (dist < PRIORITY_DISTANCE && (!sig.priority || sig.priority.vehicleId === v.id)) {
            if (!sig.priority) {
              const current = phaseLabel(sig.phase);
              sig.priority = { vehicleId: v.id, axis: road.axis, since: s.time };
              info.priorityAt = end;
              if (!info.priorityGranted.includes(end)) info.priorityGranted.push(end);
              addEvent(s, {
                category: 'emergency',
                severity: 'medium',
                location: nodeLabel(end),
                message: `Priority request from ${v.id}: ${AXIS_LABEL[road.axis]} green requested (current phase: ${current})`,
                status: lightFor(sig, road.axis) === 'green' ? 'Green extended' : 'Pre-empting',
              });
              rfidRead(s, end, v.id, cfg);
            }
          }
        }
      }

      // Stop line.
      if (endIsJunction && v.pos <= stopPos + 0.01) {
        let mayGo = color === 'green' || (color === 'yellow' && stopPos - v.pos < v.speed * 1.1);
        if (em) {
          if (!v.nextRoadId) {
            const nextNode = v.route?.[0];
            let r = nextNode ? roadBetween(end, nextNode) : undefined;
            if (!r || isRoadBlocked(s, r.id)) {
              // Re-plan around the blockage from the next junction.
              const re = info ? planRoute(s, end, info.destination) : null;
              if (re && info) {
                v.route = re.nodes.slice(1);
                info.routeNodes = [...info.routeNodes.slice(0, info.routeNodes.indexOf(end) + 1), ...re.nodes.slice(1)];
                info.replans += 1;
                r = roadBetween(end, re.nodes[1]);
                addEvent(s, { category: 'emergency', severity: 'medium', location: nodeLabel(end), message: `${v.id} re-routed around a blocked road via ${re.nodes.join(' → ')}`, status: 'Re-routed' }, `replan:${v.id}`, 20);
              } else r = undefined;
            }
            v.nextRoadId = r?.id ?? null;
          }
        } else if (!v.nextRoadId || isRoadBlocked(s, v.nextRoadId)) {
          v.nextRoadId = chooseNextRoad(s, road, dir);
        }
        if (!v.nextRoadId) mayGo = false;
        else if (!em) {
          const next = ROAD_MAP[v.nextRoadId];
          if (laneTail(lanes, next.id, dirFrom(next, end)) < STOP_OFFSET + GAP) mayGo = false; // spill-back
        }
        if (!mayGo) limit = Math.min(limit, stopPos);
      }

      const vmax = BASE_SPEED[v.kind] * (em ? Math.max(0.75, factor) : factor);
      let speed = Math.min(vmax, v.speed + ACCEL * dt);
      let np = v.pos + speed * dt;
      if (np > limit) {
        np = Math.max(v.pos, limit);
        speed = (np - v.pos) / dt;
      }
      if (speed < 0.6) {
        if (em && info && v.speed >= 0.6) info.stops += 1;
        v.wait += dt;
        if (info) info.delay += dt;
      }
      v.speed = speed;
      v.pos = np;
      leader = v.pos;
      if (em) emLeader = v.pos;

      if (endIsJunction && v.pos > stopPos && v.nextRoadId) crossings.push({ v, junction: end });
      else if (!endIsJunction && v.pos >= road.length - 4) {
        if (em) emergencyArrive(s, v, info, gone);
        else gone.add(v.id);
      }
    }
  }

  // Move vehicles that crossed a junction onto their next road.
  for (const { v, junction } of crossings) {
    if (gone.has(v.id)) continue;
    const from = ROAD_MAP[v.roadId];
    const next = ROAD_MAP[v.nextRoadId!];
    const st = s.junctionStats[junction];
    if (st) {
      st.passed += 1;
      st.waitEma = st.waitEma * 0.9 + v.wait * 0.1;
    }
    const rh = s.roadHealth[from.id];
    if (rh) {
      rh.passages += 1;
      rh.wear += v.kind === 'truck' || v.kind === 'bus' || v.kind === 'fire' ? 3 : v.kind === 'bike' ? 0.4 : 1;
    }
    v.roadId = next.id;
    v.dir = dirFrom(next, junction);
    v.pos = STOP_OFFSET;
    v.wait = 0;
    if (isEmergency(v.kind)) {
      v.route = v.route ? v.route.slice(1) : null;
      v.nextRoadId = null;
      clearPriority(s, junction, v.id);
    } else {
      v.nextRoadId = chooseNextRoad(s, next, v.dir);
    }
  }
  if (gone.size) s.vehicles = s.vehicles.filter((v) => !gone.has(v.id));

  // Emergency ETAs (simulated estimate).
  for (const info of s.emergencies) {
    if (info.status !== 'en_route') continue;
    const v = s.vehicles.find((x) => x.id === info.vehicleId);
    if (!v) continue;
    const road = ROAD_MAP[v.roadId];
    let dist = road.length - v.pos;
    let prev = endNode(road, v.dir);
    let junctions = NODE_MAP[prev].kind === 'junction' && prev !== info.destination ? 1 : 0;
    for (const n of v.route ?? []) {
      const r = roadBetween(prev, n);
      if (r) dist += r.length;
      if (NODE_MAP[n].kind === 'junction' && n !== info.destination) junctions += 1;
      prev = n;
    }
    info.eta = dist / BASE_SPEED[info.kind] + junctions * (cfg.emergencyPriority ? 1.5 : 9);
    info.location = roadLabel(v.roadId);
    if (!s.signals[info.priorityAt ?? '']?.priority) info.priorityAt = null;
  }

  // Spawning (once per second is enough; called every tick with a probability).
  if (chance(s, Math.min(1, dt))) spawnFromTerminals(s, lanes);
}

/** Pedestrians appear at crossings while the crossed road has a red signal. */
export function updatePedestrians(s: SimState) {
  for (const c of CROSSINGS) {
    if ((s.pedestrians[c.id] ?? -1) > s.time) continue;
    const sig = s.signals[c.junctionId];
    const axis = ROAD_MAP[c.roadId].axis;
    if (sig && lightFor(sig, axis) === 'red' && chance(s, 0.12)) s.pedestrians[c.id] = s.time + 6;
  }
}
