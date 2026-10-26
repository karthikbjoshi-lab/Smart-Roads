// SimulationEngine — one central clock drives every module in a fixed order:
//   weather → signals → vehicles → sensor statistics → streetlights
//   and once per simulated second: incident detection, road health, device messaging, pedestrians.
// All functions mutate the state they are given (the store wraps them in Immer).

import { BASE_VEHICLES, SAMPLE_EVERY } from './defaults';
import { addEvent } from './events';
import { JUNCTIONS, ROADS } from './network';
import { createSignal, updateSignals } from './signals';
import { computeStats, emptyJunctionStats, emptyRoadStats } from './stats';
import { initialWeather, updateWeather } from './weather';
import { initStreetlights, updateLights } from './lighting';
import { initRoadHealth, updateRoadHealth } from './roadHealth';
import { buildDevices, updateDevices } from './devices';
import { detectIncidents } from './incidents';
import { seedVehicles, updatePedestrians, updateVehicles } from './vehicles';
import { takeSample } from './history';
import type { NetworkStats, Settings, SimState } from './types';

export function emptyNet(): NetworkStats {
  return {
    sent: 0,
    delivered: 0,
    processed: 0,
    failed: 0,
    avgLatencyMs: 0,
    edgeLatencyMs: 0,
    cloudLatencyMs: 0,
    windowSent: [],
    windowDelivered: [],
    windowFailed: [],
    curSent: 0,
    curDelivered: 0,
    curFailed: 0,
  };
}

export interface InitOptions {
  seed?: number;
  /** Simulated seconds to pre-run so that charts and traffic look "lived in" at start. */
  warmup?: number;
}

export function createInitialState(cfg: Settings, opts: InitOptions = {}): SimState {
  const startClock = Math.round(cfg.startHour * 3600);
  const s: SimState = {
    status: 'stopped',
    time: 0,
    startClock,
    seed: opts.seed ?? 20261026,
    hasRun: false,
    vehicles: [],
    emergencies: [],
    signals: {},
    adjustments: [],
    junctionStats: {},
    roadStats: {},
    incidents: [],
    events: [],
    weather: initialWeather(cfg.defaultWeather, startClock),
    streetlights: initStreetlights(),
    wasDark: false,
    roadHealth: initRoadHealth(),
    maintenance: [],
    devices: [],
    messages: [],
    net: emptyNet(),
    history: [],
    baseVehicles: BASE_VEHICLES,
    hotspot: null,
    counters: {},
    cooldowns: {},
    secondAcc: 0,
    lastSampleAt: -Infinity,
    pedestrians: {},
  };
  JUNCTIONS.forEach((j, i) => {
    s.signals[j.id] = createSignal(j.id, i, cfg);
    s.junctionStats[j.id] = emptyJunctionStats();
  });
  for (const r of ROADS) s.roadStats[r.id] = emptyRoadStats();
  s.devices = buildDevices(s);
  s.wasDark = s.weather.ambientLux < cfg.daylightLux;
  seedVehicles(s);
  computeStats(s, cfg);

  const warm = opts.warmup ?? 0;
  if (warm > 0) {
    const dt = 0.2;
    for (let t = 0; t < warm; t += dt) step(s, dt, cfg);
    // Keep the history and the live picture, but start the event log fresh.
    s.events = [];
    s.adjustments = [];
    s.messages = s.messages.slice(0, 40);
    s.counters.__seq = 0;
  }
  addEvent(s, {
    category: 'system',
    severity: 'info',
    location: 'Control center',
    message: `Simulation ready — ${JUNCTIONS.length} junctions, ${ROADS.length} road segments and ${s.devices.length} virtual IoT devices loaded`,
    status: 'Ready',
  });
  return s;
}

function perSecond(s: SimState, cfg: Settings) {
  updatePedestrians(s);
  updateRoadHealth(s, cfg);
  detectIncidents(s, cfg);
  updateDevices(s, cfg);
  if (s.hotspot && s.time >= s.hotspot.until) s.hotspot = null;
  // Forget expired cooldowns so the map does not grow forever.
  if (Math.floor(s.time) % 30 === 0) {
    for (const [k, until] of Object.entries(s.cooldowns)) if (until < s.time - 5) delete s.cooldowns[k];
  }
}

/** Advance the whole simulation by dt simulated seconds. */
export function step(s: SimState, dt: number, cfg: Settings) {
  s.time += dt;
  updateWeather(s, dt, cfg.visibilityThreshold);
  updateSignals(s, dt, cfg);
  updateVehicles(s, dt, cfg);
  computeStats(s, cfg);
  updateLights(s, dt, cfg);
  s.secondAcc += dt;
  while (s.secondAcc >= 1) {
    s.secondAcc -= 1;
    perSecond(s, cfg);
  }
  if (s.time - s.lastSampleAt >= SAMPLE_EVERY) takeSample(s, cfg);
}

/** Run many steps at once (used by tests and for fast-forwarding). */
export function runFor(s: SimState, seconds: number, cfg: Settings, dt = 0.2) {
  for (let t = 0; t < seconds; t += dt) step(s, dt, cfg);
}
