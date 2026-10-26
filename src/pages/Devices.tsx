import { useMemo, useState } from 'react';
import {
  Battery,
  BatteryLow,
  Cloud,
  Cpu,
  MessageSquare,
  Plus,
  Power,
  PowerOff,
  Radio,
  RefreshCcw,
  Router,
  Send,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
  CircleX,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { useStore, useSim } from '../store/simStore';
import { DEVICE_TYPE_LABEL, addDevice, networkSummary, removeDevice, sendTestMessage, setDeviceStatus, triggerReading } from '../sim/devices';
import { JUNCTIONS, ROADS } from '../sim/network';
import { fmtAgo, simClockAt } from '../sim/format';
import { Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, InfoTip, MiniStat, Modal, PageHeader, SearchInput, Select, SimNote, Switch, cx } from '../components/ui';
import type { Device, DeviceType, IoTMessage, MessageStatus, SimState } from '../sim/types';

const TYPES = Object.keys(DEVICE_TYPE_LABEL) as DeviceType[];
const MSG_TONE: Record<MessageStatus, 'neutral' | 'primary' | 'good' | 'bad'> = { queued: 'neutral', delivered: 'primary', processed: 'good', failed: 'bad' };
const LOCATION_OPTIONS = [
  ...JUNCTIONS.map((j) => ({ value: `junction:${j.id}`, label: `Junction ${j.id} · ${j.name}`, group: 'Junctions' })),
  ...ROADS.map((r) => ({ value: `road:${r.id}`, label: r.name, group: 'Road segments' })),
];

// ---------- Pipeline ----------
function Pipeline() {
  const devices = useSim((s) => s.devices);
  const net = useSim((s) => s.net);
  const messages = useSim((s) => s.messages);
  const adjustments = useSim((s) => s.adjustments.length);
  const incidents = useSim((s) => s.incidents.length);
  const summary = useMemo(() => networkSummary({ net, messages } as SimState), [net, messages]);
  const gateways = devices.filter((d) => d.type === 'gateway');
  const gwUp = gateways.filter((g) => g.status === 'online').length;
  const sensors = devices.filter((d) => d.type !== 'gateway');
  const reporting = sensors.filter((d) => d.status === 'online').length;
  const degraded = gwUp < gateways.length;
  const stages: Array<{ icon: LucideIcon; title: string; stat: string; sub: string; bad?: boolean }> = [
    { icon: Radio, title: 'Sensors', stat: `${reporting} / ${sensors.length}`, sub: 'devices reporting' },
    { icon: Router, title: 'Roadside gateways', stat: `${gwUp} / ${gateways.length} online`, sub: `${summary.queued} queued`, bad: degraded },
    { icon: Cpu, title: 'Edge processing', stat: `${Math.round(net.edgeLatencyMs)} ms`, sub: 'fast local rules' },
    { icon: Cloud, title: 'Cloud dashboard', stat: `${Math.round(net.cloudLatencyMs)} ms`, sub: `${net.processed.toLocaleString()} processed` },
    { icon: Zap, title: 'Control actions', stat: `${adjustments + incidents}`, sub: 'signal changes + alerts' },
  ];
  return (
    <Card className="mb-6">
      <CardHeader title="IoT data flow" subtitle="Sensor → Roadside Gateway → Edge Processing → Cloud Dashboard → Control Action (simulated)" icon={Activity} />
      <ol className="flex flex-col gap-2 px-5 pb-5 lg:flex-row lg:items-stretch lg:gap-0">
        {stages.map((st, i) => {
          const Icon = st.icon;
          const linkBad = degraded && i === 0;
          return (
            <li key={st.title} className="flex flex-col items-stretch lg:flex-1 lg:flex-row lg:items-center">
              <div className={cx('flex flex-1 items-center gap-3 rounded-2xl border p-3.5', st.bad ? 'border-bad/40 bg-bad-soft' : 'border-line bg-surface-2')}>
                <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', st.bad ? 'bg-bad-fill text-white' : 'bg-primary-soft text-primary-ink')}>
                  <Icon size={19} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-3">{st.title}</p>
                  <p className={cx('text-base font-semibold tabular', st.bad ? 'text-bad' : 'text-ink')}>{st.stat}</p>
                  <p className="truncate text-xs text-ink-3">{st.sub}</p>
                </div>
              </div>
              {i < stages.length - 1 && (
                <div className="relative mx-auto h-6 w-6 lg:mx-1 lg:h-6 lg:w-10" aria-hidden>
                  <svg viewBox="0 0 40 24" className="hidden size-full lg:block">
                    <line x1={2} y1={12} x2={38} y2={12} stroke={linkBad ? '#d93025' : '#1a73e8'} strokeWidth={2.5} strokeDasharray="4 4" className={linkBad ? undefined : 'flow-dash'} />
                  </svg>
                  <svg viewBox="0 0 24 24" className="size-full lg:hidden">
                    <line x1={12} y1={2} x2={12} y2={22} stroke={linkBad ? '#d93025' : '#1a73e8'} strokeWidth={2.5} strokeDasharray="4 4" className={linkBad ? undefined : 'flow-dash'} />
                  </svg>
                  {linkBad && <CircleX size={16} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface text-bad" />}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---------- Gateways ----------
function Gateways() {
  const devices = useSim((s) => s.devices);
  const messages = useSim((s) => s.messages);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const buffer = useStore((s) => s.settings.bufferDuringOutage);
  const update = useStore((s) => s.updateSettings);
  const gateways = devices.filter((d) => d.type === 'gateway');
  return (
    <Card>
      <CardHeader title="Roadside gateways" subtitle="Simulate a network interruption" icon={Router} />
      <div className="flex flex-col gap-3 px-5 pb-5">
        {gateways.map((g) => {
          const attached = devices.filter((d) => d.gatewayId === g.id).length;
          const queued = messages.filter((m) => m.gatewayId === g.id && m.status === 'queued').length;
          const up = g.status === 'online';
          return (
            <div key={g.id} className={cx('rounded-xl border p-3.5', up ? 'border-line' : 'border-bad/40 bg-bad-soft')}>
              <Switch
                checked={up}
                onChange={(v) => {
                  act((s) => setDeviceStatus(s, g.id, v ? 'online' : 'offline'));
                  toast({ title: v ? `${g.name} reconnected` : `${g.name} disconnected`, message: v ? 'Buffered messages are being delivered.' : `${attached} devices lose connectivity. Signals at affected junctions fall back to fixed timing.`, tone: v ? 'success' : 'warning' });
                }}
                label={
                  <span className="flex items-center gap-2">
                    {up ? <Wifi size={15} className="text-good" aria-hidden /> : <WifiOff size={15} className="text-bad" aria-hidden />}
                    {g.name}
                  </span>
                }
                description={`${attached} devices · ${queued} queued${up ? '' : ' · OUTAGE'}`}
              />
            </div>
          );
        })}
        <Switch
          checked={buffer}
          onChange={(v) => update({ bufferDuringOutage: v })}
          label="Buffer messages during outages"
          description={buffer ? 'Devices queue messages and resend them when the gateway returns.' : 'Messages sent during an outage fail immediately.'}
        />
      </div>
    </Card>
  );
}

// ---------- Add device ----------
function AddDeviceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<DeviceType>('vehicle_sensor');
  const [loc, setLoc] = useState('junction:B');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const submit = () => {
    if (name.length > 40) return setError('Name must be 40 characters or fewer.');
    const [kind, id] = loc.split(':');
    const res = act((s) => addDevice(s, { type, location: { kind: kind as 'junction' | 'road', id }, name }));
    if (!res.ok) return setError(res.error);
    toast({ title: `Device ${res.id} added`, message: 'It will publish its first reading in a moment.', tone: 'success' });
    setName('');
    setError(null);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a virtual device"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Plus} onClick={submit}>
            Add device
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Device type" htmlFor="dev-type">
          <Select id="dev-type" value={type} onChange={(v) => setType(v as DeviceType)} options={TYPES.filter((t) => t !== 'gateway').map((t) => ({ value: t, label: DEVICE_TYPE_LABEL[t] }))} />
        </Field>
        <Field label="Location" htmlFor="dev-loc" hint="The device joins the nearest roadside gateway automatically.">
          <Select id="dev-loc" value={loc} onChange={setLoc} options={LOCATION_OPTIONS} />
        </Field>
        <Field label="Name (optional)" htmlFor="dev-name">
          <input
            id="dev-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Extra queue sensor"
            className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
          />
        </Field>
        {error && <p className="text-[13px] text-bad">{error}</p>}
      </div>
    </Modal>
  );
}

// ---------- Registry ----------
function statusInfo(d: Device, gwOnline: Record<string, boolean>) {
  if (d.status === 'failed') return { tone: 'bad' as const, label: 'Failed' };
  if (d.status === 'offline') return { tone: 'neutral' as const, label: 'Disconnected' };
  if (d.gatewayId && !gwOnline[d.gatewayId]) return { tone: 'warn' as const, label: 'Comm. issue' };
  return { tone: 'good' as const, label: 'Online' };
}

export function Devices() {
  const devices = useSim((s) => s.devices);
  const messages = useSim((s) => s.messages);
  const net = useSim((s) => s.net);
  const now = useSim((s) => s.time);
  const startClock = useSim((s) => s.startClock);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [adding, setAdding] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const summary = useMemo(() => networkSummary({ net, messages } as SimState), [net, messages]);
  const gwOnline = useMemo(() => Object.fromEntries(devices.filter((d) => d.type === 'gateway').map((g) => [g.id, g.status === 'online'])), [devices]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return devices.filter((d) => {
      if (type !== 'all' && d.type !== type) return false;
      const st = statusInfo(d, gwOnline).label.toLowerCase();
      if (status !== 'all' && !(status === 'issue' ? st !== 'online' : st === status)) return false;
      return !needle || d.id.toLowerCase().includes(needle) || d.name.toLowerCase().includes(needle) || d.locationLabel.toLowerCase().includes(needle);
    });
  }, [devices, q, type, status, gwOnline]);
  const shownMessages = useMemo(() => (focus ? messages.filter((m) => m.deviceId === focus) : messages).slice(0, 40), [messages, focus]);

  const run = (label: string, fn: (s: SimState) => void, tone: 'info' | 'success' | 'warning' = 'info') => {
    act((s) => fn(s));
    toast({ title: label, tone });
  };

  return (
    <>
      <PageHeader
        title="Device Simulator"
        description="Every virtual IoT device in the network. Connect, disconnect or fail devices, trigger readings and send test messages to see how data moves from a sensor to a control action."
        icon={Cpu}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
            Add virtual device
          </Button>
        }
      />
      <Pipeline />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MiniStat label={<>Throughput <InfoTip text="Average messages published per simulated second over the last minute." /></>} value={`${summary.throughput.toFixed(1)} msg/s`} />
        <MiniStat label="Delivery success" value={`${summary.deliveryRate.toFixed(1)} %`} tone={summary.deliveryRate < 95 ? 'bad' : 'good'} hint="last 60 s" />
        <MiniStat label="Failed messages" value={net.failed} hint={`${summary.failedWindow} in last 60 s`} tone={summary.failedWindow ? 'warn' : undefined} />
        <MiniStat label="Queued / buffered" value={summary.queued} tone={summary.queued > 20 ? 'warn' : undefined} />
        <MiniStat label={<>Edge latency <InfoTip text="Simulated delay for messages handled at the roadside edge server (vehicle, motion and RFID sensors)." /></>} value={`${Math.round(net.edgeLatencyMs)} ms`} />
        <MiniStat label={<>Cloud latency <InfoTip text="Simulated delay for telemetry sent on to the cloud dashboard (weather, road condition, streetlights)." /></>} value={`${Math.round(net.cloudLatencyMs)} ms`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0">
          <CardHeader
            title="Device registry"
            subtitle={`${list.length} of ${devices.length} devices`}
            icon={Radio}
            actions={
              <div className="flex flex-wrap gap-2">
                <SearchInput value={q} onChange={setQ} placeholder="Search ID, name or location" />
                <Select ariaLabel="Device type" className="w-48" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...TYPES.map((t) => ({ value: t, label: DEVICE_TYPE_LABEL[t] }))]} />
                <Select
                  ariaLabel="Status"
                  className="w-40"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: 'all', label: 'Any status' },
                    { value: 'online', label: 'Online' },
                    { value: 'issue', label: 'Any problem' },
                    { value: 'failed', label: 'Failed' },
                    { value: 'disconnected', label: 'Disconnected' },
                  ]}
                />
              </div>
            }
          />
          {list.length === 0 ? (
            <EmptyState title="No devices match" body="Clear the search or filters." />
          ) : (
            <div className="max-h-[640px] overflow-auto px-2 pb-3 scroll-thin">
              <table className="w-full min-w-[980px] text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="text-xs text-ink-3">
                    <th className="px-3 py-2 font-medium">Device</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Last reported value</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                    <th className="px-3 py-2 font-medium">Battery</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => {
                    const st = statusInfo(d, gwOnline);
                    return (
                      <tr key={d.id} className={cx('border-t border-line', focus === d.id && 'bg-primary-soft/40')}>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-ink">{d.id}</p>
                          <p className="text-xs text-ink-3">{d.custom ? d.name : DEVICE_TYPE_LABEL[d.type]}</p>
                        </td>
                        <td className="max-w-44 px-3 py-2.5 text-ink-2">
                          <p className="truncate">{d.locationLabel}</p>
                          {d.gatewayId && <p className="text-xs text-ink-3">via {d.gatewayId}</p>}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td className="max-w-72 px-3 py-2.5 text-ink-2">
                          <p className="truncate" title={d.lastValue}>
                            {d.lastValue}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-ink-3">{d.lastUpdate === null ? '—' : fmtAgo(now, d.lastUpdate)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {d.battery === null ? (
                            <span className="text-xs text-ink-3">Mains</span>
                          ) : (
                            <span className={cx('inline-flex items-center gap-1 tabular', d.battery < 20 ? 'text-bad' : 'text-ink-2')}>
                              {d.battery < 20 ? <BatteryLow size={15} aria-hidden /> : <Battery size={15} aria-hidden />}
                              {Math.round(d.battery)} %
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-0.5">
                            {d.status === 'online' ? (
                              <IconButton size="sm" icon={PowerOff} label="Disconnect" onClick={() => run(`${d.id} disconnected`, (s) => setDeviceStatus(s, d.id, 'offline'), 'warning')} />
                            ) : (
                              <IconButton size="sm" icon={Power} label={d.status === 'failed' ? 'Restore device' : 'Connect'} onClick={() => run(`${d.id} ${d.status === 'failed' ? 'restored' : 'connected'}`, (s) => setDeviceStatus(s, d.id, 'online'), 'success')} />
                            )}
                            {d.type !== 'gateway' && d.status !== 'failed' && <IconButton size="sm" icon={CircleX} label="Simulate failure" onClick={() => run(`${d.id} failure simulated`, (s) => setDeviceStatus(s, d.id, 'failed'), 'warning')} />}
                            <IconButton
                              size="sm"
                              icon={RefreshCcw}
                              label="Trigger sample reading"
                              disabled={d.status !== 'online'}
                              onClick={() => {
                                const m = act((s, c) => triggerReading(s, d.id, c));
                                toast({ title: m ? `Reading from ${d.id}` : `${d.id} cannot transmit`, message: m ? `${m.topic} · ${m.status}` : 'The device is offline.', tone: m ? 'info' : 'warning' });
                                setFocus(d.id);
                              }}
                            />
                            <IconButton
                              size="sm"
                              icon={Send}
                              label="Send test message"
                              disabled={d.status !== 'online'}
                              onClick={() => {
                                const m = act((s, c) => sendTestMessage(s, d.id, c));
                                toast({ title: m ? `Test message ${m.id} sent` : 'Not sent', message: m ? (m.buffered ? 'Gateway offline — message buffered.' : 'Watch it move from Queued to Processed.') : 'The device is offline.', tone: 'info' });
                                setFocus(d.id);
                              }}
                            />
                            <IconButton size="sm" icon={MessageSquare} label="Show this device's messages" active={focus === d.id} onClick={() => setFocus(focus === d.id ? null : d.id)} />
                            {d.custom && <IconButton size="sm" icon={Trash2} label="Remove device" onClick={() => run(`${d.id} removed`, (s) => removeDevice(s, d.id))} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Gateways />
          <Card className="min-w-0">
            <CardHeader
              title="Latest messages"
              subtitle={focus ? `From ${focus}` : 'MQTT-style topics · simulated, no broker'}
              icon={MessageSquare}
              actions={
                focus && (
                  <Button size="sm" variant="ghost" onClick={() => setFocus(null)}>
                    Show all
                  </Button>
                )
              }
            />
            <ul className="max-h-[560px] overflow-y-auto px-5 pb-4 scroll-thin">
              {shownMessages.length === 0 && <li className="py-6 text-center text-[13px] text-ink-3">No messages yet. Start the simulation or send a test message.</li>}
              {shownMessages.map((m) => (
                <MessageRow key={m.id} m={m} startClock={startClock} />
              ))}
            </ul>
          </Card>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <SimNote>Devices, radio links and latency are simulated. A real deployment would use hardware sensors and a broker such as MQTT.</SimNote>
      </div>
      <AddDeviceModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function MessageRow({ m, startClock }: { m: IoTMessage; startClock: number }) {
  return (
    <li className="border-b border-line py-2.5 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-ink">
          {m.id} · {m.deviceId}
        </span>
        <Badge tone={MSG_TONE[m.status]}>{m.status === 'queued' && m.buffered ? 'Buffered' : m.status[0].toUpperCase() + m.status.slice(1)}</Badge>
      </div>
      <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">{m.topic}</p>
      <p className="mt-0.5 truncate font-mono text-[11px] text-ink-2" title={m.payload}>
        {m.payload}
      </p>
      <p className="mt-0.5 text-[11px] text-ink-3">
        {simClockAt({ startClock }, m.createdAt)} · {m.tier} · {m.latencyMs} ms{m.failReason ? ` · ${m.failReason}` : ''}
        {m.test ? ' · test' : ''}
      </p>
    </li>
  );
}
