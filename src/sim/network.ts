import type { Axis, MapNode, Road } from './types';

// A fixed, deterministic road graph: 6 signalised junctions (A–F) in a 3×2 grid,
// plus 5 entry/exit points (terminals) on the edges. Coordinates are SVG map units.
export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 700;

export const NODES: MapNode[] = [
  { id: 'A', name: 'Central Square', short: 'A', x: 260, y: 200, kind: 'junction', gatewayId: 'GW-WEST' },
  { id: 'B', name: 'Market Circle', short: 'B', x: 600, y: 200, kind: 'junction', gatewayId: 'GW-CENTRAL' },
  { id: 'C', name: 'Lake View', short: 'C', x: 940, y: 200, kind: 'junction', gatewayId: 'GW-EAST' },
  { id: 'D', name: 'University Gate', short: 'D', x: 260, y: 500, kind: 'junction', gatewayId: 'GW-WEST' },
  { id: 'E', name: 'Metro Hub', short: 'E', x: 600, y: 500, kind: 'junction', gatewayId: 'GW-CENTRAL' },
  { id: 'F', name: 'Riverside', short: 'F', x: 940, y: 500, kind: 'junction', gatewayId: 'GW-EAST' },
  { id: 'FIRE', name: 'Fire Station', short: 'Fire Stn', x: 60, y: 200, kind: 'terminal', gatewayId: 'GW-WEST' },
  { id: 'POLICE', name: 'Police HQ', short: 'Police HQ', x: 600, y: 40, kind: 'terminal', gatewayId: 'GW-CENTRAL' },
  { id: 'AIRPORT', name: 'Airport Road', short: 'Airport Rd', x: 1140, y: 200, kind: 'terminal', gatewayId: 'GW-EAST' },
  { id: 'TECH', name: 'Tech Park', short: 'Tech Park', x: 260, y: 660, kind: 'terminal', gatewayId: 'GW-WEST' },
  { id: 'HOSPITAL', name: 'City Hospital', short: 'Hospital', x: 1140, y: 500, kind: 'terminal', gatewayId: 'GW-EAST' },
];

const ROAD_DEFS: Array<[string, string, string, string, number]> = [
  // id, name, from, to, drainage
  ['A-B', 'Central Avenue', 'A', 'B', 0.75],
  ['B-C', 'Lake Road', 'B', 'C', 0.5],
  ['D-E', 'College Road', 'D', 'E', 0.8],
  ['E-F', 'River Road', 'E', 'F', 0.3],
  ['A-D', 'Park Street', 'A', 'D', 0.7],
  ['B-E', 'Market Street', 'B', 'E', 0.6],
  ['C-F', 'Lakeside Drive', 'C', 'F', 0.35],
  ['FIRE-A', 'Fire Station Link', 'FIRE', 'A', 0.85],
  ['POLICE-B', 'Police HQ Link', 'POLICE', 'B', 0.85],
  ['C-AIRPORT', 'Airport Road', 'C', 'AIRPORT', 0.9],
  ['D-TECH', 'Tech Park Link', 'D', 'TECH', 0.65],
  ['F-HOSPITAL', 'Hospital Road', 'F', 'HOSPITAL', 0.8],
];

export const NODE_MAP: Record<string, MapNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));

export const ROADS: Road[] = ROAD_DEFS.map(([id, name, from, to, drainage]) => {
  const a = NODE_MAP[from];
  const b = NODE_MAP[to];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const axis: Axis = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? 'EW' : 'NS';
  return { id, name, from, to, length, axis, drainage, capacity: Math.max(6, Math.round(length / 24)) };
});

export const ROAD_MAP: Record<string, Road> = Object.fromEntries(ROADS.map((r) => [r.id, r]));
export const JUNCTIONS = NODES.filter((n) => n.kind === 'junction');
export const TERMINALS = NODES.filter((n) => n.kind === 'terminal');
export const GATEWAYS = [
  { id: 'GW-WEST', name: 'Gateway West', x: 170, y: 350 },
  { id: 'GW-CENTRAL', name: 'Gateway Central', x: 520, y: 350 },
  { id: 'GW-EAST', name: 'Gateway East', x: 1030, y: 350 },
];

/** Distance from a junction centre to the stop line (map units). */
export const STOP_OFFSET = 24;
/** Vehicles keep to the LEFT (as in India). Offset from the road centre line. */
export const LANE_OFFSET = 7;

export function roadsAt(nodeId: string): Road[] {
  return ROADS.filter((r) => r.from === nodeId || r.to === nodeId);
}

export function otherEnd(road: Road, nodeId: string): string {
  return road.from === nodeId ? road.to : road.from;
}

export function roadBetween(a: string, b: string): Road | undefined {
  return ROADS.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));
}

export function endNode(road: Road, dir: 1 | -1): string {
  return dir === 1 ? road.to : road.from;
}

export function startNode(road: Road, dir: 1 | -1): string {
  return dir === 1 ? road.from : road.to;
}

export function dirFrom(road: Road, fromNode: string): 1 | -1 {
  return road.from === fromNode ? 1 : -1;
}

/** Position of a vehicle on a road, in map units, including the left-hand lane offset. */
export function pointOnRoad(road: Road, dir: 1 | -1, pos: number, laneOffset = LANE_OFFSET) {
  const a = NODE_MAP[startNode(road, dir)];
  const b = NODE_MAP[endNode(road, dir)];
  const f = Math.min(1, Math.max(0, pos / road.length));
  const dx = (b.x - a.x) / road.length;
  const dy = (b.y - a.y) / road.length;
  // Left-hand normal in screen coordinates (y grows downwards).
  const nx = dy;
  const ny = -dx;
  return {
    x: a.x + (b.x - a.x) * f + nx * laneOffset,
    y: a.y + (b.y - a.y) * f + ny * laneOffset,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

/** Point at fraction t (0..1) from road.from towards road.to, optionally offset sideways. */
export function roadPoint(road: Road, t: number, side = 0) {
  const a = NODE_MAP[road.from];
  const b = NODE_MAP[road.to];
  const dx = (b.x - a.x) / road.length;
  const dy = (b.y - a.y) / road.length;
  return { x: a.x + (b.x - a.x) * t + dy * side, y: a.y + (b.y - a.y) * t - dx * side };
}

export function nodeLabel(id: string): string {
  const n = NODE_MAP[id];
  if (!n) return id;
  return n.kind === 'junction' ? `Junction ${n.id} · ${n.name}` : n.name;
}

export function roadLabel(id: string): string {
  const r = ROAD_MAP[id];
  return r ? `${r.name} (${shortNode(r.from)}–${shortNode(r.to)})` : id;
}

function shortNode(id: string) {
  const n = NODE_MAP[id];
  return n.kind === 'junction' ? n.id : n.short;
}

export function locationLabel(loc: { kind: string; id: string }): string {
  if (loc.kind === 'road') return roadLabel(loc.id);
  if (loc.kind === 'junction') return nodeLabel(loc.id);
  return 'Whole network';
}

/** Pedestrian crossings: placed on a road, a short distance from a junction. */
export const CROSSINGS = [
  { id: 'X1', roadId: 'A-B', junctionId: 'A', t: 52 / 340 },
  { id: 'X2', roadId: 'B-E', junctionId: 'B', t: 52 / 300 },
  { id: 'X3', roadId: 'D-E', junctionId: 'E', t: 1 - 52 / 340 },
  { id: 'X4', roadId: 'E-F', junctionId: 'F', t: 1 - 52 / 340 },
].map((c) => ({ ...c, ...roadPoint(ROAD_MAP[c.roadId], c.t) }));

/** Streetlight positions, on the kerb beside each road. */
export const STREETLIGHT_SPOTS: Array<{ roadId: string; t: number }> = [
  { roadId: 'A-B', t: 0.32 },
  { roadId: 'A-B', t: 0.7 },
  { roadId: 'B-C', t: 0.5 },
  { roadId: 'D-E', t: 0.3 },
  { roadId: 'D-E', t: 0.68 },
  { roadId: 'E-F', t: 0.5 },
  { roadId: 'A-D', t: 0.5 },
  { roadId: 'B-E', t: 0.55 },
  { roadId: 'C-F', t: 0.5 },
  { roadId: 'FIRE-A', t: 0.5 },
  { roadId: 'F-HOSPITAL', t: 0.5 },
  { roadId: 'D-TECH', t: 0.55 },
];

export const KERB_OFFSET = 24;
