// Reusable dashboard widgets: KPI card, event feed, network health, weather panel, IoT pipeline strip.
import { useMemo, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudRain,
  CloudSun,
  Droplets,
  Eye,
  Moon,
  Radio,
  Router,
  Sun,
  Thermometer,
  Wind,
  Zap,
  Minus,
  type LucideIcon,
} from 'lucide-react';
import { useStore, useSim } from '../store/simStore';
import { simClockAt } from '../sim/format';
import { WEATHER_ORDER, WEATHER_PRESETS, setWeather } from '../sim/weather';
import { networkSummary } from '../sim/devices';
import { Badge, Card, CardHeader, EmptyState, InfoTip, SeverityBadge, StatusDot, cx } from './ui';
import type { EventCategory, SimEvent, WeatherCondition } from '../sim/types';

// ---------- KPI ----------
export function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  description,
  status,
  delta,
  deltaGoodWhen = 'down',
  info,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  unit?: string;
  description: ReactNode;
  status: { tone: 'good' | 'warn' | 'bad' | 'neutral' | 'primary'; label: string };
  delta?: { value: number; unit: string; window: string } | null;
  deltaGoodWhen?: 'up' | 'down' | 'none';
  info?: string;
}) {
  const toneBg = { good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', neutral: 'bg-surface-2 text-ink-2', primary: 'bg-primary-soft text-primary-ink' }[status.tone];
  let deltaEl: ReactNode = null;
  if (delta) {
    const flat = Math.abs(delta.value) < 0.5;
    const up = delta.value > 0;
    const good = deltaGoodWhen === 'none' || flat ? null : deltaGoodWhen === 'up' ? up : !up;
    const DIcon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
    deltaEl = (
      <span className={cx('inline-flex items-center gap-0.5 text-xs font-medium tabular', good === null ? 'text-ink-3' : good ? 'text-good' : 'text-bad')}>
        <DIcon size={14} aria-hidden />
        {flat ? 'steady' : `${up ? '+' : '−'}${Math.abs(delta.value).toFixed(delta.unit === '%' || delta.unit === ' s' ? 0 : 0)}${delta.unit}`}
        <span className="font-normal text-ink-3">vs {delta.window}</span>
      </span>
    );
  }
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className={cx('grid size-9 place-items-center rounded-xl', toneBg)}>
          <Icon size={18} aria-hidden />
        </span>
        <Badge tone={status.tone === 'neutral' ? 'neutral' : status.tone}>{status.label}</Badge>
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[13px] font-medium text-ink-2">
          {label}
          {info && <InfoTip text={info} />}
        </p>
        <p className="mt-0.5 text-[28px] leading-9 font-semibold tracking-tight text-ink tabular">
          {value}
          {unit && <span className="ml-1 text-base font-medium text-ink-3">{unit}</span>}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-3">{description}</p>
      </div>
      <div className="min-h-4">{deltaEl}</div>
    </Card>
  );
}

// ---------- Events ----------
const CATEGORY_LABEL: Record<EventCategory, string> = {
  traffic: 'Traffic',
  signal: 'Signals',
  incident: 'Incident',
  emergency: 'Emergency',
  lighting: 'Lighting',
  maintenance: 'Maintenance',
  weather: 'Weather',
  device: 'Device',
  network: 'Network',
  system: 'System',
};
export const EVENT_CATEGORIES = Object.keys(CATEGORY_LABEL) as EventCategory[];
export { CATEGORY_LABEL };

export function EventRow({ e, startClock }: { e: SimEvent; startClock: number }) {
  return (
    <li className="flex gap-3 py-2.5">
      <span className="w-[58px] shrink-0 pt-0.5 text-xs font-medium text-ink-3 tabular">{simClockAt({ startClock }, e.t)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-5 text-ink">{e.message}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          <SeverityBadge severity={e.severity} />
          <Badge tone="neutral">{CATEGORY_LABEL[e.category]}</Badge>
          <span className="truncate">{e.location}</span>
          <span aria-hidden>·</span>
          <span>{e.status}</span>
        </div>
      </div>
    </li>
  );
}

export function EventFeed({ limit = 8, hideInfo = false }: { limit?: number; hideInfo?: boolean }) {
  const events = useSim((s) => s.events);
  const startClock = useSim((s) => s.startClock);
  const list = useMemo(() => (hideInfo ? events.filter((e) => e.severity !== 'info') : events).slice(0, limit), [events, limit, hideInfo]);
  if (!list.length) return <EmptyState title="No events yet" body="Start the simulation — sensor detections and system actions will appear here." />;
  return <ul className="divide-y divide-line">{list.map((e) => <EventRow key={e.id} e={e} startClock={startClock} />)}</ul>;
}

// ---------- Network health ----------
export function NetworkHealthCard() {
  const devices = useSim((s) => s.devices);
  const messages = useSim((s) => s.messages);
  const net = useSim((s) => s.net);
  const summary = useMemo(() => networkSummary({ net, messages } as Parameters<typeof networkSummary>[0]), [net, messages]);
  const gateways = devices.filter((d) => d.type === 'gateway');
  const gwOnline = Object.fromEntries(gateways.map((g) => [g.id, g.status === 'online']));
  const sensors = devices.filter((d) => d.type !== 'gateway');
  const connected = sensors.filter((d) => d.status === 'online' && (!d.gatewayId || gwOnline[d.gatewayId])).length;
  const disconnected = sensors.length - connected;
  const navigate = useStore((s) => s.navigate);
  return (
    <Card>
      <CardHeader title="Network health" subtitle="Simulated IoT connectivity" icon={Router} actions={<button className="text-[13px] font-medium text-primary hover:underline" onClick={() => navigate('devices')}>Devices</button>} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-4">
        <Metric label="Connected devices" value={connected} tone="good" />
        <Metric label="Disconnected" value={disconnected} tone={disconnected ? 'bad' : 'neutral'} />
        <Metric label="Delivery success" value={`${summary.deliveryRate.toFixed(1)} %`} tone={summary.deliveryRate < 95 ? 'bad' : 'good'} info="Messages delivered ÷ (delivered + failed) over the last 60 simulated seconds." />
        <Metric label="Avg. latency" value={`${Math.round(summary.latency)} ms`} info="Simulated time from a sensor publishing a message to the gateway delivering it (edge + cloud average)." />
      </div>
      <ul className="flex flex-col gap-1.5 border-t border-line px-5 py-3.5">
        {gateways.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="flex items-center gap-2 text-ink">
              <StatusDot tone={g.status === 'online' ? 'good' : 'bad'} />
              {g.name}
            </span>
            <span className={cx('text-xs font-medium', g.status === 'online' ? 'text-good' : 'text-bad')}>{g.status === 'online' ? 'Online' : 'Offline'}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Metric({ label, value, tone, info }: { label: string; value: ReactNode; tone?: 'good' | 'bad' | 'neutral'; info?: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-xs text-ink-3">
        {label}
        {info && <InfoTip text={info} />}
      </p>
      <p className={cx('text-lg font-semibold tabular', tone === 'bad' ? 'text-bad' : 'text-ink')}>{value}</p>
    </div>
  );
}

// ---------- Weather ----------
export const WEATHER_ICON: Record<WeatherCondition, LucideIcon> = { clear: CloudSun, rain: CloudDrizzle, heavy_rain: CloudRain, fog: CloudFog, low_light: Moon };

export function WeatherCard({ compact }: { compact?: boolean }) {
  const w = useSim((s) => s.weather);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const daylightLux = useStore((s) => s.settings.daylightLux);
  const Icon = WEATHER_ICON[w.condition];
  return (
    <Card>
      <CardHeader title="Weather & environment" subtitle="Virtual environmental sensors WS-01, WS-02" icon={Cloud} />
      <div className="px-5">
        <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
          <Icon size={30} className="shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{WEATHER_PRESETS[w.condition].label}</p>
            <p className="text-xs text-ink-3">
              {WEATHER_PRESETS[w.condition].description} · speed advisory {w.speedAdvisory} km/h
            </p>
          </div>
        </div>
        <div className={cx('mt-3 grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
          <Reading icon={Thermometer} label="Temperature" value={`${w.temperature.toFixed(1)} °C`} />
          <Reading icon={Droplets} label="Rainfall" value={`${w.rainfall.toFixed(1)} mm/h`} warn={w.rainfall >= 30} />
          <Reading icon={Sun} label="Ambient light" value={`${Math.round(w.ambientLux).toLocaleString()} lx`} hint={w.ambientLux < daylightLux ? 'dark' : 'daylight'} />
          <Reading icon={Eye} label="Visibility" value={w.visibility >= 1000 ? `${(w.visibility / 1000).toFixed(1)} km` : `${Math.round(w.visibility)} m`} warn={w.visibility < 200} />
          {!compact && <Reading icon={Wind} label="Air quality" value={`AQI ${Math.round(w.aqi)}`} />}
        </div>
      </div>
      <div className="px-5 pt-4 pb-5">
        <p className="mb-2 text-xs font-medium text-ink-3">Simulate conditions</p>
        <div className="flex flex-wrap gap-1.5">
          {WEATHER_ORDER.map((c) => {
            const CIcon = WEATHER_ICON[c];
            const active = w.condition === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  act((s) => setWeather(s, c));
                  if (!active) toast({ title: `${WEATHER_PRESETS[c].label} simulated`, message: WEATHER_PRESETS[c].description, tone: 'info' });
                }}
                className={cx('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium', active ? 'border-transparent bg-primary-soft text-primary-ink' : 'border-line-strong text-ink-2 hover:bg-surface-2')}
              >
                <CIcon size={14} aria-hidden /> {WEATHER_PRESETS[c].label}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function Reading({ icon: Icon, label, value, hint, warn }: { icon: LucideIcon; label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs text-ink-3">
        <Icon size={13} aria-hidden /> {label}
      </p>
      <p className={cx('text-sm font-semibold tabular', warn ? 'text-bad' : 'text-ink')}>
        {value} {hint && <span className="text-xs font-normal text-ink-3">· {hint}</span>}
      </p>
    </div>
  );
}

// ---------- Sense → Communicate → Process → Respond ----------
export function PipelineStrip() {
  const devices = useSim((s) => s.devices);
  const net = useSim((s) => s.net);
  const messages = useSim((s) => s.messages);
  const adjustments = useSim((s) => s.adjustments.length);
  const incidents = useSim((s) => s.incidents);
  const summary = useMemo(() => networkSummary({ net, messages } as Parameters<typeof networkSummary>[0]), [net, messages]);
  const online = devices.filter((d) => d.type !== 'gateway' && d.status === 'online').length;
  const open = incidents.filter((i) => i.status !== 'resolved').length;
  const steps: Array<{ icon: LucideIcon; title: string; body: string; stat: string }> = [
    { icon: Radio, title: 'Sense', body: 'Virtual traffic, weather, road and motion sensors collect readings.', stat: `${online} sensors reporting` },
    { icon: Router, title: 'Communicate', body: 'Readings travel as MQTT-style messages through roadside gateways.', stat: `${summary.throughput.toFixed(1)} msg/s · ${summary.deliveryRate.toFixed(0)} % delivered` },
    { icon: Brain, title: 'Process', body: 'Edge and cloud rules detect congestion, hazards and road damage.', stat: `${open} open incident${open === 1 ? '' : 's'}` },
    { icon: Zap, title: 'Respond', body: 'Signals adapt, emergency vehicles get priority, lights and crews respond.', stat: `${adjustments} signal adjustments` },
  ];
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map((st, i) => {
        const Icon = st.icon;
        return (
          <li key={st.title} className="relative flex gap-3 rounded-2xl border border-line bg-surface p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-ink">
              <Icon size={19} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-3">Step {i + 1}</p>
              <p className="text-sm font-semibold text-ink">{st.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-ink-2">{st.body}</p>
              <p className="mt-1.5 text-xs font-medium text-primary-ink tabular">{st.stat}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

