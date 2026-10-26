import type { EventCategory, EventSeverity, SimState } from './types';

const MAX_EVENTS = 400;

/** Stable, readable identifiers such as INC-004 or MSG-0192. */
export function nextId(s: SimState, prefix: string, pad = 3): string {
  const n = (s.counters[prefix] ?? 0) + 1;
  s.counters[prefix] = n;
  return `${prefix}-${String(n).padStart(pad, '0')}`;
}

/** Returns true (and arms the cooldown) if `key` is not currently cooling down. */
export function takeCooldown(s: SimState, key: string, seconds: number): boolean {
  const until = s.cooldowns[key];
  if (until !== undefined && s.time < until) return false;
  s.cooldowns[key] = s.time + seconds;
  return true;
}

export interface EventInput {
  category: EventCategory;
  severity: EventSeverity;
  location: string;
  message: string;
  status?: string;
}

/**
 * Adds an entry to the event log (newest first).
 * Pass `dedupeKey` + `dedupeSeconds` to suppress repeats of the same event (debouncing).
 */
export function addEvent(s: SimState, e: EventInput, dedupeKey?: string, dedupeSeconds = 30): boolean {
  if (dedupeKey && !takeCooldown(s, `evt:${dedupeKey}`, dedupeSeconds)) return false;
  const seq = (s.counters.__seq ?? 0) + 1;
  s.counters.__seq = seq;
  s.events.unshift({
    id: `EVT-${String(seq).padStart(5, '0')}`,
    seq,
    t: s.time,
    category: e.category,
    severity: e.severity,
    location: e.location,
    message: e.message,
    status: e.status ?? 'Logged',
    read: e.severity === 'info' || e.severity === 'low',
  });
  if (s.events.length > MAX_EVENTS) s.events.length = MAX_EVENTS;
  return true;
}
