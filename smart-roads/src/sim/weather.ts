// Virtual environmental sensors: temperature, rainfall, ambient light, visibility and AQI.
// Readings move smoothly towards the preset of the selected condition, so changes look like
// real sensor data instead of jumping instantly.

import { addEvent } from './events';
import { clamp } from './random';
import type { SimState, WeatherCondition, WeatherState } from './types';

export interface WeatherPreset {
  label: string;
  description: string;
  temperature: number;
  rainfall: number;
  lightFactor: number;
  visibility: number;
  aqi: number;
  speedAdvisory: number;
}

export const WEATHER_PRESETS: Record<WeatherCondition, WeatherPreset> = {
  clear: { label: 'Clear', description: 'Dry roads, good visibility', temperature: 27, rainfall: 0, lightFactor: 1, visibility: 2000, aqi: 72, speedAdvisory: 50 },
  rain: { label: 'Rain', description: 'Wet roads, slightly lower visibility', temperature: 24, rainfall: 9, lightFactor: 0.55, visibility: 1200, aqi: 58, speedAdvisory: 40 },
  heavy_rain: { label: 'Heavy rain', description: 'Waterlogging risk on poorly drained roads', temperature: 22, rainfall: 42, lightFactor: 0.3, visibility: 450, aqi: 50, speedAdvisory: 30 },
  fog: { label: 'Fog', description: 'Very low visibility — hazard warning', temperature: 19, rainfall: 0, lightFactor: 0.4, visibility: 120, aqi: 96, speedAdvisory: 25 },
  low_light: { label: 'Low light', description: 'Heavy overcast — dark conditions', temperature: 25, rainfall: 0, lightFactor: 0.08, visibility: 1500, aqi: 78, speedAdvisory: 40 },
};

export const WEATHER_ORDER: WeatherCondition[] = ['clear', 'rain', 'heavy_rain', 'fog', 'low_light'];

/** Seconds since midnight shown on the simulated clock. */
export function clockSeconds(s: Pick<SimState, 'startClock' | 'time'>): number {
  const v = (s.startClock + s.time) % 86400;
  return v < 0 ? v + 86400 : v;
}

/** Clear-sky daylight (lux) for a time of day. Sunrise ≈ 06:00, sunset ≈ 18:30. */
export function dayLux(clock: number): number {
  const h = clock / 3600;
  const sun = Math.sin((Math.PI * (h - 6)) / 12.5);
  const day = h > 6 && h < 18.5 ? 25000 * Math.pow(Math.max(0, sun), 1.2) : 0;
  return day + 4; // urban sky glow at night
}

export function initialWeather(condition: WeatherCondition, clock: number): WeatherState {
  const p = WEATHER_PRESETS[condition];
  return {
    condition,
    temperature: p.temperature,
    rainfall: p.rainfall,
    lightFactor: p.lightFactor,
    ambientLux: Math.round(dayLux(clock) * p.lightFactor),
    visibility: p.visibility,
    aqi: p.aqi,
    speedAdvisory: p.speedAdvisory,
    changedAt: 0,
  };
}

const approach = (cur: number, target: number, dt: number, tau: number) => cur + (target - cur) * Math.min(1, dt / tau);

export function updateWeather(s: SimState, dt: number, visibilityThreshold: number) {
  const w = s.weather;
  const p = WEATHER_PRESETS[w.condition];
  w.temperature = approach(w.temperature, p.temperature, dt, 25);
  w.rainfall = approach(w.rainfall, p.rainfall, dt, 5);
  if (Math.abs(w.rainfall - p.rainfall) < 0.05) w.rainfall = p.rainfall;
  w.lightFactor = approach(w.lightFactor, p.lightFactor, dt, 5);
  w.visibility = approach(w.visibility, p.visibility, dt, 6);
  w.aqi = approach(w.aqi, p.aqi, dt, 20);
  w.ambientLux = Math.max(0, dayLux(clockSeconds(s)) * w.lightFactor);
  w.speedAdvisory = w.visibility < visibilityThreshold ? Math.min(p.speedAdvisory, 25) : p.speedAdvisory;
}

export function setWeather(s: SimState, condition: WeatherCondition) {
  if (s.weather.condition === condition) return;
  s.weather.condition = condition;
  s.weather.changedAt = s.time;
  const p = WEATHER_PRESETS[condition];
  addEvent(s, {
    category: 'weather',
    severity: condition === 'heavy_rain' || condition === 'fog' ? 'medium' : 'low',
    location: 'Whole network',
    message: `Weather sensors report ${p.label.toLowerCase()} (simulated) — speed advisory ${p.speedAdvisory} km/h`,
    status: 'Updated',
  });
}

/** Moves the virtual clock so that it currently reads `hour` (e.g. 22 = 10 PM). */
export function setClock(s: SimState, hour: number) {
  const target = clamp(hour, 0, 23.99) * 3600;
  s.startClock = target - s.time;
  s.weather.ambientLux = dayLux(clockSeconds(s)) * s.weather.lightFactor;
  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60);
  addEvent(s, {
    category: 'system',
    severity: 'info',
    location: 'Whole network',
    message: `Virtual time of day set to ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    status: 'Operator',
  });
}
