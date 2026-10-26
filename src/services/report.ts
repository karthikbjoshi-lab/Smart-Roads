// Builds a downloadable summary of the current simulation run (CSV or JSON).
import { JUNCTIONS, ROADS, ROAD_MAP, locationLabel } from '../sim/network';
import { lightingTotals } from '../sim/lighting';
import { averageHealth } from '../sim/roadHealth';
import { networkSummary } from '../sim/devices';
import { simClockAt } from '../sim/format';
import type { Settings, SimState } from '../sim/types';

export function buildSummary(s: SimState, cfg: Settings) {
  const lights = lightingTotals(s);
  const net = networkSummary(s);
  return {
    generatedAt: new Date().toISOString(),
    disclaimer: 'All values are produced by a software simulation with virtual IoT devices. They are not measurements of real roads or traffic.',
    run: {
      status: s.status,
      simulatedSeconds: Math.round(s.time),
      clockNow: simClockAt(s, s.time),
      weather: s.weather.condition,
    },
    settings: cfg,
    traffic: {
      vehiclesOnNetwork: s.vehicles.length,
      junctions: JUNCTIONS.map((j) => {
        const st = s.junctionStats[j.id];
        const sig = s.signals[j.id];
        return {
          id: j.id,
          name: j.name,
          density: st.density,
          avgWaitSeconds: st.avgWait,
          vehiclesPassed: st.passed,
          plannedGreenNS: sig.plannedGreen.NS,
          plannedGreenEW: sig.plannedGreen.EW,
          control: sig.control,
          sensorOnline: st.sensorOnline,
        };
      }),
      signalAdjustments: s.adjustments.length,
    },
    incidents: s.incidents.map((i) => ({
      id: i.id,
      type: i.type,
      severity: i.severity,
      status: i.status,
      location: locationLabel(i.location),
      raisedAt: simClockAt(s, i.createdAt),
      resolvedAt: i.resolvedAt !== null ? simClockAt(s, i.resolvedAt) : null,
      source: i.source,
    })),
    emergencies: s.emergencies.map((e) => ({
      id: e.vehicleId,
      kind: e.kind,
      route: e.routeNodes.join(' > '),
      status: e.status,
      journeySeconds: e.arrivedAt !== null ? Math.round(e.arrivedAt - e.spawnedAt) : null,
      waitingSeconds: Math.round(e.delay),
      priorityJunctions: e.priorityGranted,
    })),
    roadHealth: {
      average: Math.round(averageHealth(s) * 10) / 10,
      roads: ROADS.map((r) => {
        const h = s.roadHealth[r.id];
        return { id: r.id, name: r.name, health: Math.round(h.health), surface: Math.round(h.surface), vibration: +h.vibration.toFixed(2), potholeRisk: Math.round(h.potholeRisk), waterloggingRisk: Math.round(h.waterRisk), priority: h.priority };
      }),
      maintenanceTasks: s.maintenance.map((m) => ({ id: m.id, road: ROAD_MAP[m.roadId].name, issue: m.issue, risk: m.risk, status: m.status })),
    },
    streetlights: {
      total: lights.total,
      active: lights.active,
      estimatedEnergyWh: Math.round(lights.energy * 10) / 10,
      estimatedBaselineWh: Math.round(lights.baseline * 10) / 10,
      estimatedSavedWh: Math.round(lights.saved * 10) / 10,
    },
    communication: {
      messagesSent: s.net.sent,
      delivered: s.net.delivered,
      processed: s.net.processed,
      failed: s.net.failed,
      deliveryRateLast60s: Math.round(net.deliveryRate * 10) / 10,
      avgLatencyMs: Math.round(net.latency),
      devices: s.devices.length,
      devicesOnline: s.devices.filter((d) => d.status === 'online').length,
    },
  };
}

function csvCell(v: unknown) {
  const str = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function buildCsv(s: SimState, cfg: Settings) {
  const summary = buildSummary(s, cfg);
  const lines: string[] = [];
  lines.push('# Smart Roads simulation report — all values are simulated');
  lines.push(`# Generated,${csvCell(summary.generatedAt)}`);
  lines.push(`# Simulated seconds,${summary.run.simulatedSeconds}`);
  lines.push('');
  lines.push('Section,Time series (one row per 5 simulated seconds)');
  const head = ['sim_time_s', 'clock', 'vehicles', 'avg_density_pct', 'avg_wait_s', 'congested_road_pct', ...JUNCTIONS.map((j) => `density_${j.id}`), ...JUNCTIONS.map((j) => `wait_${j.id}`), 'avg_road_health', 'energy_wh_est', 'baseline_wh_est', 'devices_online', 'delivery_rate_pct', 'latency_ms', 'active_incidents'];
  lines.push(head.join(','));
  for (const h of s.history) {
    lines.push(
      [h.t, simClockAt(s, h.t), h.vehicles, h.avgDensity, h.avgWait, h.congestion, ...JUNCTIONS.map((j) => h.junctionDensity[j.id]), ...JUNCTIONS.map((j) => h.junctionWait[j.id]), h.avgHealth, h.energyWh, h.baselineWh, h.online, h.deliveryRate, h.latency, h.activeIncidents]
        .map(csvCell)
        .join(','),
    );
  }
  lines.push('');
  lines.push('Section,Incidents');
  lines.push('id,type,severity,status,location,raised_at,resolved_at,source');
  for (const i of summary.incidents) lines.push([i.id, i.type, i.severity, i.status, i.location, i.raisedAt, i.resolvedAt, i.source].map(csvCell).join(','));
  lines.push('');
  lines.push('Section,Road health');
  lines.push('id,name,health,surface,vibration_mm_s,pothole_risk_pct,waterlogging_risk_pct,priority');
  for (const r of summary.roadHealth.roads) lines.push([r.id, r.name, r.health, r.surface, r.vibration, r.potholeRisk, r.waterloggingRisk, r.priority].map(csvCell).join(','));
  lines.push('');
  lines.push('Section,Emergency runs');
  lines.push('id,kind,route,status,journey_s,waiting_s,priority_junctions');
  for (const e of summary.emergencies) lines.push([e.id, e.kind, e.route, e.status, e.journeySeconds, e.waitingSeconds, e.priorityJunctions.join(' ')].map(csvCell).join(','));
  return lines.join('\n');
}

type DownloadsApi = { save: (r: { filename: string; data: string | Blob }) => Promise<{ status: string }> };
type ClaudeGlobal = { use?: (name: string) => Promise<unknown> };

/** Offers a file to the viewer. Inside claude.ai the page asks the viewer to confirm the save. */
export async function download(filename: string, content: string, type: string): Promise<'saved' | 'declined' | 'unavailable'> {
  const claude = (window as unknown as { claude?: ClaudeGlobal }).claude;
  if (claude?.use) {
    const api = (await claude.use('downloads').catch(() => null)) as DownloadsApi | null;
    if (api) {
      try {
        await api.save({ filename, data: content });
        return 'saved';
      } catch (e) {
        const code = (e as { code?: string })?.code;
        return code === 'declined' || code === 'rate_limited' ? 'declined' : 'unavailable';
      }
    }
    return 'unavailable';
  }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}

export function reportFilename(ext: 'csv' | 'json') {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `smart-roads-report-${stamp}.${ext}`;
}
