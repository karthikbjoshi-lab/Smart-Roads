import { useMemo, useState } from 'react';
import { ChartColumn, Download, FileJson, Trash2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { useStore, useSim } from '../store/simStore';
import { JUNCTIONS, ROADS } from '../sim/network';
import { INCIDENT_LABEL } from '../sim/incidents';
import { fmtDuration } from '../sim/format';
import { buildCsv, buildSummary, download, reportFilename } from '../services/report';
import { Button, Card, CardHeader, ConfirmDialog, MiniStat, PageHeader, SimNote } from '../components/ui';
import { ChartFrame, ChartTooltip, JUNCTION_COLOR, JUNCTION_LEGEND, LegendRow, RangePicker, axisProps, gridProps, useClockFormatter, useHistory, type RangeKey } from '../components/charts';
import { ChartBlock } from './Overview';
import type { IncidentType, Severity } from '../sim/types';

const SEV_COLOR: Record<Severity, string> = { critical: '#8c1d18', high: '#d03b3b', medium: '#ec835a', low: '#fab219' };

export function Analytics() {
  const [range, setRange] = useState<RangeKey>('all');
  const [confirm, setConfirm] = useState(false);
  const data = useHistory(range);
  const fmt = useClockFormatter();
  const incidents = useSim((s) => s.incidents);
  const roadHealth = useSim((s) => s.roadHealth);
  const time = useSim((s) => Math.floor(s.time));
  const events = useSim((s) => s.events.length);
  const emergencies = useSim((s) => s.emergencies);
  const maintenance = useSim((s) => s.maintenance.length);
  const clearHistory = useStore((s) => s.clearHistory);
  const toast = useStore((s) => s.toast);

  const fromT = data.length ? data[0].t : 0;
  const inRange = useMemo(() => incidents.filter((i) => i.createdAt >= fromT - 1 || range === 'all'), [incidents, fromT, range]);
  const bySeverity = (['critical', 'high', 'medium', 'low'] as Severity[]).map((sev) => ({ name: sev[0].toUpperCase() + sev.slice(1), sev, count: inRange.filter((i) => i.severity === sev).length }));
  const byType = (Object.keys(INCIDENT_LABEL) as IncidentType[]).map((t) => ({ name: INCIDENT_LABEL[t], count: inRange.filter((i) => i.type === t).length }));
  const countsByJunction = JUNCTIONS.map((j) => ({
    id: j.id,
    name: `${j.id} · ${j.name}`,
    avg: data.length ? data.reduce((sum, h) => sum + (h.junctionCount[j.id] ?? 0), 0) / data.length : 0,
  }));
  const health = ROADS.map((r) => ({ id: r.id, name: r.name, health: Math.round(roadHealth[r.id].health) })).sort((a, b) => a.health - b.health);
  const densityData = useMemo(() => data.map((h) => ({ t: h.t, ...h.junctionDensity })), [data]);
  const empty = data.length < 2;

  const announce = (result: 'saved' | 'declined' | 'unavailable', what: string) => {
    if (result === 'saved') toast({ title: `${what} downloaded`, message: 'Time series, incidents, road health and emergency runs.', tone: 'success' });
    else if (result === 'declined') toast({ title: 'Download cancelled', tone: 'info' });
    else toast({ title: 'Downloads are not available here', message: 'Open the page in a browser tab on claude.ai to save the report.', tone: 'warning' });
  };
  const exportCsv = async () => {
    const { sim, settings } = useStore.getState();
    announce(await download(reportFilename('csv'), buildCsv(sim, settings), 'text/csv;charset=utf-8'), 'CSV report');
  };
  const exportJson = async () => {
    const { sim, settings } = useStore.getState();
    announce(await download(reportFilename('json'), JSON.stringify(buildSummary(sim, settings), null, 2), 'application/json'), 'JSON summary');
  };

  return (
    <>
      <PageHeader
        title="Analytics & Reports"
        description="Charts built from the simulation's history (one sample every 5 simulated seconds). Use the time filter to focus on recent activity, then download a report for your project documentation."
        icon={ChartColumn}
        actions={
          <>
            <RangePicker value={range} onChange={setRange} />
            <Button variant="primary" icon={Download} onClick={exportCsv}>
              Download report (CSV)
            </Button>
            <Button variant="secondary" icon={FileJson} onClick={exportJson}>
              JSON
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MiniStat label="Simulated time" value={fmtDuration(time)} />
        <MiniStat label="Samples in view" value={data.length} />
        <MiniStat label="Events logged" value={events} />
        <MiniStat label="Incidents in view" value={inRange.length} />
        <MiniStat label="Emergency runs" value={emergencies.length} hint={`${emergencies.filter((e) => e.status === 'arrived').length} arrived`} />
        <MiniStat label="Maintenance tasks" value={maintenance} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <ChartBlock title="Vehicle counts by intersection" unit="average vehicles nearby">
            <ChartFrame empty={empty}>
              <BarChart data={countsByJunction} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="id" {...axisProps} />
                <YAxis {...axisProps} width={44} />
                <RTooltip cursor={{ fill: 'var(--c-surface-2)' }} content={<ChartTooltip digits={1} unit=" vehicles" />} />
                <Bar dataKey="avg" name="Average vehicles" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {countsByJunction.map((b) => (
                    <Cell key={b.id} fill={JUNCTION_COLOR[b.id]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
          </ChartBlock>
        </Card>
        <Card className="p-5">
          <ChartBlock title="Traffic density history" unit="% occupancy per junction">
            <LegendRow className="mb-2" items={JUNCTION_LEGEND} />
            <ChartFrame empty={empty}>
              <LineChart data={densityData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" tickFormatter={fmt} {...axisProps} minTickGap={40} />
                <YAxis {...axisProps} width={44} domain={[0, 100]} />
                <RTooltip content={<ChartTooltip fmtLabel={fmt} unit=" %" />} />
                {JUNCTIONS.map((j) => (
                  <Line key={j.id} type="monotone" dataKey={j.id} name={`Junction ${j.id}`} stroke={JUNCTION_COLOR[j.id]} strokeWidth={2} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ChartFrame>
          </ChartBlock>
        </Card>
        <Card className="p-5">
          <ChartBlock title="Average waiting time" unit="seconds, network average">
            <ChartFrame empty={empty}>
              <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" tickFormatter={fmt} {...axisProps} minTickGap={40} />
                <YAxis {...axisProps} width={44} />
                <RTooltip content={<ChartTooltip fmtLabel={fmt} unit=" s" digits={1} />} />
                <Line type="monotone" dataKey="avgWait" name="Average wait" stroke="var(--s-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ChartFrame>
          </ChartBlock>
        </Card>
        <Card className="p-5">
          <ChartBlock title="Incident counts by severity" unit="incidents raised">
            <ChartFrame>
              <BarChart data={bySeverity} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} width={44} allowDecimals={false} />
                <RTooltip cursor={{ fill: 'var(--c-surface-2)' }} content={<ChartTooltip unit=" incidents" />} />
                <Bar dataKey="count" name="Incidents" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {bySeverity.map((b) => (
                    <Cell key={b.sev} fill={SEV_COLOR[b.sev]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
          </ChartBlock>
        </Card>
        <Card className="p-5">
          <ChartBlock title="Incident counts by category" unit="incidents raised">
            <ChartFrame height={260}>
              <BarChart data={byType} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" {...axisProps} allowDecimals={false} />
                <YAxis type="category" dataKey="name" {...axisProps} width={120} />
                <RTooltip cursor={{ fill: 'var(--c-surface-2)' }} content={<ChartTooltip unit=" incidents" />} />
                <Bar dataKey="count" name="Incidents" fill="var(--s-1)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </BarChart>
            </ChartFrame>
          </ChartBlock>
        </Card>
        <Card className="p-5">
          <ChartBlock title="Streetlight energy estimate" unit="Wh, cumulative (simulated)">
            <LegendRow className="mb-2" items={[{ label: 'Smart LED', color: 'var(--s-1)' }, { label: 'Conventional baseline', color: 'var(--chart-axis)', dashed: true }]} />
            <ChartFrame empty={empty}>
              <LineChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" tickFormatter={fmt} {...axisProps} minTickGap={40} />
                <YAxis {...axisProps} width={52} />
                <RTooltip content={<ChartTooltip fmtLabel={fmt} unit=" Wh" digits={1} />} />
                <Line type="monotone" dataKey="energyWh" name="Smart LED" stroke="var(--s-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="baselineWh" name="Baseline" stroke="var(--chart-axis)" strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ChartFrame>
          </ChartBlock>
        </Card>
        <Card className="p-5">
          <ChartBlock title="Road health scores (now)" unit="0–100, higher is better">
            <ChartFrame height={280}>
              <BarChart data={health} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="18%">
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" domain={[0, 100]} {...axisProps} />
                <YAxis type="category" dataKey="name" {...axisProps} width={120} />
                <RTooltip cursor={{ fill: 'var(--c-surface-2)' }} content={<ChartTooltip unit=" / 100" />} />
                <Bar dataKey="health" name="Health" fill="var(--s-3)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </BarChart>
            </ChartFrame>
          </ChartBlock>
        </Card>
        <Card className="p-5">
          <ChartBlock title="Device connectivity" unit="devices reachable">
            <ChartFrame empty={empty}>
              <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" tickFormatter={fmt} {...axisProps} minTickGap={40} />
                <YAxis {...axisProps} width={44} domain={[0, 'dataMax + 2']} allowDecimals={false} />
                <RTooltip content={<ChartTooltip fmtLabel={fmt} unit=" devices" />} />
                <Line type="stepAfter" dataKey="online" name="Online & reachable" stroke="var(--s-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="stepAfter" dataKey="total" name="Registered" stroke="var(--chart-axis)" strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ChartFrame>
            <LegendRow className="mt-2" items={[{ label: 'Online & reachable', color: 'var(--s-1)' }, { label: 'Registered', color: 'var(--chart-axis)', dashed: true }]} />
          </ChartBlock>
        </Card>
        <Card className="p-5">
          <ChartBlock title="Message delivery success" unit="% over the last 60 s (simulated)">
            <ChartFrame height={200} empty={empty}>
              <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" tickFormatter={fmt} {...axisProps} minTickGap={40} />
                <YAxis {...axisProps} width={44} domain={[(min: number) => Math.max(0, Math.floor(min - 5)), 100]} />
                <RTooltip content={<ChartTooltip fmtLabel={fmt} unit=" %" digits={1} />} />
                <Line type="monotone" dataKey="deliveryRate" name="Delivery rate" stroke="var(--s-3)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ChartFrame>
          </ChartBlock>
        </Card>
        <Card className="p-5">
          <ChartBlock title="Processing latency" unit="ms, simulated average">
            <ChartFrame height={200} empty={empty}>
              <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" tickFormatter={fmt} {...axisProps} minTickGap={40} />
                <YAxis {...axisProps} width={44} />
                <RTooltip content={<ChartTooltip fmtLabel={fmt} unit=" ms" />} />
                <Line type="monotone" dataKey="latency" name="Latency" stroke="var(--s-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ChartFrame>
          </ChartBlock>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Data retention" subtitle="History is kept in memory for this browser tab only" icon={Trash2} />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-5">
          <SimNote>Charts show an illustrative simulation — they make no claim about real reductions in congestion, accidents or energy use.</SimNote>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>
            Reset history
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm}
        title="Clear simulation history?"
        body="Charts, the event log, resolved incidents, completed maintenance tasks and finished emergency runs will be cleared. The live simulation keeps running."
        confirmLabel="Clear history"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          clearHistory();
          toast({ title: 'History cleared', tone: 'success' });
        }}
      />
    </>
  );
}
