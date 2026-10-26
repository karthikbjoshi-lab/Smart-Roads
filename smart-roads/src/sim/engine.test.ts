// Automated checks for the simulation engine. Run with: npm test
import { describe, expect, it } from 'vitest';
import { createInitialState, runFor, step } from './engine';
import { DEFAULT_SETTINGS } from './defaults';
import { lightFor, planGreen } from './signals';
import { createIncident, resolveIncident, acknowledgeIncident, detectIncidents } from './incidents';
import { planRoute } from './routing';
import { spawnEmergency } from './vehicles';
import { setDeviceStatus } from './devices';
import { setWeather } from './weather';
import { JUNCTIONS, ROADS } from './network';

const cfg = { ...DEFAULT_SETTINGS };
const fresh = () => createInitialState(cfg, { seed: 42 });

describe('traffic signal controller', () => {
  it('never shows green or yellow to both approaches at the same time', () => {
    const s = fresh();
    for (let i = 0; i < 3000; i++) {
      step(s, 0.1, cfg);
      for (const j of JUNCTIONS) {
        const sig = s.signals[j.id];
        const ns = lightFor(sig, 'NS');
        const ew = lightFor(sig, 'EW');
        expect(ns === 'red' || ew === 'red').toBe(true);
      }
    }
  });

  it('gives a longer green to a busier approach, within the limits', () => {
    const s = fresh();
    const sig = s.signals.B;
    s.junctionStats.B.queue = { NS: 12, EW: 0 };
    s.junctionStats.B.approach = { NS: 12, EW: 0 };
    s.junctionStats.B.sensorOnline = true;
    const busy = planGreen(s, sig, 'NS', cfg);
    s.junctionStats.B.queue = { NS: 0, EW: 0 };
    s.junctionStats.B.approach = { NS: 0, EW: 0 };
    const quiet = planGreen(s, sig, 'NS', cfg);
    expect(busy).toBeGreaterThan(quiet);
    expect(busy).toBeLessThanOrEqual(cfg.maxGreen);
    expect(quiet).toBeGreaterThanOrEqual(cfg.minGreen);
  });

  it('uses the fixed cycle when adaptive control is off', () => {
    const s = fresh();
    s.junctionStats.B.queue = { NS: 12, EW: 0 };
    expect(planGreen(s, s.signals.B, 'NS', { ...cfg, adaptive: false })).toBe(cfg.fixedGreen);
  });

  it('falls back to fixed timing when the junction sensor fails', () => {
    const s = fresh();
    setDeviceStatus(s, 'VDS-C', 'failed');
    runFor(s, 2, cfg);
    expect(s.junctionStats.C.sensorOnline).toBe(false);
    expect(s.signals.C.control).toBe('fallback');
  });
});

describe('incident lifecycle', () => {
  it('creates, de-duplicates, acknowledges and resolves an incident', () => {
    const s = fresh();
    const first = createIncident(s, { type: 'collision', severity: 'high', location: { kind: 'road', id: 'B-C' }, source: 'operator' });
    const again = createIncident(s, { type: 'collision', severity: 'high', location: { kind: 'road', id: 'B-C' }, source: 'operator' });
    expect(first?.created).toBe(true);
    expect(again?.created).toBe(false);
    expect(s.incidents.filter((i) => i.status !== 'resolved')).toHaveLength(1);
    expect(first!.incident.blocksRoad).toBe(true);

    acknowledgeIncident(s, first!.incident.id);
    expect(s.incidents[0].status).toBe('acknowledged');
    resolveIncident(s, first!.incident.id);
    expect(s.incidents[0].status).toBe('resolved');
  });

  it('does not repeat alerts every tick for the same condition', () => {
    const s = fresh();
    setWeather(s, 'fog');
    runFor(s, 30, cfg);
    for (let i = 0; i < 20; i++) detectIncidents(s, cfg);
    expect(s.incidents.filter((i) => i.type === 'low_visibility')).toHaveLength(1);
  });
});

describe('route planner', () => {
  it('finds a connected route between two entry points', () => {
    const s = fresh();
    const r = planRoute(s, 'FIRE', 'HOSPITAL');
    expect(r).not.toBeNull();
    expect(r!.nodes[0]).toBe('FIRE');
    expect(r!.nodes[r!.nodes.length - 1]).toBe('HOSPITAL');
    // Every hop must be a real road.
    for (const id of r!.roads) expect(ROADS.some((road) => road.id === id)).toBe(true);
  });

  it('avoids a blocked road', () => {
    const s = fresh();
    const before = planRoute(s, 'A', 'B', { congestionAware: false });
    expect(before!.roads).toEqual(['A-B']);
    createIncident(s, { type: 'blockage', severity: 'high', location: { kind: 'road', id: 'A-B' }, source: 'operator' });
    const after = planRoute(s, 'A', 'B', { congestionAware: false });
    expect(after!.roads).not.toContain('A-B');
  });

  it('delivers an ambulance to its destination with signal priority', () => {
    const s = fresh();
    const res = spawnEmergency(s, 'ambulance', 'FIRE', 'HOSPITAL');
    expect(res.ok).toBe(true);
    runFor(s, 150, cfg, 0.1);
    const e = s.emergencies[0];
    expect(e.status).toBe('arrived');
    expect(e.priorityGranted.length).toBeGreaterThan(0);
  });
});
