import { useState } from 'react';
import { Car, Lightbulb, Map as MapIcon, Radio, RotateCcw, Siren, TrafficCone, Type, Waypoints, Layers } from 'lucide-react';
import { useStore, useSim } from '../store/simStore';
import { JUNCTIONS, ROADS } from '../sim/network';
import { Button, Card, CardHeader, Chip, ConfirmDialog, PageHeader, Select, SimNote } from '../components/ui';
import { DEFAULT_LAYERS, RoadMap, TrafficLegend, type MapLayers } from '../components/map/RoadMap';
import { Inspector } from '../components/map/Inspector';

const LAYER_CHIPS: Array<{ key: keyof MapLayers; label: string; icon: typeof Car }> = [
  { key: 'density', label: 'Traffic density', icon: Layers },
  { key: 'vehicles', label: 'Vehicles', icon: Car },
  { key: 'signals', label: 'Signals', icon: TrafficCone },
  { key: 'incidents', label: 'Incidents', icon: Siren },
  { key: 'sensors', label: 'Sensors', icon: Radio },
  { key: 'network', label: 'Gateway links', icon: Waypoints },
  { key: 'lights', label: 'Streetlights', icon: Lightbulb },
  { key: 'labels', label: 'Labels', icon: Type },
];

export function LiveNetwork() {
  const [layers, setLayers] = useState<MapLayers>({ ...DEFAULT_LAYERS, sensors: true });
  const [confirm, setConfirm] = useState(false);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const reset = useStore((s) => s.reset);
  const toast = useStore((s) => s.toast);
  const vehicles = useSim((s) => s.vehicles.length);
  const emergencies = useSim((s) => s.vehicles.filter((v) => v.kind === 'ambulance' || v.kind === 'fire' || v.kind === 'police').length);

  const presets: Array<{ label: string; layers: Partial<MapLayers> }> = [
    { label: 'All', layers: { density: true, vehicles: true, signals: true, incidents: true, sensors: true, network: true, lights: true, labels: true } },
    { label: 'Traffic', layers: { density: true, vehicles: true, signals: true, incidents: true, sensors: false, network: false, lights: false } },
    { label: 'IoT devices', layers: { density: false, vehicles: false, signals: false, incidents: false, sensors: true, network: true, lights: true } },
  ];

  return (
    <>
      <PageHeader
        title="Live Road Network"
        description="A simulated city grid: six signalised junctions (A–F), twelve road segments and five entry points. Vehicles drive on the left and move only along defined roads."
        icon={MapIcon}
        actions={
          <Button variant="secondary" icon={RotateCcw} onClick={() => setConfirm(true)}>
            Reset network
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
            <span className="mr-1 text-xs font-medium text-ink-3">Show</span>
            {presets.map((p) => (
              <Chip key={p.label} active={false} onClick={() => setLayers((l) => ({ ...l, ...p.layers }))}>
                {p.label}
              </Chip>
            ))}
            <span className="h-5 w-px bg-line-strong" aria-hidden />
            {LAYER_CHIPS.map((c) => (
              <Chip key={c.key} icon={c.icon} active={layers[c.key]} onClick={() => setLayers((l) => ({ ...l, [c.key]: !l[c.key] }))}>
                {c.label}
              </Chip>
            ))}
          </div>
          <div className="p-3">
            <RoadMap layers={layers} height="clamp(340px, 58vw, 680px)" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4">
            <TrafficLegend />
            <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
              <span>{vehicles} vehicles</span>
              <span>{emergencies} emergency</span>
              <SimNote>Drag to pan when zoomed in</SimNote>
            </div>
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Analyse a location" subtitle="Or click directly on the map" />
            <div className="grid grid-cols-1 gap-3 px-5 pb-5">
              <Select
                ariaLabel="Select a junction or road"
                value={selection ? `${selection.kind}:${selection.id}` : ''}
                onChange={(v) => {
                  if (!v) return select(null);
                  const [kind, id] = v.split(':');
                  select({ kind: kind as 'junction' | 'road', id });
                }}
                options={[
                  { value: '', label: 'Choose…' },
                  ...JUNCTIONS.map((j) => ({ value: `junction:${j.id}`, label: `Junction ${j.id} · ${j.name}`, group: 'Junctions' })),
                  ...ROADS.map((r) => ({ value: `road:${r.id}`, label: r.name, group: 'Road segments' })),
                ]}
              />
            </div>
          </Card>
          <Card className="p-5">
            <Inspector onClose={() => select(null)} />
          </Card>
          <Card className="p-5">
            <p className="mb-3 text-sm font-semibold text-ink">Map key</p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-ink-2">
              <KeyItem swatch={<rect x={2} y={4} width={12} height={6} rx={3} fill="var(--veh-1)" />} label="Car / bike / bus" />
              <KeyItem swatch={<><circle cx={8} cy={7} r={6} fill="#d93025" opacity={0.25} /><rect x={2} y={4} width={12} height={6} rx={3} fill="#fff" stroke="#d93025" /></>} label="Emergency vehicle" />
              <KeyItem swatch={<rect x={2} y={5} width={12} height={4} rx={2} fill="#1e8e3e" />} label="Stop line (signal)" />
              <KeyItem swatch={<circle cx={8} cy={7} r={6} fill="#d93025" stroke="#fff" strokeWidth={1.5} />} label="Incident" />
              <KeyItem swatch={<rect x={4} y={3} width={8} height={8} rx={1.5} fill="none" stroke="#1a73e8" strokeWidth={2} />} label="Vehicle sensor" />
              <KeyItem swatch={<circle cx={8} cy={7} r={4.5} fill="none" stroke="#1a73e8" strokeWidth={2} />} label="Road sensor" />
              <KeyItem swatch={<circle cx={8} cy={7} r={3.5} fill="#fbbc04" />} label="Streetlight" />
              <KeyItem swatch={<rect x={4} y={3} width={8} height={8} rx={1.5} fill="#e37400" transform="rotate(45 8 7)" />} label="Road damage" />
              <KeyItem swatch={<circle cx={8} cy={7} r={4.5} fill="#7b1fa2" />} label="Pedestrian" />
              <KeyItem swatch={<line x1={1} y1={7} x2={15} y2={7} stroke="#1a73e8" strokeWidth={3} strokeDasharray="1 4" strokeLinecap="round" />} label="Emergency route" />
            </ul>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Reset the road network?"
        body="Vehicles, signals, incidents, weather and sensors return to the initial scenario. This also clears the current run's history."
        confirmLabel="Reset"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          reset();
          toast({ title: 'Road network reset', message: 'Press Start in the control bar to run the simulation again.', tone: 'success' });
        }}
      />
    </>
  );
}

function KeyItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <svg width={16} height={14} aria-hidden className="shrink-0">
        {swatch}
      </svg>
      {label}
    </li>
  );
}
