import { useMemo, useState } from 'react';
import { Check, CheckCheck, Construction, Hammer, ScanSearch, Wrench, Activity } from 'lucide-react';
import { CartesianGrid, Line, LineChart, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { useStore, useSim } from '../store/simStore';
import { ROADS, ROAD_MAP, roadLabel } from '../sim/network';
import { acknowledgeTask, averageHealth, completeTask, inspectRoad, simulateDamage } from '../sim/roadHealth';
import { fmtAgo, simClockAt } from '../sim/format';
import { Badge, Button, Card, CardHeader, Chip, EmptyState, InfoTip, Meter, MiniStat, PageHeader, SeverityBadge, SimNote, healthTone, cx } from '../components/ui';
import { WeatherCard } from '../components/widgets';
import { ChartFrame, ChartTooltip, LegendRow, RangePicker, axisProps, gridProps, useClockFormatter, useHistory, type RangeKey } from '../components/charts';

const SERIES = ['var(--s-1)', 'var(--s-2)', 'var(--s-3)'];

export function RoadHealth() {
  const roadHealth = useSim((s) => s.roadHealth);
  const maintenance = useSim((s) => s.maintenance);
  const now = useSim((s) => s.time);
  const startClock = useSim((s) => s.startClock);
  const rainfall = useSim((s) => s.weather.rainfall);
  const cfg = useStore((s) => s.settings);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const navigate = useStore((s) => s.navigate);
  const [taskFilter, setTaskFilter] = useState<'open' | 'all'>('open');
  const [range, setRange] = useState<RangeKey>('all');
  const history = useHistory(range);
  const fmt = useClockFormatter();

  const rows = useMemo(() => ROADS.map((r) => roadHealth[r.id]).sort((a, b) => a.health - b.health), [roadHealth]);
  const avg = averageHealth({ roadHealth });
  const attention = rows.filter((r) => r.priority === 'high' || r.priority === 'critical').length;
  const openTasks = maintenance.filter((m) => m.status !== 'completed');
  const tasks = taskFilter === 'open' ? openTasks : maintenance;

  // Three fixed colour slots: a road keeps its colour while it stays selected.
  const [slots, setSlots] = useState<Array<string | null>>(() => rows.slice(0, 3).map((r) => r.roadId));
  const chartRoads = slots.filter((x): x is string => !!x);
  const toggleRoad = (id: string) =>
    setSlots((cur) => {
      if (cur.includes(id)) return cur.map((x) => (x === id ? null : x));
      const free = cur.indexOf(null);
      const next = [...cur];
      next[free >= 0 ? free : 0] = id;
      return next;
    });
  const chartData = useMemo(() => history.map((h) => ({ t: h.t, avg: h.avgHealth, ...Object.fromEntries(chartRoads.map((id) => [id, h.roadHealth[id]])) })), [history, slots]);

  return (
    <>
      <PageHeader
        title="Road Health"
        description="Predictive maintenance simulation. Virtual road-condition sensors report vibration and surface condition; a transparent rule-based model (not a trained ML model) turns them into risk scores and maintenance recommendations."
        icon={Construction}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Average road health" value={`${avg.toFixed(0)} / 100`} tone={healthTone(avg)} hint="Higher is better" />
        <MiniStat label="Segments needing attention" value={attention} tone={attention ? 'bad' : 'good'} hint={`of ${rows.length} monitored`} />
        <MiniStat label="Open maintenance tasks" value={openTasks.length} tone={openTasks.length ? 'warn' : 'good'} hint={`${maintenance.filter((m) => m.status === 'completed').length} completed`} />
        <MiniStat label="Rainfall" value={`${rainfall.toFixed(1)} mm/h`} tone={rainfall >= 30 ? 'bad' : rainfall > 2 ? 'warn' : undefined} hint="drives waterlogging risk" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0">
          <CardHeader title="Monitored road segments" subtitle="Sorted by health, worst first" icon={Activity} />
          <div className="overflow-x-auto px-2 pb-3">
            <table className="w-full min-w-[880px] text-left text-[13px]">
              <thead>
                <tr className="text-xs text-ink-3">
                  <th className="px-3 py-2 font-medium">Road</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="inline-flex items-center gap-1">Health <InfoTip text="0.6 × surface + 0.25 × (100 − pothole risk) + 0.15 × (100 − waterlogging risk)" /></span>
                  </th>
                  <th className="px-3 py-2 font-medium">Surface</th>
                  <th className="px-3 py-2 font-medium">Vibration</th>
                  <th className="px-3 py-2 font-medium">Pothole risk</th>
                  <th className="px-3 py-2 font-medium">Waterlogging</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Last inspection</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.roadId} className="border-t border-line">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ink">{ROAD_MAP[r.roadId].name}</p>
                      <p className="text-xs text-ink-3">
                        {r.roadId} · drainage {Math.round(ROAD_MAP[r.roadId].drainage * 100)} %{!r.sensorOnline && <span className="text-bad"> · sensor offline</span>}
                      </p>
                    </td>
                    <td className="w-36 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Meter value={r.health} tone={healthTone(r.health)} className="w-16" label={`Health of ${ROAD_MAP[r.roadId].name}`} />
                        <span className="font-semibold text-ink tabular">{Math.round(r.health)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular">{Math.round(r.surface)}</td>
                    <td className={cx('px-3 py-2.5 tabular', r.vibration >= 4.5 && 'font-semibold text-bad')}>{r.vibration.toFixed(1)} mm/s</td>
                    <td className={cx('px-3 py-2.5 tabular', r.potholeRisk >= cfg.potholeThreshold && 'font-semibold text-bad')}>{Math.round(r.potholeRisk)} %</td>
                    <td className={cx('px-3 py-2.5 tabular', r.waterRisk >= cfg.waterloggingThreshold && 'font-semibold text-bad')}>{Math.round(r.waterRisk)} %</td>
                    <td className="px-3 py-2.5">
                      <SeverityBadge severity={r.priority} />
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{fmtAgo(now, r.lastInspection)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={ScanSearch}
                          onClick={() => {
                            act((s) => inspectRoad(s, r.roadId));
                            toast({ title: `Inspected ${ROAD_MAP[r.roadId].name}`, message: `Health ${Math.round(r.health)}, vibration ${r.vibration.toFixed(1)} mm/s, pothole risk ${Math.round(r.potholeRisk)} %.`, tone: 'info' });
                          }}
                        >
                          Inspect
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Hammer}
                          onClick={() => {
                            act((s, c) => simulateDamage(s, r.roadId, c));
                            toast({ title: 'Damage event simulated', message: `Vibration spike on ${ROAD_MAP[r.roadId].name}.`, tone: 'warning' });
                          }}
                        >
                          Damage
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <p className="mb-2 text-sm font-semibold text-ink">Rule-based risk model</p>
            <ul className="space-y-1.5 text-[13px] leading-5 text-ink-2">
              <li>
                Pothole risk ≥ <b>{cfg.potholeThreshold} %</b> → schedule patching
              </li>
              <li>
                Health &lt; <b>{cfg.healthThreshold}</b> → inspection and resurfacing
              </li>
              <li>
                Waterlogging risk ≥ <b>{cfg.waterloggingThreshold} %</b> → hazard alert + drain clearing
              </li>
              <li>
                Vibration ≥ <b>4.5 mm/s</b> → send an inspection crew
              </li>
            </ul>
            <p className="mt-3 text-xs leading-5 text-ink-3">More traffic, heavy vehicles and rain wear the surface slowly; rain plus poor drainage raises waterlogging risk.</p>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => navigate('settings')}>
              Adjust thresholds
            </Button>
          </Card>
          <WeatherCard compact />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Maintenance queue"
          subtitle="Recommendations generated by the rules above"
          icon={Wrench}
          actions={
            <div className="flex gap-2">
              <Chip active={taskFilter === 'open'} onClick={() => setTaskFilter('open')} count={openTasks.length}>
                Open
              </Chip>
              <Chip active={taskFilter === 'all'} onClick={() => setTaskFilter('all')} count={maintenance.length}>
                All
              </Chip>
            </div>
          }
        />
        {tasks.length === 0 ? (
          <EmptyState title="No maintenance needed right now" body="Simulate heavy rain or a damage event to see the predictive rules create tasks." action={<Button variant="tonal" icon={Hammer} onClick={() => { act((s, c) => simulateDamage(s, 'E-F', c)); }}>Simulate damage on River Road</Button>} />
        ) : (
          <div className="overflow-x-auto px-2 pb-3">
            <table className="w-full min-w-[920px] text-left text-[13px]">
              <thead>
                <tr className="text-xs text-ink-3">
                  <th className="px-3 py-2 font-medium">Task</th>
                  <th className="px-3 py-2 font-medium">Affected road</th>
                  <th className="px-3 py-2 font-medium">Detected issue</th>
                  <th className="px-3 py-2 font-medium">Risk</th>
                  <th className="px-3 py-2 font-medium">Recommended action</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.slice(0, 40).map((m) => (
                  <tr key={m.id} className={cx('border-t border-line', m.status === 'completed' && 'opacity-60')}>
                    <td className="px-3 py-2.5 text-ink-3 tabular">
                      {m.id}
                      <span className="block text-xs">{simClockAt({ startClock }, m.createdAt, false)}</span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-ink">{roadLabel(m.roadId)}</td>
                    <td className="px-3 py-2.5 text-ink-2">
                      {m.issue}
                      <span className="block text-xs text-ink-3">{m.reading}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <SeverityBadge severity={m.risk} />
                    </td>
                    <td className="max-w-64 px-3 py-2.5 text-ink-2">{m.action}</td>
                    <td className="px-3 py-2.5 capitalize text-ink">{m.priority}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={m.status === 'open' ? 'warn' : m.status === 'acknowledged' ? 'primary' : 'good'}>{m.status[0].toUpperCase() + m.status.slice(1)}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        {m.status === 'open' && (
                          <Button size="sm" variant="secondary" icon={Check} onClick={() => act((s) => acknowledgeTask(s, m.id))}>
                            Acknowledge
                          </Button>
                        )}
                        {m.status !== 'completed' && (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={CheckCheck}
                            onClick={() => {
                              act((s, c) => completeTask(s, m.id, c));
                              toast({ title: `${m.id} completed`, message: `${ROAD_MAP[m.roadId].name} has been repaired (simulated).`, tone: 'success' });
                            }}
                          >
                            Complete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Road health over time" subtitle="Pick up to three roads to compare with the network average" icon={Activity} actions={<RangePicker value={range} onChange={setRange} />} />
        <div className="px-5 pb-5">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ROADS.map((r) => (
              <Chip key={r.id} active={chartRoads.includes(r.id)} onClick={() => toggleRoad(r.id)}>
                {r.name}
              </Chip>
            ))}
          </div>
          <LegendRow className="mb-2" items={[...slots.flatMap((id, i) => (id ? [{ label: ROAD_MAP[id].name, color: SERIES[i] }] : [])), { label: 'Network average', color: 'var(--chart-axis)', dashed: true }]} />
          <ChartFrame height={260} empty={chartData.length < 2}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" tickFormatter={fmt} {...axisProps} minTickGap={40} />
              <YAxis {...axisProps} width={44} domain={[0, 100]} />
              <RTooltip content={<ChartTooltip fmtLabel={fmt} digits={1} />} />
              {slots.map((id, i) =>
                id ? <Line key={id} type="monotone" dataKey={id} name={ROAD_MAP[id].name} stroke={SERIES[i]} strokeWidth={2} dot={false} isAnimationActive={false} /> : null,
              )}
              <Line type="monotone" dataKey="avg" name="Network average" stroke="var(--chart-axis)" strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ChartFrame>
          <div className="mt-3">
            <SimNote>Predictive maintenance simulation — scores come from documented rules, not a trained model.</SimNote>
          </div>
        </div>
      </Card>
    </>
  );
}
