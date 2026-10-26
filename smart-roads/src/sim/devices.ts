// SensorGenerator + simulated IoT messaging.
// Devices publish MQTT-style messages (topic + JSON payload) to their roadside gateway. No broker is used:
// each message moves through Queued → Delivered → Processed inside this engine, with simulated latency.
//   • Edge tier  (vehicle, motion, RFID sensors): fast local decisions, ~20–60 ms simulated latency.
//   • Cloud tier (weather, road, streetlight, gateway telemetry): dashboards & analytics, ~120–260 ms.
// When a gateway is offline its devices' messages are buffered (queued) or fail, depending on settings,
// and buffered messages are flushed when the gateway reconnects.

import { addEvent, nextId } from './events';
import { CROSSINGS, GATEWAYS, JUNCTIONS, NODE_MAP, ROADS, ROAD_MAP, nodeLabel, roadLabel, roadPoint } from './network';
import { chance, range } from './random';
import type { Device, DeviceStatus, DeviceType, IoTMessage, LocationRef, Settings, SimState } from './types';

export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  vehicle_sensor: 'Vehicle detection sensor',
  motion_sensor: 'Motion sensor',
  weather_sensor: 'Weather sensor',
  road_sensor: 'Road-condition sensor',
  rfid_reader: 'RFID reader',
  streetlight_controller: 'Streetlight controller',
  gateway: 'Roadside gateway',
};

const INTERVAL: Record<DeviceType, number> = {
  vehicle_sensor: 2,
  motion_sensor: 3,
  weather_sensor: 5,
  road_sensor: 6,
  rfid_reader: 10,
  streetlight_controller: 6,
  gateway: 10,
};

const BATTERY_TYPES: DeviceType[] = ['motion_sensor', 'weather_sensor', 'road_sensor'];
const EDGE_TYPES: DeviceType[] = ['vehicle_sensor', 'motion_sensor', 'rfid_reader'];
const MAX_MESSAGES = 160;

function nearestGateway(x: number): string {
  let best = GATEWAYS[0];
  for (const g of GATEWAYS) if (Math.abs(g.x - x) < Math.abs(best.x - x)) best = g;
  return best.id;
}

function base(partial: Partial<Device> & Pick<Device, 'id' | 'type' | 'location' | 'x' | 'y'>, s: { seed: number }): Device {
  const battery = BATTERY_TYPES.includes(partial.type) ? Math.round(range(s, 58, 99)) : null;
  return {
    name: DEVICE_TYPE_LABEL[partial.type],
    locationLabel: partial.location.kind === 'road' ? roadLabel(partial.location.id) : nodeLabel(partial.location.id),
    gatewayId: partial.type === 'gateway' ? null : nearestGateway(partial.x),
    status: 'online',
    battery,
    lastValue: 'Waiting for first report',
    lastUpdate: null,
    interval: INTERVAL[partial.type],
    nextReport: range(s, 0, INTERVAL[partial.type]),
    custom: false,
    lowBatteryWarned: false,
    ref: null,
    ...partial,
  };
}

export function buildDevices(s: SimState): Device[] {
  const out: Device[] = [];
  for (const j of JUNCTIONS) {
    out.push(base({ id: `VDS-${j.id}`, type: 'vehicle_sensor', location: { kind: 'junction', id: j.id }, x: j.x + 36, y: j.y - 36, gatewayId: j.gatewayId }, s));
  }
  for (const c of CROSSINGS) {
    out.push(base({ id: `MS-${c.id}`, type: 'motion_sensor', location: { kind: 'road', id: c.roadId }, x: c.x, y: c.y + 26 }, s));
  }
  out.push(base({ id: 'WS-01', type: 'weather_sensor', name: 'Weather station (Market Circle)', location: { kind: 'junction', id: 'B' }, x: NODE_MAP.B.x - 46, y: NODE_MAP.B.y - 46, gatewayId: 'GW-CENTRAL' }, s));
  out.push(base({ id: 'WS-02', type: 'weather_sensor', name: 'Weather station (Riverside)', location: { kind: 'junction', id: 'F' }, x: NODE_MAP.F.x + 46, y: NODE_MAP.F.y + 46, gatewayId: 'GW-EAST' }, s));
  for (const road of ROADS) {
    const p = roadPoint(road, 0.42, -26);
    out.push(base({ id: `RCS-${road.id}`, type: 'road_sensor', location: { kind: 'road', id: road.id }, x: p.x, y: p.y }, s));
  }
  for (const id of ['A', 'E', 'F']) {
    const n = NODE_MAP[id];
    out.push(base({ id: `RF-${id}`, type: 'rfid_reader', location: { kind: 'junction', id }, x: n.x - 36, y: n.y + 36, gatewayId: n.gatewayId, lastValue: 'Idle — no tag in range' }, s));
  }
  for (const light of s.streetlights) {
    out.push(base({ id: `SLC-${light.id.slice(3)}`, type: 'streetlight_controller', location: { kind: 'road', id: light.roadId }, x: light.x, y: light.y, ref: light.id }, s));
  }
  for (const g of GATEWAYS) {
    out.push(base({ id: g.id, type: 'gateway', name: g.name, location: { kind: 'network', id: 'network' }, locationLabel: `${g.name} cabinet`, x: g.x, y: g.y }, s));
  }
  return out;
}

export function gatewayOnline(s: SimState, gatewayId: string | null): boolean {
  if (!gatewayId) return true;
  const gw = s.devices.find((d) => d.id === gatewayId);
  return !gw || gw.status === 'online';
}

/** A device is "reachable" when it is online and its gateway is online. */
export function deviceReachable(s: SimState, d: Device): boolean {
  return d.status === 'online' && gatewayOnline(s, d.gatewayId);
}

function fmt(n: number, digits = 0) {
  return n.toFixed(digits);
}

function reading(s: SimState, d: Device): { value: string; payload: Record<string, unknown> } {
  switch (d.type) {
    case 'vehicle_sensor': {
      const jid = d.location.kind === 'junction' ? d.location.id : null;
      if (jid) {
        const st = s.junctionStats[jid];
        return {
          value: `${st.vehicles} vehicles · ${st.density}% occupancy · queue N–S ${st.queue.NS} / E–W ${st.queue.EW}`,
          payload: { vehicles: st.vehicles, occupancy: st.density, queueNS: st.queue.NS, queueEW: st.queue.EW },
        };
      }
      const rs = s.roadStats[d.location.id];
      return { value: `${rs?.count ?? 0} vehicles · ${rs?.density ?? 0}% occupancy`, payload: { vehicles: rs?.count ?? 0, occupancy: rs?.density ?? 0 } };
    }
    case 'motion_sensor': {
      const crossing = CROSSINGS.find((c) => `MS-${c.id}` === d.id);
      const ped = crossing ? (s.pedestrians[crossing.id] ?? -1) > s.time : false;
      const rs = s.roadStats[d.location.id];
      const motion = ped || (rs?.count ?? 0) > 0;
      return { value: ped ? 'Motion: pedestrian at crossing' : motion ? 'Motion: vehicles passing' : 'No motion', payload: { motion, pedestrian: ped } };
    }
    case 'weather_sensor': {
      const w = s.weather;
      return {
        value: `${fmt(w.temperature, 1)} °C · ${fmt(w.rainfall, 1)} mm/h · visibility ${Math.round(w.visibility)} m · ${Math.round(w.ambientLux)} lx`,
        payload: { tempC: +fmt(w.temperature, 1), rainMmH: +fmt(w.rainfall, 1), visibilityM: Math.round(w.visibility), lux: Math.round(w.ambientLux), aqi: Math.round(w.aqi) },
      };
    }
    case 'road_sensor': {
      const rh = s.roadHealth[d.location.id];
      if (!rh) return { value: 'No road data', payload: {} };
      return {
        value: `Vibration ${fmt(rh.vibration, 1)} mm/s · surface ${Math.round(rh.surface)} · water risk ${Math.round(rh.waterRisk)} %`,
        payload: { vibration: +fmt(rh.vibration, 2), surface: Math.round(rh.surface), waterRisk: Math.round(rh.waterRisk) },
      };
    }
    case 'rfid_reader':
      return { value: d.lastValue.startsWith('Tag') ? d.lastValue : 'Idle — no tag in range', payload: { heartbeat: true } };
    case 'streetlight_controller': {
      const light = s.streetlights.find((l) => l.id === d.ref);
      if (!light) return { value: 'Controller idle (no luminaire linked)', payload: {} };
      return {
        value: `${Math.round(light.brightness)} % · ${fmt(light.powerW, 0)} W${light.motion ? ' · motion' : ''}`,
        payload: { brightness: Math.round(light.brightness), powerW: +fmt(light.powerW, 1), motion: light.motion },
      };
    }
    case 'gateway': {
      const attached = s.devices.filter((x) => x.gatewayId === d.id);
      const queued = s.messages.filter((m) => m.gatewayId === d.id && m.status === 'queued').length;
      return { value: `${attached.length} devices attached · ${queued} queued`, payload: { devices: attached.length, queued } };
    }
  }
}

function topicFor(d: Device) {
  const zone = (d.gatewayId ?? d.id).replace('GW-', '').toLowerCase();
  return `smartroads/${zone}/${d.type.replace('_', '-')}/${d.id.toLowerCase()}`;
}

/** Publishes one message from a device. Returns the message (or null if the device cannot transmit). */
export function publish(s: SimState, d: Device, cfg: Settings, opts: { test?: boolean; force?: boolean } = {}): IoTMessage | null {
  if (d.status !== 'online') return null;
  const r = reading(s, d);
  d.lastValue = opts.test ? 'Test message sent' : r.value;
  d.lastUpdate = s.time;
  if (d.battery !== null) {
    d.battery = Math.max(0, d.battery - 0.01);
    if (d.battery < 20 && !d.lowBatteryWarned) {
      d.lowBatteryWarned = true;
      addEvent(s, { category: 'device', severity: 'medium', location: d.locationLabel, message: `${d.id} battery low (${Math.round(d.battery)} %)`, status: 'Warning' });
    }
  }
  const tier: IoTMessage['tier'] = EDGE_TYPES.includes(d.type) ? 'edge' : 'cloud';
  const gwId = d.type === 'gateway' ? d.id : (d.gatewayId ?? 'GW-CENTRAL');
  const online = d.type === 'gateway' || gatewayOnline(s, d.gatewayId);
  const latency = tier === 'edge' ? range(s, 18, 60) : range(s, 120, 260);
  const msg: IoTMessage = {
    id: nextId(s, 'MSG', 5),
    deviceId: d.id,
    gatewayId: gwId,
    topic: topicFor(d),
    payload: JSON.stringify(opts.test ? { test: true, from: d.id, t: Math.round(s.time) } : { id: d.id, t: Math.round(s.time), ...r.payload }),
    createdAt: s.time,
    status: 'queued',
    tier,
    deliverAt: s.time + 0.4,
    processAt: s.time + 1.2,
    latencyMs: Math.round(latency),
    failReason: null,
    test: !!opts.test,
    buffered: false,
  };
  s.net.sent += 1;
  s.net.curSent += 1;
  if (!online) {
    if (cfg.bufferDuringOutage) {
      msg.buffered = true;
      msg.deliverAt = Infinity;
    } else {
      failMessage(s, msg, 'Gateway unreachable');
    }
  } else if (!opts.test && chance(s, 0.004)) {
    failMessage(s, msg, 'Packet lost (simulated radio interference)');
  }
  s.messages.unshift(msg);
  if (s.messages.length > MAX_MESSAGES) s.messages.length = MAX_MESSAGES;
  return msg;
}

function failMessage(s: SimState, msg: IoTMessage, reason: string) {
  msg.status = 'failed';
  msg.failReason = reason;
  s.net.failed += 1;
  s.net.curFailed += 1;
}

/** Called once per simulated second. */
export function updateDevices(s: SimState, cfg: Settings) {
  for (const d of s.devices) {
    if (s.time >= d.nextReport) {
      d.nextReport = s.time + d.interval * range(s, 0.9, 1.1);
      publish(s, d, cfg);
    }
  }
  for (const m of s.messages) {
    if (m.status === 'queued' && s.time >= m.deliverAt) {
      m.status = 'delivered';
      s.net.delivered += 1;
      s.net.curDelivered += 1;
      const lat = m.latencyMs + (m.buffered ? 0 : 0);
      s.net.avgLatencyMs = s.net.avgLatencyMs === 0 ? lat : s.net.avgLatencyMs * 0.95 + lat * 0.05;
      if (m.tier === 'edge') s.net.edgeLatencyMs = s.net.edgeLatencyMs === 0 ? lat : s.net.edgeLatencyMs * 0.93 + lat * 0.07;
      else s.net.cloudLatencyMs = s.net.cloudLatencyMs === 0 ? lat : s.net.cloudLatencyMs * 0.93 + lat * 0.07;
    } else if (m.status === 'delivered' && s.time >= m.processAt) {
      m.status = 'processed';
      s.net.processed += 1;
    }
  }
  const push = (arr: number[], v: number) => {
    arr.push(v);
    if (arr.length > 60) arr.shift();
  };
  push(s.net.windowSent, s.net.curSent);
  push(s.net.windowDelivered, s.net.curDelivered);
  push(s.net.windowFailed, s.net.curFailed);
  s.net.curSent = 0;
  s.net.curDelivered = 0;
  s.net.curFailed = 0;
}

export function networkSummary(s: SimState) {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const sent = sum(s.net.windowSent);
  const delivered = sum(s.net.windowDelivered);
  const failed = sum(s.net.windowFailed);
  const rate = delivered + failed > 0 ? (delivered / (delivered + failed)) * 100 : 100;
  const queued = s.messages.filter((m) => m.status === 'queued').length;
  return {
    throughput: s.net.windowSent.length ? sent / s.net.windowSent.length : 0,
    deliveryRate: rate,
    failedWindow: failed,
    queued,
    latency: s.net.avgLatencyMs,
  };
}

export function setDeviceStatus(s: SimState, id: string, status: DeviceStatus) {
  const d = s.devices.find((x) => x.id === id);
  if (!d || d.status === status) return;
  const prev = d.status;
  d.status = status;
  const label = d.type === 'gateway' ? d.name : `${d.id} (${DEVICE_TYPE_LABEL[d.type].toLowerCase()})`;
  if (d.type === 'gateway') {
    const attached = s.devices.filter((x) => x.gatewayId === d.id).length;
    if (status === 'online') {
      let flushed = 0;
      for (const m of s.messages) {
        if (m.gatewayId === d.id && m.status === 'queued' && m.buffered) {
          m.deliverAt = s.time + 0.4;
          m.processAt = s.time + 1.2;
          m.latencyMs += 400;
          flushed += 1;
        }
      }
      addEvent(s, {
        category: 'network',
        severity: 'low',
        location: d.locationLabel,
        message: `${d.name} reconnected — ${attached} devices back online${flushed ? `, ${flushed} buffered messages flushed` : ''}`,
        status: 'Recovered',
      });
    } else {
      addEvent(s, {
        category: 'network',
        severity: 'high',
        location: d.locationLabel,
        message: `${d.name} ${status === 'failed' ? 'failed' : 'disconnected'} (simulated network interruption) — ${attached} devices cannot reach the edge server`,
        status: 'Outage',
      });
    }
    return;
  }
  if (status === 'online') {
    d.nextReport = s.time + 0.5;
    addEvent(s, { category: 'device', severity: 'low', location: d.locationLabel, message: `${label} ${prev === 'failed' ? 'restored' : 'reconnected'}`, status: 'Online' });
  } else {
    const impact =
      d.type === 'vehicle_sensor' && d.location.kind === 'junction'
        ? ` — Junction ${d.location.id} switched to fixed-time fallback signals`
        : d.type === 'streetlight_controller'
          ? ' — luminaire running in fail-safe mode'
          : '';
    addEvent(s, {
      category: 'device',
      severity: status === 'failed' ? 'high' : 'medium',
      location: d.locationLabel,
      message: `${label} ${status === 'failed' ? 'failure simulated' : 'disconnected'}${impact}`,
      status: status === 'failed' ? 'Failed' : 'Offline',
    });
  }
}

export interface NewDeviceInput {
  type: DeviceType;
  location: LocationRef;
  name?: string;
}

export function addDevice(s: SimState, input: NewDeviceInput): { ok: true; id: string } | { ok: false; error: string } {
  if (input.type === 'gateway') return { ok: false, error: 'Gateways are fixed in this simulation.' };
  let x: number;
  let y: number;
  if (input.location.kind === 'junction') {
    const n = NODE_MAP[input.location.id];
    if (!n) return { ok: false, error: 'Choose a valid junction.' };
    x = n.x + range(s, -40, 40);
    y = n.y + range(s, -40, 40);
  } else if (input.location.kind === 'road') {
    const r = ROAD_MAP[input.location.id];
    if (!r) return { ok: false, error: 'Choose a valid road.' };
    const p = roadPoint(r, range(s, 0.25, 0.75), 30);
    x = p.x;
    y = p.y;
  } else return { ok: false, error: 'Choose a junction or road.' };
  const name = input.name?.trim().slice(0, 40);
  const id = nextId(s, 'DEV');
  const d = base({ id, type: input.type, location: input.location, x, y, custom: true, name: name || `Custom ${DEVICE_TYPE_LABEL[input.type].toLowerCase()}` }, s);
  d.nextReport = s.time + 0.5;
  s.devices.push(d);
  addEvent(s, { category: 'device', severity: 'low', location: d.locationLabel, message: `Virtual device ${id} (${DEVICE_TYPE_LABEL[input.type].toLowerCase()}) registered on ${d.gatewayId}`, status: 'Registered' });
  return { ok: true, id };
}

export function removeDevice(s: SimState, id: string) {
  const idx = s.devices.findIndex((d) => d.id === id && d.custom);
  if (idx < 0) return;
  const [d] = s.devices.splice(idx, 1);
  addEvent(s, { category: 'device', severity: 'info', location: d.locationLabel, message: `Virtual device ${id} removed from the registry`, status: 'Removed' });
}

export function triggerReading(s: SimState, id: string, cfg: Settings) {
  const d = s.devices.find((x) => x.id === id);
  if (!d) return null;
  return publish(s, d, cfg);
}

export function sendTestMessage(s: SimState, id: string, cfg: Settings) {
  const d = s.devices.find((x) => x.id === id);
  if (!d) return null;
  return publish(s, d, cfg, { test: true });
}

/** RFID reader at a junction identifies a tagged emergency vehicle. */
export function rfidRead(s: SimState, junctionId: string, vehicleId: string, cfg: Settings) {
  const reader = s.devices.find((d) => d.type === 'rfid_reader' && d.location.kind === 'junction' && d.location.id === junctionId && d.status === 'online');
  if (!reader) return;
  publish(s, reader, cfg);
  reader.lastValue = `Tag ${vehicleId} read — priority vehicle verified`;
  addEvent(s, { category: 'emergency', severity: 'info', location: nodeLabel(junctionId), message: `RFID reader ${reader.id} identified ${vehicleId}`, status: 'Verified' }, `rfid:${reader.id}:${vehicleId}`, 30);
}
