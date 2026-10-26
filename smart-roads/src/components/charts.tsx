// Shared chart pieces (Recharts). One y-axis per chart, thin 2px lines, recessive grid,
// a legend whenever there are 2+ series, and a hover tooltip on every chart.
import { useMemo, type ReactNode } from 'react';
import { ResponsiveContainer, type TooltipContentProps } from 'recharts';
import { useSim } from '../store/simStore';
import { simClockAt } from '../sim/format';
import { JUNCTIONS } from '../sim/network';
import type { HistorySample } from '../sim/types';
import { Segmented, cx } from './ui';

export type RangeKey = '5' | '15' | '30' | 'all';
export const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: '5', label: '5 min' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: 'all', label: 'All' },
];

export function RangePicker({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return <Segmented label="Time range" size="sm" value={value} onChange={onChange} options={RANGE_OPTIONS} />;
}

/** Series colours: one fixed slot per junction (colour follows the entity, never its rank). */
export const JUNCTION_COLOR: Record<string, string> = Object.fromEntries(JUNCTIONS.map((j, i) => [j.id, `var(--s-${i + 1})`]));

export function useHistory(range: RangeKey): HistorySample[] {
  const history = useSim((s) => s.history);
  return useMemo(() => {
    if (range === 'all' || !history.length) return history;
    const last = history[history.length - 1].t;
    const from = last - Number(range) * 60;
    return history.filter((h) => h.t >= from);
  }, [history, range]);
}

export function useClockFormatter() {
  const startClock = useSim((s) => s.startClock);
  return useMemo(() => (t: number) => simClockAt({ startClock }, t, false), [startClock]);
}

export const axisProps = {
  stroke: 'var(--chart-axis)',
  tick: { fill: 'var(--chart-axis)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--c-line)' },
} as const;

export const gridProps = { stroke: 'var(--chart-grid)', strokeDasharray: '0', vertical: false } as const;

export function ChartFrame({ height = 240, children, empty }: { height?: number; children: ReactNode; empty?: boolean }) {
  if (empty)
    return (
      <div className="grid place-items-center rounded-xl bg-surface-2 text-[13px] text-ink-3" style={{ height }}>
        Start the simulation to collect data for this chart.
      </div>
    );
  return (
    <div style={{ height }} className="w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

/** Tooltip in the app's own style. `format` renders each value with its unit. */
export function ChartTooltip({ active, payload, label, fmtLabel, unit = '', digits = 0 }: Partial<TooltipContentProps<number, string>> & { fmtLabel?: (l: number) => string; unit?: string; digits?: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium text-ink">{fmtLabel && typeof label === 'number' ? fmtLabel(label) : String(label ?? '')}</p>
      <ul className="flex flex-col gap-0.5">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className="h-2 w-2.5 rounded-sm" style={{ background: (p.color as string) ?? (p.stroke as string) }} aria-hidden />
              {p.name}
            </span>
            <span className="font-medium text-ink tabular">
              {typeof p.value === 'number' ? p.value.toFixed(digits) : String(p.value)}
              {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LegendRow({ items, className }: { items: Array<{ label: string; color: string; dashed?: boolean }>; className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2', className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <svg width={16} height={6} aria-hidden>
            <line x1={1} y1={3} x2={15} y2={3} stroke={i.color} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={i.dashed ? '3 3' : undefined} />
          </svg>
          {i.label}
        </span>
      ))}
    </div>
  );
}

export const JUNCTION_LEGEND = JUNCTIONS.map((j) => ({ label: `${j.id} · ${j.name}`, color: JUNCTION_COLOR[j.id] }));
