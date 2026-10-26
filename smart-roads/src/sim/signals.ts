// TrafficSignalController — a simplified, documented adaptive signal model.
//
// State machine (per junction, never two conflicting greens):
//   NS_GREEN → NS_YELLOW (3 s) → NS_ALLRED (1.5 s) → EW_GREEN → EW_YELLOW (3 s) → EW_ALLRED (1.5 s) → NS_GREEN …
//
// Green time when a green phase starts:
//   • Fixed mode:     green = fixedGreen
//   • Adaptive mode:  demand = queued vehicles + 0.5 × other approaching vehicles on that approach
//                     green  = clamp(minGreen + secondsPerVehicle × demand, minGreen, maxGreen)
//   • Gap-out:        in adaptive mode, a green may end early (after minGreen) if its approach is empty
//                     while the other approach has a queue.
//   • Fallback:       if the junction's vehicle sensor (or its gateway) is offline, the junction falls
//                     back to the fixed cycle because it has no live demand data.
//   • Priority:       a connected emergency vehicle's request extends its green, or ends the conflicting
//                     green (after a 2 s safety minimum) and runs yellow → all-red → requested green.
//   • Manual:         an operator can hold the current green and request a switch; yellow and all-red
//                     still run, so the state machine is always respected.

import { ALL_RED_TIME, PREEMPT_MIN_GREEN, YELLOW_TIME } from './defaults';
import { addEvent, nextId } from './events';
import { NODE_MAP, nodeLabel } from './network';
import { clamp } from './random';
import type { Axis, LightColor, Settings, SignalPhase, SignalState, SimState } from './types';

export const OTHER: Record<Axis, Axis> = { NS: 'EW', EW: 'NS' };
export const AXIS_LABEL: Record<Axis, string> = { NS: 'North–South', EW: 'East–West' };

const NEXT_PHASE: Record<SignalPhase, SignalPhase> = {
  NS_GREEN: 'NS_YELLOW',
  NS_YELLOW: 'NS_ALLRED',
  NS_ALLRED: 'EW_GREEN',
  EW_GREEN: 'EW_YELLOW',
  EW_YELLOW: 'EW_ALLRED',
  EW_ALLRED: 'NS_GREEN',
};

export function phaseAxis(phase: SignalPhase): Axis {
  return phase.startsWith('NS') ? 'NS' : 'EW';
}

export function greenAxis(phase: SignalPhase): Axis | null {
  if (phase === 'NS_GREEN') return 'NS';
  if (phase === 'EW_GREEN') return 'EW';
  return null;
}

/** The colour shown to traffic on one approach. Conflicting approaches can never both be non-red. */
export function lightFor(sig: SignalState, axis: Axis): LightColor {
  if (phaseAxis(sig.phase) !== axis) return 'red';
  if (sig.phase.endsWith('GREEN')) return 'green';
  if (sig.phase.endsWith('YELLOW')) return 'yellow';
  return 'red';
}

export function phaseLabel(phase: SignalPhase): string {
  const axis = phaseAxis(phase) === 'NS' ? 'N–S' : 'E–W';
  if (phase.endsWith('GREEN')) return `${axis} green`;
  if (phase.endsWith('YELLOW')) return `${axis} yellow`;
  return 'All red (clearance)';
}

export function createSignal(junctionId: string, index: number, cfg: Settings): SignalState {
  // Stagger junctions so they do not all change at once.
  const startNS = index % 2 === 0;
  const remaining = 4 + ((index * 7) % cfg.fixedGreen);
  return {
    junctionId,
    phase: startNS ? 'NS_GREEN' : 'EW_GREEN',
    remaining,
    phaseDuration: cfg.fixedGreen,
    elapsed: cfg.fixedGreen - remaining,
    plannedGreen: { NS: cfg.fixedGreen, EW: cfg.fixedGreen },
    mode: 'auto',
    switchRequested: false,
    priority: null,
    control: cfg.adaptive ? 'adaptive' : 'fixed',
    cycles: 0,
  };
}

function controlMode(s: SimState, sig: SignalState, cfg: Settings): SignalState['control'] {
  if (sig.priority) return 'priority';
  if (sig.mode === 'manual') return 'manual';
  if (!cfg.adaptive) return 'fixed';
  return s.junctionStats[sig.junctionId]?.sensorOnline ? 'adaptive' : 'fallback';
}

/** Computes (and records) the green time for an approach that is about to turn green. */
export function planGreen(s: SimState, sig: SignalState, axis: Axis, cfg: Settings): number {
  const st = s.junctionStats[sig.junctionId];
  const mode = controlMode(s, sig, cfg);
  let green = cfg.fixedGreen;
  if ((mode === 'adaptive' || mode === 'priority') && st?.sensorOnline && cfg.adaptive) {
    const queued = st.queue[axis];
    const moving = Math.max(0, st.approach[axis] - queued);
    const demand = queued + 0.5 * moving;
    green = clamp(Math.round(cfg.minGreen + cfg.secondsPerVehicle * demand), cfg.minGreen, cfg.maxGreen);
    const before = sig.plannedGreen[axis];
    if (Math.abs(green - before) >= 3) {
      const adj = {
        id: nextId(s, 'ADJ', 4),
        t: s.time,
        junctionId: sig.junctionId,
        axis,
        before,
        after: green,
        demand: Math.round(demand * 10) / 10,
        reason:
          green > before
            ? `${queued} vehicles queued on the ${AXIS_LABEL[axis]} approach`
            : `Demand on the ${AXIS_LABEL[axis]} approach dropped to ${Math.round(demand)}`,
      };
      s.adjustments.unshift(adj);
      if (s.adjustments.length > 80) s.adjustments.length = 80;
      addEvent(
        s,
        {
          category: 'signal',
          severity: 'info',
          location: nodeLabel(sig.junctionId),
          message: `Signal timing optimised: ${axis === 'NS' ? 'N–S' : 'E–W'} green ${before} s → ${green} s (${adj.reason.toLowerCase()})`,
          status: 'Applied',
        },
        `adj:${sig.junctionId}`,
        45,
      );
    }
  }
  sig.plannedGreen[axis] = green;
  return green;
}

function enter(s: SimState, sig: SignalState, phase: SignalPhase, cfg: Settings) {
  sig.phase = phase;
  sig.elapsed = 0;
  let duration: number;
  if (phase.endsWith('YELLOW')) duration = YELLOW_TIME;
  else if (phase.endsWith('ALLRED')) duration = ALL_RED_TIME;
  else {
    const axis = phaseAxis(phase);
    duration = planGreen(s, sig, axis, cfg);
    if (axis === 'NS') sig.cycles += 1;
  }
  sig.remaining = duration;
  sig.phaseDuration = duration;
}

export function advancePhase(s: SimState, sig: SignalState, cfg: Settings) {
  enter(s, sig, NEXT_PHASE[sig.phase], cfg);
}

export function updateSignals(s: SimState, dt: number, cfg: Settings) {
  for (const sig of Object.values(s.signals)) {
    if (!cfg.emergencyPriority && sig.priority) sig.priority = null;
    sig.control = controlMode(s, sig, cfg);
    sig.elapsed += dt;
    sig.remaining -= dt;
    const g = greenAxis(sig.phase);

    if (sig.priority) {
      const want = sig.priority.axis;
      if (g === want) {
        // Hold the requested green until the vehicle has passed.
        if (sig.remaining < 3) sig.remaining = 3;
        sig.phaseDuration = sig.elapsed + sig.remaining;
        continue;
      }
      if (g && sig.elapsed >= PREEMPT_MIN_GREEN) {
        advancePhase(s, sig, cfg); // conflicting green → yellow now
        continue;
      }
    } else if (g && sig.mode === 'manual') {
      if (sig.switchRequested) {
        sig.switchRequested = false;
        advancePhase(s, sig, cfg);
      } else {
        sig.remaining = Math.max(sig.remaining, 1);
        sig.phaseDuration = sig.elapsed + sig.remaining;
      }
      continue;
    } else if (g && sig.control === 'adaptive') {
      const st = s.junctionStats[sig.junctionId];
      const other = OTHER[g];
      if (st && sig.elapsed >= cfg.minGreen && st.queue[g] === 0 && st.approach[g] <= 1 && st.queue[other] >= 2) {
        addEvent(
          s,
          {
            category: 'signal',
            severity: 'info',
            location: nodeLabel(sig.junctionId),
            message: `Green ended early on the empty ${AXIS_LABEL[g]} approach — ${st.queue[other]} vehicles waiting ${AXIS_LABEL[other]}`,
            status: 'Applied',
          },
          `gap:${sig.junctionId}`,
          75,
        );
        advancePhase(s, sig, cfg);
        continue;
      }
    }

    if (sig.remaining <= 0) advancePhase(s, sig, cfg);
  }
}

/** Operator control: put a junction into manual demonstration mode, or back to automatic. */
export function setSignalMode(s: SimState, junctionId: string, mode: 'auto' | 'manual') {
  const sig = s.signals[junctionId];
  if (!sig || sig.mode === mode) return;
  sig.mode = mode;
  sig.switchRequested = false;
  if (mode === 'auto' && greenAxis(sig.phase)) {
    sig.remaining = Math.min(sig.remaining, 8);
  }
  addEvent(s, {
    category: 'signal',
    severity: 'low',
    location: nodeLabel(junctionId),
    message: mode === 'manual' ? 'Manual demonstration control enabled — current green is held' : 'Returned to automatic signal control',
    status: 'Operator',
  });
}

export function requestPhaseSwitch(s: SimState, junctionId: string) {
  const sig = s.signals[junctionId];
  if (!sig || sig.mode !== 'manual') return;
  if (greenAxis(sig.phase)) {
    sig.switchRequested = true;
    addEvent(s, {
      category: 'signal',
      severity: 'low',
      location: nodeLabel(junctionId),
      message: `Operator requested phase change at Junction ${NODE_MAP[junctionId].id} — running yellow and all-red clearance`,
      status: 'Operator',
    });
  }
}
