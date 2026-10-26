// RoutePlanner — Dijkstra's shortest path over the fixed road graph.
// Edge cost = length × (1 + 1.5 × density/100) when congestion-aware, so busy roads look "longer".
// Roads blocked by an active incident are skipped entirely.

import { NODES, ROADS, otherEnd } from './network';
import type { SimState } from './types';

export interface RouteResult {
  nodes: string[];
  roads: string[];
  length: number;
  cost: number;
}

export interface RouteOptions {
  congestionAware?: boolean;
  avoidRoads?: string[];
}

export function isRoadBlocked(s: Pick<SimState, 'incidents'>, roadId: string): boolean {
  return s.incidents.some(
    (i) => i.status !== 'resolved' && i.blocksRoad && i.location.kind === 'road' && i.location.id === roadId,
  );
}

export function planRoute(
  s: Pick<SimState, 'incidents' | 'roadStats'>,
  from: string,
  to: string,
  opts: RouteOptions = {},
): RouteResult | null {
  if (from === to) return null;
  const congestionAware = opts.congestionAware ?? true;
  const dist = new Map<string, number>();
  const prev = new Map<string, { node: string; road: string }>();
  const done = new Set<string>();
  for (const n of NODES) dist.set(n.id, Infinity);
  dist.set(from, 0);

  while (done.size < NODES.length) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!done.has(id) && d < best) {
        best = d;
        cur = id;
      }
    }
    if (cur === null) break;
    if (cur === to) break;
    done.add(cur);

    for (const road of ROADS) {
      if (road.from !== cur && road.to !== cur) continue;
      if (opts.avoidRoads?.includes(road.id)) continue;
      if (isRoadBlocked(s, road.id)) continue;
      const next = otherEnd(road, cur);
      if (done.has(next)) continue;
      const density = s.roadStats[road.id]?.density ?? 0;
      const cost = road.length * (congestionAware ? 1 + 1.5 * (density / 100) : 1);
      const nd = best + cost;
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        prev.set(next, { node: cur, road: road.id });
      }
    }
  }

  if (!prev.has(to)) return null;
  const nodes = [to];
  const roads: string[] = [];
  let cur = to;
  while (cur !== from) {
    const p = prev.get(cur)!;
    roads.unshift(p.road);
    nodes.unshift(p.node);
    cur = p.node;
  }
  const length = roads.reduce((sum, id) => sum + (ROADS.find((r) => r.id === id)?.length ?? 0), 0);
  return { nodes, roads, length, cost: dist.get(to) ?? Infinity };
}
