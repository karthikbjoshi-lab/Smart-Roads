import { useMemo, useState } from 'react';
import { Ban, CarFront, Check, CheckCheck, ChevronDown, Construction, CloudFog, CloudRain, Gauge, ListChecks, MapPin, Siren, TriangleAlert, Waves, type LucideIcon } from 'lucide-react';
import { useStore, useSim } from '../store/simStore';
import { quick } from '../store/quickActions';
import { ROADS } from '../sim/network';
import { acknowledgeIncident, incidentWhere, resolveIncident } from '../sim/incidents';
import { fmtAgo, simClockAt } from '../sim/format';
import { EVENT_SEVERITY_RANK } from '../sim/defaults';
import { Badge, Button, Card, CardHeader, Chip, EmptyState, Field, PageHeader, SearchInput, Select, SeverityBadge, SimNote, cx } from '../components/ui';
import { CATEGORY_LABEL, EVENT_CATEGORIES, EventRow } from '../components/widgets';
import type { Incident, IncidentType, Severity } from '../sim/types';

const ICON: Record<IncidentType, LucideIcon> = {
  collision: CarFront,
  blockage: Construction,
  congestion: Gauge,
  waterlogging: Waves,
  low_visibility: CloudFog,
  severe_weather: CloudRain,
  road_damage: TriangleAlert,
};

type FilterKey = 'all' | Severity | 'active' | 'acknowledged' | 'resolved';
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
  { key: 'active', label: 'Active' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'resolved', label: 'Resolved' },
];

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
const ROAD_OPTIONS = ROADS.map((r) => ({ value: r.id, label: `${r.name} (${r.id.replace('-', '–')})` }));

function matches(i: Incident, f: FilterKey) {
  if (f === 'all') return true;
  if (f === 'active' || f === 'acknowledged' || f === 'resolved') return i.status === f;
  return i.severity === f;
}

function IncidentCard({ inc, now, startClock }: { inc: Incident; now: number; startClock: number }) {
  const [open, setOpen] = useState(false);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const select = useStore((s) => s.select);
  const navigate = useStore((s) => s.navigate);
  const Icon = ICON[inc.type];
  const fill = inc.severity === 'critical' ? 'bg-crit text-white' : inc.severity === 'high' ? 'bg-bad-soft text-bad' : inc.severity === 'medium' ? 'bg-warn-soft text-warn' : 'bg-primary-soft text-primary-ink';
  return (
    <Card as="article" className={cx('p-4 sm:p-5', inc.status === 'resolved' && 'opacity-75')}>
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', fill)}>
          <Icon size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{inc.title}</h3>
            <SeverityBadge severity={inc.severity} />
            <Badge tone={inc.status === 'active' ? 'bad' : inc.status === 'acknowledged' ? 'warn' : 'good'}>{inc.status[0].toUpperCase() + inc.status.slice(1)}</Badge>
            {inc.blocksRoad && inc.status !== 'resolved' && <Badge tone="crit" icon={Ban}>Road closed</Badge>}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {inc.id} · {incidentWhere(inc)} · raised {simClockAt({ startClock }, inc.createdAt)} ({fmtAgo(now, inc.createdAt)}) · {inc.source === 'operator' ? 'operator simulation' : 'automatic detection'}
          </p>
          <p className="mt-2 text-[13px] text-ink-2">{inc.description}</p>
          <div className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
            <span className="font-medium text-ink">Recommended response: </span>
            {inc.recommendation}
          </div>
          {open && (
            <ol className="mt-3 flex flex-col gap-1 border-l-2 border-line pl-3 text-xs text-ink-2">
              {inc.log.map((l, i) => (
                <li key={i}>
                  <span className="text-ink-3 tabular">{simClockAt({ startClock }, l.t)}</span> — {l.text}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-[52px]">
        {inc.status === 'active' && (
          <Button
            size="sm"
            variant="secondary"
            icon={Check}
            onClick={() => {
              act((s) => acknowledgeIncident(s, inc.id));
              toast({ title: `${inc.id} acknowledged`, tone: 'info' });
            }}
          >
            Acknowledge
          </Button>
        )}
        {inc.status !== 'resolved' && (
          <Button
            size="sm"
            variant="primary"
            icon={CheckCheck}
            onClick={() => {
              act((s) => resolveIncident(s, inc.id, 'operator'));
              toast({ title: `${inc.id} resolved`, message: inc.blocksRoad ? 'The road is open to traffic again.' : undefined, tone: 'success' });
            }}
          >
            Resolve
          </Button>
        )}
        {inc.location.kind === 'road' && (
          <Button
            size="sm"
            variant="ghost"
            icon={MapPin}
            onClick={() => {
              select({ kind: 'road', id: inc.location.id });
              navigate('network');
            }}
          >
            View on map
          </Button>
        )}
        <Button size="sm" variant="ghost" iconRight={ChevronDown} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide history' : `History (${inc.log.length})`}
        </Button>
        {inc.status === 'resolved' && inc.resolvedAt !== null && (
          <span className="text-xs text-ink-3">
            Resolved {inc.resolvedBy === 'system' ? 'automatically' : 'by operator'} at {simClockAt({ startClock }, inc.resolvedAt)}
          </span>
        )}
      </div>
    </Card>
  );
}

export function Incidents() {
  const incidents = useSim((s) => s.incidents);
  const events = useSim((s) => s.events);
  const now = useSim((s) => Math.floor(s.time));
  const startClock = useSim((s) => s.startClock);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [road, setRoad] = useState('B-C');
  const [severity, setSeverity] = useState<Severity>('high');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [minSev, setMinSev] = useState('info');
  const [limit, setLimit] = useState(40);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, incidents.filter((i) => matches(i, f.key)).length])), [incidents]);
  const list = useMemo(() => {
    const order = { active: 0, acknowledged: 1, resolved: 2 };
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return incidents.filter((i) => matches(i, filter)).sort((a, b) => order[a.status] - order[b.status] || rank[a.severity] - rank[b.severity] || b.createdAt - a.createdAt);
  }, [incidents, filter]);
  const log = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter(
      (e) =>
        (cat === 'all' || e.category === cat) &&
        EVENT_SEVERITY_RANK[e.severity] >= EVENT_SEVERITY_RANK[minSev as keyof typeof EVENT_SEVERITY_RANK] &&
        (!needle || e.message.toLowerCase().includes(needle) || e.location.toLowerCase().includes(needle)),
    );
  }, [events, q, cat, minSev]);

  return (
    <>
      <PageHeader
        title="Incidents & Alerts"
        description="Incidents are raised automatically by detector rules (congestion, waterlogging, low visibility, severe weather, road damage) or simulated by you. Duplicates are merged, so one problem never floods the alert feed."
        icon={Siren}
      />

      <Card className="mb-6">
        <CardHeader title="Simulate an incident" subtitle="Choose a location and severity, then generate the event" icon={TriangleAlert} />
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_auto]">
          <Field label="Location (road segment)" htmlFor="inc-road">
            <Select id="inc-road" value={road} onChange={setRoad} options={ROAD_OPTIONS} />
          </Field>
          <Field label="Severity" htmlFor="inc-sev" hint="High or critical collisions close the road.">
            <Select id="inc-sev" value={severity} onChange={(v) => setSeverity(v as Severity)} options={SEVERITY_OPTIONS} />
          </Field>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-1 lg:pb-5">
            <Button variant="primary" icon={CarFront} onClick={() => quick.accident(road, severity)}>
              Simulate accident
            </Button>
            <Button variant="secondary" icon={Construction} onClick={() => quick.blockage(road, severity)}>
              Simulate road blockage
            </Button>
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter incidents">
        {FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)} count={counts[f.key]}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {list.length === 0 ? (
          <Card>
            <EmptyState
              title={filter === 'all' ? 'No incidents so far' : 'Nothing matches this filter'}
              body={filter === 'all' ? 'Use “Simulate accident” above, or trigger heavy rain or congestion — detectors raise incidents automatically.' : 'Try another filter.'}
              action={
                filter === 'all' ? (
                  <Button variant="tonal" icon={CarFront} onClick={() => quick.accident(road, severity)}>
                    Simulate accident
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setFilter('all')}>
                    Show all
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          list.slice(0, 30).map((inc) => <IncidentCard key={inc.id} inc={inc} now={now} startClock={startClock} />)
        )}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Event log"
          subtitle={`${log.length} of ${events.length} events · every detection and action, newest first`}
          icon={ListChecks}
          actions={
            <div className="flex flex-wrap gap-2">
              <SearchInput value={q} onChange={setQ} placeholder="Search events" />
              <Select ariaLabel="Category" className="w-40" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All categories' }, ...EVENT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]} />
              <Select
                ariaLabel="Minimum severity"
                className="w-40"
                value={minSev}
                onChange={setMinSev}
                options={[
                  { value: 'info', label: 'All severities' },
                  { value: 'low', label: 'Low and above' },
                  { value: 'medium', label: 'Medium and above' },
                  { value: 'high', label: 'High and above' },
                ]}
              />
            </div>
          }
        />
        <div className="px-5 pb-4">
          {log.length === 0 ? (
            <EmptyState title="No matching events" body="Clear the search or choose a different category." />
          ) : (
            <ul className="divide-y divide-line">
              {log.slice(0, limit).map((e) => (
                <EventRow key={e.id} e={e} startClock={startClock} />
              ))}
            </ul>
          )}
          {log.length > limit && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLimit((l) => l + 60)}>
              Show more
            </Button>
          )}
          <div className="mt-3">
            <SimNote>All incidents and responses are simulated. No emergency services are contacted.</SimNote>
          </div>
        </div>
      </Card>
    </>
  );
}
