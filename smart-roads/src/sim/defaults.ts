import type { Settings, Severity, EventSeverity } from './types';

export const DEFAULT_SETTINGS: Settings = {
  speed: 1,
  defaultWeather: 'clear',
  startHour: 17.75,
  adaptive: true,
  minGreen: 10,
  maxGreen: 45,
  fixedGreen: 20,
  secondsPerVehicle: 2.5,
  emergencyPriority: true,
  congestionThreshold: 70,
  potholeThreshold: 65,
  waterloggingThreshold: 70,
  healthThreshold: 60,
  visibilityThreshold: 200,
  lightingMode: 'auto',
  daylightLux: 1000,
  ecoMinBrightness: 20,
  motionHoldSeconds: 8,
  ratedWatts: 90,
  baselineWatts: 150,
  bufferDuringOutage: true,
  notifyToasts: true,
  notifyMinSeverity: 'high',
  historyMinutes: 60,
  theme: 'system',
};

export const SPEED_OPTIONS = [0.5, 1, 2, 5] as const;

/** Fixed timings of the signal state machine (seconds). */
export const YELLOW_TIME = 3;
export const ALL_RED_TIME = 1.5;
/** An emergency vehicle requests priority when it is this close to the stop line (map units ≈ metres). */
export const PRIORITY_DISTANCE = 230;
/** Minimum green a conflicting approach keeps before priority pre-emption (safety). */
export const PREEMPT_MIN_GREEN = 2;
/** Base number of vehicles kept on the network. */
export const BASE_VEHICLES = 38;
/** History sample interval (simulated seconds). */
export const SAMPLE_EVERY = 5;

export const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
export const EVENT_SEVERITY_RANK: Record<EventSeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
