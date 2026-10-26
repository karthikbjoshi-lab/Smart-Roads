// Core data model for the Smart Roads simulation.
// Every value here is SIMULATED. Nothing is read from real hardware.

export type Axis = 'NS' | 'EW';
export type NodeKind = 'junction' | 'terminal';

/** A point on the road graph: a signalised junction or an entry/exit point (terminal). */
export interface MapNode {
  id: string;
  name: string;
  short: string;
  x: number;
  y: number;
  kind: NodeKind;
  gatewayId: string;
}

/** A two-way road segment between two nodes. Lengths are in map units (~1 unit = 1 metre). */
export interface Road {
  id: string;
  name: string;
  from: string;
  to: string;
  length: number;
  axis: Axis;
  /** 0..1 — how well the road drains water (lower = more waterlogging). */
  drainage: number;
  /** Vehicles the segment can hold (both directions) before it counts as 100 % dense. */
  capacity: number;
}

// ---------- Traffic signals ----------
export type SignalPhase = 'NS_GREEN' | 'NS_YELLOW' | 'NS_ALLRED' | 'EW_GREEN' | 'EW_YELLOW' | 'EW_ALLRED';
export type LightColor = 'green' | 'yellow' | 'red';

export interface SignalAdjustment {
  id: string;
  t: number;
  junctionId: string;
  axis: Axis;
  before: number;
  after: number;
  demand: number;
  reason: string;
}

export interface PriorityRequest {
  vehicleId: string;
  axis: Axis;
  since: number;
}

export interface SignalState {
  junctionId: string;
  phase: SignalPhase;
  /** Seconds left in the current phase. */
  remaining: number;
  /** Total planned length of the current phase. */
  phaseDuration: number;
  /** Seconds spent in the current phase so far. */
  elapsed: number;
  /** Most recent planned green time per approach. */
  plannedGreen: Record<Axis, number>;
  mode: 'auto' | 'manual';
  switchRequested: boolean;
  priority: PriorityRequest | null;
  /** Why the controller is using its current timing. */
  control: 'adaptive' | 'fixed' | 'fallback' | 'manual' | 'priority';
  cycles: number;
}

export interface JunctionStats {
  /** Stopped vehicles waiting at the stop line, per approach. */
  queue: Record<Axis, number>;
  /** Vehicles within ~150 m of the junction, per approach. */
  approach: Record<Axis, number>;
  vehicles: number;
  /** 0..100 */
  density: number;
  /** Average wait in seconds (smoothed). */
  avgWait: number;
  waitEma: number;
  passed: number;
  sensorOnline: boolean;
  lastUpdate: number;
}

export type Congestion = 'free' | 'moderate' | 'heavy' | 'blocked';

export interface RoadStats {
  count: number;
  dirCount: { fwd: number; back: number };
  /** 0..100 */
  density: number;
  dirDensity: { fwd: number; back: number };
  avgSpeedKmh: number;
  congestion: Congestion;
  dirCongestion: { fwd: Congestion; back: Congestion };
  highSince: number | null;
  lowSince: number | null;
}

// ---------- Vehicles ----------
export type EmergencyKind = 'ambulance' | 'fire' | 'police';
export type VehicleKind = 'car' | 'bus' | 'truck' | 'bike' | EmergencyKind;

export interface Vehicle {
  id: string;
  kind: VehicleKind;
  roadId: string;
  /** 1 = travelling from road.from to road.to, -1 = reverse */
  dir: 1 | -1;
  /** Distance travelled along the road in the travel direction. */
  pos: number;
  /** Map units per simulated second. */
  speed: number;
  /** Seconds spent stopped since the last junction. */
  wait: number;
  /** Road the vehicle will take at the end of this one (null = exit / undecided). */
  nextRoadId: string | null;
  /** Remaining nodes to visit after the current road's end node (emergency vehicles only). */
  route: string[] | null;
  tint: number;
}

export interface EmergencyInfo {
  vehicleId: string;
  kind: EmergencyKind;
  label: string;
  origin: string;
  destination: string;
  routeNodes: string[];
  routeLength: number;
  status: 'en_route' | 'arrived' | 'cancelled';
  spawnedAt: number;
  arrivedAt: number | null;
  /** Estimated simulated seconds to arrival. */
  eta: number;
  nextJunction: string | null;
  priorityAt: string | null;
  priorityGranted: string[];
  location: string;
  stops: number;
  delay: number;
  replans: number;
}

// ---------- Incidents & events ----------
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentType =
  | 'collision'
  | 'blockage'
  | 'congestion'
  | 'waterlogging'
  | 'low_visibility'
  | 'severe_weather'
  | 'road_damage';
export type IncidentStatus = 'active' | 'acknowledged' | 'resolved';

export interface LocationRef {
  kind: 'road' | 'junction' | 'network';
  id: string;
}

export interface Incident {
  id: string;
  key: string;
  type: IncidentType;
  severity: Severity;
  location: LocationRef;
  status: IncidentStatus;
  createdAt: number;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
  resolvedBy: 'operator' | 'system' | null;
  title: string;
  description: string;
  recommendation: string;
  source: 'operator' | 'detector';
  blocksRoad: boolean;
  /** Fraction along the road (from road.from) where the incident is. */
  position: number;
  /** Speed multiplier applied to traffic on the affected road (1 = no effect). */
  speedFactor: number;
  log: Array<{ t: number; text: string }>;
}

export type EventCategory =
  | 'traffic'
  | 'signal'
  | 'incident'
  | 'emergency'
  | 'lighting'
  | 'maintenance'
  | 'weather'
  | 'device'
  | 'network'
  | 'system';
export type EventSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface SimEvent {
  id: string;
  seq: number;
  t: number;
  category: EventCategory;
  severity: EventSeverity;
  location: string;
  message: string;
  status: string;
  read: boolean;
}

// ---------- Environment ----------
export type WeatherCondition = 'clear' | 'rain' | 'heavy_rain' | 'fog' | 'low_light';

export interface WeatherState {
  condition: WeatherCondition;
  /** °C */
  temperature: number;
  /** mm per hour */
  rainfall: number;
  /** lux */
  ambientLux: number;
  /** metres */
  visibility: number;
  aqi: number;
  /** Recommended speed limit, km/h */
  speedAdvisory: number;
  /** 0..1 multiplier on ambient daylight from cloud / fog cover (smoothed). */
  lightFactor: number;
  changedAt: number;
}

// ---------- Streetlights ----------
export type LightMode = 'auto' | 'manual' | 'eco';

export interface Streetlight {
  id: string;
  roadId: string;
  t: number;
  x: number;
  y: number;
  /** 0..100 */
  brightness: number;
  manualBrightness: number;
  manualOn: boolean;
  motion: boolean;
  motionUntil: number;
  motionSource: 'vehicle' | 'pedestrian' | null;
  powerW: number;
  energyWh: number;
  baselineWh: number;
  failSafe: boolean;
}

// ---------- Road health ----------
export interface RoadHealth {
  roadId: string;
  /** 0..100 — higher is better */
  surface: number;
  /** mm/s RMS (simulated) */
  vibration: number;
  damageBoost: number;
  /** 0..100 */
  potholeRisk: number;
  /** 0..100 */
  waterRisk: number;
  /** 0..100 combined score — higher is better */
  health: number;
  priority: Severity;
  lastInspection: number;
  passages: number;
  wear: number;
  sensorOnline: boolean;
}

export type MaintenanceKind = 'pothole' | 'surface' | 'drainage' | 'vibration' | 'damage';

export interface MaintenanceTask {
  id: string;
  key: string;
  roadId: string;
  issue: string;
  kind: MaintenanceKind;
  risk: Severity;
  action: string;
  priority: Severity;
  status: 'open' | 'acknowledged' | 'completed';
  createdAt: number;
  updatedAt: number;
  reading: string;
}

// ---------- Devices & messaging ----------
export type DeviceType =
  | 'vehicle_sensor'
  | 'motion_sensor'
  | 'weather_sensor'
  | 'road_sensor'
  | 'rfid_reader'
  | 'streetlight_controller'
  | 'gateway';
export type DeviceStatus = 'online' | 'offline' | 'failed';

export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  location: LocationRef;
  locationLabel: string;
  gatewayId: string | null;
  status: DeviceStatus;
  /** % — null for mains-powered devices */
  battery: number | null;
  lastValue: string;
  lastUpdate: number | null;
  /** Seconds between routine reports. */
  interval: number;
  nextReport: number;
  x: number;
  y: number;
  custom: boolean;
  lowBatteryWarned: boolean;
  /** Linked object, e.g. the streetlight a controller drives. */
  ref: string | null;
}

export type MessageStatus = 'queued' | 'delivered' | 'processed' | 'failed';

export interface IoTMessage {
  id: string;
  deviceId: string;
  gatewayId: string;
  topic: string;
  payload: string;
  createdAt: number;
  status: MessageStatus;
  tier: 'edge' | 'cloud';
  deliverAt: number;
  processAt: number;
  latencyMs: number;
  failReason: string | null;
  test: boolean;
  buffered: boolean;
}

export interface NetworkStats {
  sent: number;
  delivered: number;
  processed: number;
  failed: number;
  /** Exponential moving average of simulated end-to-end latency. */
  avgLatencyMs: number;
  edgeLatencyMs: number;
  cloudLatencyMs: number;
  /** Rolling per-second counts for the last 60 simulated seconds. */
  windowSent: number[];
  windowDelivered: number[];
  windowFailed: number[];
  curSent: number;
  curDelivered: number;
  curFailed: number;
}

// ---------- History & state ----------
export interface HistorySample {
  t: number;
  vehicles: number;
  avgDensity: number;
  avgWait: number;
  /** % of monitored road length at heavy congestion or blocked */
  congestion: number;
  junctionDensity: Record<string, number>;
  junctionCount: Record<string, number>;
  junctionWait: Record<string, number>;
  energyWh: number;
  baselineWh: number;
  avgHealth: number;
  roadHealth: Record<string, number>;
  online: number;
  total: number;
  deliveryRate: number;
  latency: number;
  throughput: number;
  activeIncidents: number;
}

export type SimStatus = 'running' | 'paused' | 'stopped';

export interface SimState {
  status: SimStatus;
  /** Simulated seconds since the scenario began. */
  time: number;
  /** Seconds-of-day shown on the clock when time = 0. */
  startClock: number;
  seed: number;
  /** True once the user has run the simulation (used to offer "new run"). */
  hasRun: boolean;
  vehicles: Vehicle[];
  emergencies: EmergencyInfo[];
  signals: Record<string, SignalState>;
  adjustments: SignalAdjustment[];
  junctionStats: Record<string, JunctionStats>;
  roadStats: Record<string, RoadStats>;
  incidents: Incident[];
  events: SimEvent[];
  weather: WeatherState;
  streetlights: Streetlight[];
  wasDark: boolean;
  roadHealth: Record<string, RoadHealth>;
  maintenance: MaintenanceTask[];
  devices: Device[];
  messages: IoTMessage[];
  net: NetworkStats;
  history: HistorySample[];
  baseVehicles: number;
  hotspot: { junctionId: string; until: number } | null;
  counters: Record<string, number>;
  /** key -> simulated time until which an action is suppressed (debouncing). */
  cooldowns: Record<string, number>;
  secondAcc: number;
  lastSampleAt: number;
  /** crossing id -> time until which a pedestrian is crossing */
  pedestrians: Record<string, number>;
}

export interface Settings {
  speed: number;
  defaultWeather: WeatherCondition;
  /** Virtual time of day (hours, e.g. 17.75 = 17:45) that a fresh scenario starts at. */
  startHour: number;
  adaptive: boolean;
  minGreen: number;
  maxGreen: number;
  fixedGreen: number;
  secondsPerVehicle: number;
  emergencyPriority: boolean;
  congestionThreshold: number;
  potholeThreshold: number;
  waterloggingThreshold: number;
  healthThreshold: number;
  visibilityThreshold: number;
  lightingMode: LightMode;
  daylightLux: number;
  ecoMinBrightness: number;
  motionHoldSeconds: number;
  ratedWatts: number;
  baselineWatts: number;
  bufferDuringOutage: boolean;
  notifyToasts: boolean;
  notifyMinSeverity: EventSeverity;
  historyMinutes: number;
  theme: 'light' | 'dark' | 'system';
}
