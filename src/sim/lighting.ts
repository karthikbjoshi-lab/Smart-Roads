// Smart streetlight simulation. Energy values are SIMULATED ESTIMATES, not measurements.
//
// Brightness rules (per light):
//   Automatic:   off while ambient light ≥ daylight threshold; otherwise 30–80 % depending on how dark
//                it is, raised to 100 % while motion is detected, then back after the hold time.
//   Energy-saving: off in daylight; configurable minimum (default 20 %) at night, 100 % on motion.
//   Manual:      operator sets brightness / on-off per light.
//   Fail-safe:   if a light's controller fails or disconnects, the light runs at 100 % whenever it is dark.
//   Low visibility (fog) raises the night-time minimum.
// Power ≈ rated LED watts × (8 % driver overhead + 92 % × brightness). Baseline = conventional lamp
// running at full power whenever it is dark (dusk-to-dawn).

import { addEvent } from './events';
import { CROSSINGS, KERB_OFFSET, ROAD_MAP, STREETLIGHT_SPOTS, pointOnRoad, roadLabel, roadPoint } from './network';
import { clamp } from './random';
import type { Settings, SimState, Streetlight } from './types';

const MOTION_RADIUS = 40;
const PED_RADIUS = 110;

export function initStreetlights(): Streetlight[] {
  return STREETLIGHT_SPOTS.map((spot, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const p = roadPoint(ROAD_MAP[spot.roadId], spot.t, KERB_OFFSET * side);
    return {
      id: `SL-${String(i + 1).padStart(2, '0')}`,
      roadId: spot.roadId,
      t: spot.t,
      x: p.x,
      y: p.y,
      brightness: 0,
      manualBrightness: 70,
      manualOn: true,
      motion: false,
      motionUntil: -1,
      motionSource: null,
      powerW: 0,
      energyWh: 0,
      baselineWh: 0,
      failSafe: false,
    };
  });
}

export function isDark(s: SimState, cfg: Settings) {
  return s.weather.ambientLux < cfg.daylightLux;
}

export function updateLights(s: SimState, dt: number, cfg: Settings) {
  const lux = s.weather.ambientLux;
  const dark = lux < cfg.daylightLux;
  const darkness = clamp((cfg.daylightLux - lux) / cfg.daylightLux, 0, 1);
  const lowVis = s.weather.visibility < cfg.visibilityThreshold;

  if (dark !== s.wasDark) {
    s.wasDark = dark;
    addEvent(s, {
      category: 'lighting',
      severity: 'low',
      location: 'All streetlights',
      message: dark
        ? `Ambient light fell below ${cfg.daylightLux.toLocaleString()} lx — streetlights switched on (${cfg.lightingMode === 'eco' ? 'energy-saving' : cfg.lightingMode} mode)`
        : `Ambient light above ${cfg.daylightLux.toLocaleString()} lx — streetlights dimmed off for daylight`,
      status: 'Automatic',
    });
  }

  const vehPts = s.vehicles.map((v) => pointOnRoad(ROAD_MAP[v.roadId], v.dir, v.pos));
  const peds = CROSSINGS.filter((c) => (s.pedestrians[c.id] ?? -1) > s.time);

  for (const light of s.streetlights) {
    const ctrl = s.devices.find((d) => d.ref === light.id);
    light.failSafe = !!ctrl && ctrl.status !== 'online';

    let source: Streetlight['motionSource'] = null;
    for (const p of vehPts) {
      if (Math.abs(p.x - light.x) < MOTION_RADIUS && Math.abs(p.y - light.y) < MOTION_RADIUS) {
        source = 'vehicle';
        break;
      }
    }
    if (!source) {
      for (const c of peds) {
        if (Math.hypot(c.x - light.x, c.y - light.y) < PED_RADIUS) {
          source = 'pedestrian';
          break;
        }
      }
    }
    if (source) {
      light.motionUntil = s.time + cfg.motionHoldSeconds;
      light.motionSource = source;
    }
    const wasMotion = light.motion;
    light.motion = s.time < light.motionUntil;
    if (!light.motion) light.motionSource = null;

    let target: number;
    if (light.failSafe) target = dark ? 100 : 0;
    else if (cfg.lightingMode === 'manual') target = light.manualOn ? light.manualBrightness : 0;
    else if (!dark) target = 0;
    else if (cfg.lightingMode === 'eco') {
      target = cfg.ecoMinBrightness;
      if (lowVis) target = Math.max(target, 60);
      if (light.motion) target = 100;
    } else {
      target = 30 + 50 * darkness;
      if (lowVis) target = Math.max(target, 85);
      if (light.motion) target = 100;
    }

    const step = 80 * dt;
    if (light.brightness < target) light.brightness = Math.min(target, light.brightness + step);
    else light.brightness = Math.max(target, light.brightness - step * 0.6);
    light.brightness = Math.round(light.brightness * 10) / 10;

    light.powerW = light.brightness > 0.5 ? cfg.ratedWatts * (0.08 + 0.92 * (light.brightness / 100)) : 0;
    light.energyWh += (light.powerW * dt) / 3600;
    light.baselineWh += dark ? (cfg.baselineWatts * dt) / 3600 : 0;

    if (dark && light.motion && !wasMotion && cfg.lightingMode !== 'manual' && !light.failSafe) {
      addEvent(
        s,
        {
          category: 'lighting',
          severity: 'info',
          location: roadLabel(light.roadId),
          message: `Streetlight ${light.id} brightened to 100 % — ${light.motionSource === 'pedestrian' ? 'pedestrian' : 'vehicle'} detected`,
          status: 'Automatic',
        },
        'light-motion',
        40,
      );
    }
  }
}

export function lightingTotals(s: SimState) {
  let energy = 0;
  let baseline = 0;
  let power = 0;
  let active = 0;
  for (const l of s.streetlights) {
    energy += l.energyWh;
    baseline += l.baselineWh;
    power += l.powerW;
    if (l.brightness > 0.5) active += 1;
  }
  return { energy, baseline, power, active, saved: baseline - energy, total: s.streetlights.length };
}
