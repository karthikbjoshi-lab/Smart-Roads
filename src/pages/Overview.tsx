import { useMemo, useState } from 'react';
import { Ambulance, ArrowRight, Car, Construction, Gauge, Map as MapIcon, Play, Radio, Siren, X, Activity } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { useStore, useSim } from '../store/simStore';
import { JUNCTIONS } from '../sim/network';
import { averageHealth } from '../sim/roadHealth';
import { deviceReachable } from '../sim/devices';
import { Button, Card, CardHeader, PageHeader, SimNote } from '../components/ui';
import { EventFeed, KpiCard, NetworkHealthCard, PipelineStrip, WeatherCard } from '../components/widgets';
import { RoadMap, TrafficLegend } from '../components/map/RoadMap';
import { Inspector } from '../components/map/Inspector';
import { ChartFrame, ChartTooltip, JUNCTION_COLOR, RangePicker, axisProps, gridProps, useClockFormatter, useHistory, type RangeKey } from '../components/charts';
import { startDemo } from '../demo/GuidedDemo';

function useKpis() {
  const devices = useSim((s) => s.devices);
  const vehicles = useSim((s) => s.vehicles.length);
  const junctionStats = useSim((s) => s.junctionStats);
  const incidents = useSim((s) => s.incidents);
  const emergencies = useSim((s) => s.emergencies);
  const roadHealth = useSim((s) => s.roadHealth);
  const history = useSim((s) => s.history);
  const threshold = useStore((s) => s.settings.congestionThreshold);
  const sim = useStore.getState().sim;
  return useMemo(() => {
    const sensors = devices.filter((d) => d.type !== 'gateway');
    const online = sensors.filter((d) => deviceReachable(sim, d)).length;
    const js = Object.values(junctionStats);
    const density = js.reduce((a, b) => a + b.density, 0) / Math.max(1, js.length);
    const open = incidents.filter((i) => i.status !== 'resolved');
    const critical = open.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
    const enRoute = emergencies.filter((e) => e.status === 'en_route');
    const health = averageHealth({ roadHealth });
    const past = history.length > 12 ? history[history.length - 13] : null; // ≈ 60 s earlier
    return { sensors: sensors.length, online, vehicles, density, open: open.length, critical, enRoute, health, past, threshold };
  }, [devices, vehicles, junctionStats, incidents, emergencies, roadHealth, history, threshold, sim]);
}

export function Overview() {
  const k = useKpis();
  const status = useSim((s) => s.status);
  const navigate = useStore((s) => s.navigate);
  const select = useStore((s) => s.select);
  const selection = useStore((s) => s.selection);
  const [introHidden, setIntroHidden] = useState(() => {
    try {
      return window.localStorage.getItem('smart-roads:intro-hidden') === '1';
    } catch {
      return false;
    }
  });

  return (
    <>
      <PageHeader
        title="Overview"
        description="What is happening on the simulated roads right now, whether the system is healthy, where traffic is building up and what the system is doing in response."
        actions={
          <>
            {status !== 'running' && (
              <Button variant="primary" icon={Play} onClick={startDemo}>
                Start demo
              </Button>
            )}
            <Button variant="secondary" icon={MapIcon} onClick={() => navigate('network')}>
              Open live map
            </Button>
          </>
        }
      />

      {!introHidden && (
        <Card className="mb-6 p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">How this smart road system works</h2>
              <p className="text-[13px] text-ink-3">Every reading flows through four stages. The numbers below update live from the simulation.</p>
            </div>
            <button
              type="button"
              aria-label="Hide explanation"
              className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2"
              onClick={() => {
                setIntroHidden(true);
                try {
                  window.localStorage.setItem('smart-roads:intro-hidden', '1');
                } catch {
                  /* ignore */
                }
              }}
            >
              <X size={16} />
            </button>
          </div>
          <PipelineStrip />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          icon={Radio}
          label="Active IoT sensors"
          value={k.online}
          unit={`/ ${k.sensors}`}
          description="Online and reachable through a gateway"
          status={k.online === k.sensors ? { tone: 'good', label: 'All online' } : { tone: k.sensors - k.online > 4 ? 'bad' : 'warn', label: `${k.sensors - k.online} offline` }}
          delta={k.past ? { value: k.online - k.past.online, unit: '', window: '1 min ago' } : null}
          deltaGoodWhen="up"
          info="Virtual devices (vehicle, motion, weather, road, RFID and streetlight controllers) whose messages are currently reaching the edge server."
        />
        <KpiCard
          icon={Car}
          label="Vehicles detected"
          value={k.vehicles}
          description="On the network right now"
          status={k.vehicles > 60 ? { tone: 'warn', label: 'Busy' } : { tone: 'primary', label: 'Normal' }}
          delta={k.past ? { value: k.vehicles - k.past.vehicles, unit: '', window: '1 min ago' } : null}
          deltaGoodWhen="none"
        />
        <KpiCard
          icon={Gauge}
          label="Average traffic density"
          value={k.density.toFixed(0)}
          unit="%"
          description="Mean occupancy near the 6 junctions"
          status={k.density >= k.threshold ? { tone: 'bad', label: 'Heavy' } : k.density >= 40 ? { tone: 'warn', label: 'Moderate' } : { tone: 'good', label: 'Light' }}
          delta={k.past ? { value: k.density - k.past.avgDensity, unit: '%', window: '1 min ago' } : null}
          info="Share of the approach space within 150 m of each junction that is occupied by vehicles, averaged over all junctions."
        />
        <KpiCard
          icon={Siren}
          label="Active incidents"
          value={k.open}
          description={k.critical ? `${k.critical} high or critical` : 'Unresolved incidents'}
          status={k.critical ? { tone: 'bad', label: 'Needs attention' } : k.open ? { tone: 'warn', label: 'Monitoring' } : { tone: 'good', label: 'Clear' }}
          delta={k.past ? { value: k.open - k.past.activeIncidents, unit: '', window: '1 min ago' } : null}
        />
        <KpiCard
          icon={Ambulance}
          label="Emergency vehicles"
          value={k.enRoute.length}
          description={k.enRoute[0] ? `${k.enRoute[0].label} · ETA ${Math.round(k.enRoute[0].eta)} s` : 'None en route'}
          status={k.enRoute.length ? { tone: 'primary', label: 'Priority active' } : { tone: 'neutral', label: 'Standby' }}
        />
        <KpiCard
          icon={Construction}
          label="Road health"
          value={k.health.toFixed(0)}
          unit="/ 100"
          description="Average across 12 road segments"
          status={k.health >= 75 ? { tone: 'good', label: 'Good' } : k.health >= 60 ? { tone: 'warn', label: 'Fair' } : { tone: 'bad', label: 'Poor' }}
          delta={k.past ? { value: k.health - k.past.avgHealth, unit: '', window: '1 min ago' } : null}
          deltaGoodWhen="up"
          info="0–100, higher is better. Combines surface condition, pothole risk and waterlogging risk."
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Live road network"
            subtitle="Click a junction or road to inspect it"
            icon={MapIcon}
            actions={
              <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => navigate('network')}>
                Full map
              </Button>
            }
          />
          <div className="px-3 pb-3">
            <RoadMap height="clamp(280px, 42vw, 470px)" showZoom={false} layers={{ lights: true }} />
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-3">
              <TrafficLegend />
              <SimNote>Simulated data</SimNote>
            </div>
          </div>
        </Card>
        <Card className="flex flex-col">
          <CardHeader title={selection ? 'Selected location' : 'Inspector'} icon={Activity} />
          <div className="px-5 pb-5">
            {selection ? (
              <Inspector onClose={() => select(null)} compact />
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-ink-3">Pick a junction to inspect its sensors and signal phase:</p>
                <div className="grid grid-cols-2 gap-2">
                  {JUNCTIONS.map((j) => (
                    <button key={j.id} type="button" onClick={() => select({ kind: 'junction', id: j.id })} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-left text-[13px] hover:bg-surface-2">
                      <span className="grid size-6 place-items-center rounded-full bg-surface-2 text-xs font-bold text-ink">{j.id}</span>
                      <span className="truncate text-ink">{j.name}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 border-t border-line pt-3">
                  <p className="mb-1 text-sm font-medium text-ink">Latest alerts</p>
                  <EventFeed limit={3} hideInfo />
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <TrafficAnalytics />

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent events"
            subtitle="Detections and automatic actions, newest first"
            icon={Activity}
            actions={
              <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => navigate('incidents')}>
                Event log
              </Button>
            }
          />
          <div className="max-h-[440px] overflow-y-auto px-5 pb-3 scroll-thin">
            <EventFeed limit={14} />
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          <NetworkHealthCard />
          <WeatherCard compact />
        </div>
      </div>
    </>
  );
}

function TrafficAnalytics() {
  const [range, setRange] = useState<RangeKey>('15');
  const data = useHistory(range);
  const fmt = useClockFormatter();
  const junctionStats = useSim((s) => s.junctionStats);
  const threshold = useStore((s) => s.settings.congestionThreshold);
  const bars = JUNCTIONS.map((j) => ({ id: j.id, name: `${j.id} · ${j.name}`, density: junctionStats[j.id].density }));
  const empty = data.length < 2;
  return (
    <Card className="mt-6">
      <CardHeader title="Traffic analytics" subtitle="Simulated sensor data · updates every 5 simulated seconds" icon={Gauge} actions={<RangePicker value={range} onChange={setRange} />} />
      <div className="grid grid-cols-1 gap-x-6 gap-y-6 px-5 pb-5 lg:grid-cols-2">
        <ChartBlock title="Vehicles on the network" unit="vehicles">
          <ChartFrame empty={empty}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" tickFormatter={fmt} {...axisProps} minTickGap={40} />
              <YAxis {...axisProps} allowDecimals={false} width={44} />
              <RTooltip content={<ChartTooltip fmtLabel={fmt} unit=" vehicles" />} />
              <Line type="monotone" dataKey="vehicles" name="Vehicles" stroke="var(--s-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ChartFrame>
        </ChartBlock>
        <ChartBlock title="Traffic density by intersection (now)" unit="% occupancy">
          <ChartFrame>
            <BarChart data={bars} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="id" {...axisProps} />
              <YAxis {...axisProps} domain={[0, 100]} width={44} />
              <RTooltip cursor={{ fill: 'var(--c-surface-2)' }} content={<ChartTooltip unit=" %" />} />
              <Bar dataKey="density" name="Density" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {bars.map((b) => (
                  <Cell key={b.id} fill={JUNCTION_COLOR[b.id]} />
                ))}
              </Bar>
            </BarChart>
          </ChartFrame>
          <p className="mt-1 text-xs text-ink-3">Congestion threshold: {threshold} %. Junctions A–F keep the same colour in every chart.</p>
        </ChartBlock>
        <ChartBlock title="Average waiting time" unit="seconds">
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
        <ChartBlock title="Congestion level over time" unit="% of road length congested">
          <ChartFrame empty={empty}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" tickFormatter={fmt} {...axisProps} minTickGap={40} />
              <YAxis {...axisProps} width={44} domain={[0, 'auto']} />
              <RTooltip content={<ChartTooltip fmtLabel={fmt} unit=" %" digits={1} />} />
              <Line type="monotone" dataKey="congestion" name="Congested road length" stroke="var(--s-7, #6250d6)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ChartFrame>
        </ChartBlock>
      </div>
    </Card>
  );
}

export function ChartBlock({ title, unit, children }: { title: string; unit: string; children: React.ReactNode }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="ml-2 text-xs text-ink-3">{unit}</span>
      </figcaption>
      {children}
    </figure>
  );
}
