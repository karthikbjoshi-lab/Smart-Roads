import { clockSeconds } from './weather';
import type { SimState } from './types';

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');

/** "18:02:15" for a seconds-of-day value. */
export function fmtClock(secOfDay: number, withSeconds = true) {
  const v = ((secOfDay % 86400) + 86400) % 86400;
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = Math.floor(v % 60);
  return withSeconds ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`;
}

/** Wall-clock time (simulated) at a given simulation time. */
export function simClockAt(s: Pick<SimState, 'startClock'>, t: number, withSeconds = true) {
  return fmtClock(s.startClock + t, withSeconds);
}

export function nowClock(s: Pick<SimState, 'startClock' | 'time'>, withSeconds = true) {
  return fmtClock(clockSeconds(s), withSeconds);
}

/** "2 min 05 s", "45 s" */
export function fmtDuration(seconds: number) {
  const v = Math.max(0, Math.round(seconds));
  if (v < 60) return `${v} s`;
  const m = Math.floor(v / 60);
  const s = v % 60;
  if (m < 60) return `${m} min ${pad(s)} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${pad(m % 60)} min`;
}

/** Relative age of a simulated timestamp. */
export function fmtAgo(now: number, t: number) {
  const d = Math.max(0, now - t);
  if (d < 5) return 'just now';
  if (d < 60) return `${Math.round(d)} s ago`;
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  const days = Math.round(d / 86400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function fmtPct(v: number, digits = 0) {
  return `${v.toFixed(digits)} %`;
}

export function fmtEnergy(wh: number) {
  if (Math.abs(wh) >= 1000) return `${(wh / 1000).toFixed(2)} kWh`;
  return `${wh.toFixed(wh < 10 ? 1 : 0)} Wh`;
}

export function fmtNum(v: number, digits = 0) {
  return v.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
