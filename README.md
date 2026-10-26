# Smart Roads — IoT-Enabled Intelligent Transportation Infrastructure

A working, interactive simulation of a smart city road network, built as a college IoT microproject.
It runs entirely in the browser: **no physical sensors, no paid APIs, no API keys and no internet are required.**

> Every sensor, message, vehicle and outcome in this app is **simulated**. Nothing controls real traffic
> and no real emergency services are contacted.

---

## 1. Run it on your laptop

### Requirements
- **Node.js 22 LTS** (or Node 20.19 or newer). Download from https://nodejs.org — check with `node -v`.

### Steps
```bash
# 1. Open a terminal inside this folder (the one that contains package.json)
cd smart-roads

# 2. Install the packages (only needed the first time, takes about a minute)
npm install

# 3. Start the development server
npm run dev
```

The browser opens automatically at **http://localhost:5173**. If it doesn't, open that address yourself.
Stop the server with `Ctrl + C` in the terminal.

### Other commands
| Command | What it does |
|---|---|
| `npm run dev` | Start the app on http://localhost:5173 (auto-reloads when you edit code) |
| `npm test` | Run the automated tests for the simulation engine |
| `npm run build` | Type-check and build an optimised version into `dist/` |
| `npm run preview` | Serve the built `dist/` version on http://localhost:4173 |
| `npm run build:single` | Build **one self-contained HTML file** into `dist-single/index.html` — double-click it to run without a server |

### Troubleshooting
- **`npm` is not recognised** → Node.js is not installed, or the terminal was opened before installing it. Reinstall Node and open a new terminal.
- **Port 5173 already in use** → run `npm run dev -- --port 5174` and open http://localhost:5174.
- **Blank page** → open the browser console (F12) and check for errors; make sure `npm install` finished without errors.
- **Fonts look slightly different offline** → the Inter font loads from Google Fonts; without internet the system font is used. Everything else works offline.

---

## 2. Technology stack

| Part | Technology |
|---|---|
| Frontend | React 19 + TypeScript, built with Vite |
| Styling | Tailwind CSS 4 (design tokens for light and dark mode) |
| State | Zustand store + Immer (immutable updates) |
| Charts | Recharts |
| Icons | Lucide React |
| Animation | Motion (`motion/react`) |
| Road map | Custom SVG road network (works offline) |
| Storage | `localStorage` for settings and preferences |
| Tests | Vitest |

There is no backend: the whole simulation engine runs in TypeScript in the browser.

---

## 3. How it works — Sense → Communicate → Process → Respond

| Stage | In this app |
|---|---|
| **Sense** | 39 virtual sensors read the simulated city: vehicle detection, motion, weather, road condition, RFID, streetlight controllers |
| **Communicate** | Each reading becomes an MQTT-style message (topic + JSON payload) sent through one of 3 roadside gateways — simulated latency, packet loss and outages, no broker needed |
| **Process** | Edge and cloud rules detect congestion, accidents, waterlogging, low visibility, severe weather and road damage |
| **Respond** | Adaptive signal timing, emergency-vehicle priority, smart streetlights, alerts and maintenance tasks |

### Architecture

```
src/
├── sim/                 ← SIMULATION ENGINE (pure TypeScript, no UI)
│   ├── types.ts           data model (vehicles, signals, incidents, devices …)
│   ├── network.ts         fixed road graph: 6 junctions, 5 entry points, 12 roads
│   ├── engine.ts          SimulationEngine: central clock, runs every module in order
│   ├── signals.ts         TrafficSignalController (adaptive / fixed / manual / priority)
│   ├── vehicles.ts        vehicle movement, traffic surges, emergency vehicles
│   ├── stats.ts           what the vehicle sensors "see" (queues, density, wait)
│   ├── routing.ts         RoutePlanner (Dijkstra, congestion-aware, avoids blocked roads)
│   ├── incidents.ts       IncidentDetection (rules, de-duplication, lifecycle)
│   ├── weather.ts         virtual weather sensors and daylight curve
│   ├── lighting.ts        smart streetlight rules and energy estimate
│   ├── roadHealth.ts      predictive maintenance simulation (rule-based)
│   ├── devices.ts         SensorGenerator: device registry and IoT messaging
│   ├── history.ts         5-second snapshots for charts
│   ├── random.ts          seeded random numbers (repeatable scenarios)
│   └── engine.test.ts     automated tests
├── store/
│   ├── simStore.ts        central store + the single simulation timer
│   └── quickActions.ts    one-click scenario actions
├── services/
│   ├── storage.ts         StorageService (localStorage, failure-tolerant)
│   └── report.ts          CSV / JSON report export
├── components/          ← shared UI: layout, map, charts, cards, dialogs
├── pages/               ← the 10 pages
└── demo/GuidedDemo.tsx  ← welcome dialog + 11-step guided demo
```

**One tick (every 100 ms of real time, × the speed setting):**
weather → traffic signals → vehicles → sensor readings → streetlights;
once per simulated second: pedestrians, road wear, incident detection, device messages;
every 5 simulated seconds: a history snapshot for the charts.

The simulation logic is separate from the screens. Pages only read the store and call engine functions,
so the same engine could later be fed by real sensor data.

### Key rules (all documented in the code comments)
- **Signals:** N–S green → yellow 3 s → all-red 1.5 s → E–W green → … Conflicting approaches are never green together.
- **Adaptive green:** `min green + 2.5 s × (queued + ½ × approaching vehicles)`, kept between 10 s and 45 s; ends early if the green approach is empty. A junction whose sensor is offline falls back to a fixed 20 s cycle.
- **Emergency priority:** request sent 230 m before a junction; the requested direction gets green (after a 2 s safety minimum for the other side), then normal operation resumes.
- **Incidents:** one open incident per type + location; a resolved detector incident cannot re-open for 60 s.
- **Road health:** `0.6 × surface + 0.25 × (100 − pothole risk) + 0.15 × (100 − waterlogging risk)` — a transparent rule-based model, not machine learning.
- **Streetlights:** off in daylight; automatic 30–80 % by darkness, 100 % on motion; energy-saving 20 % minimum; fail-safe 100 % if a controller fails. Energy values are estimates.

---

## 4. Demo guide for faculty (about 5 minutes)

1. Open the app. In the welcome dialog click **Start guided demo** — the simulation resets, runs at 2× and a guide appears in the bottom-right corner.
2. **Sensors report:** the guide opens Traffic Management — vehicle counts and queues update every 2 s.
3. **Congestion:** press *Generate traffic surge* — roads around Junction B turn yellow/red.
4. **Adaptive signals:** watch Junction B's green time grow; the *Recent timing changes* table shows before → after.
5. **Accident:** press *Simulate accident* — Lake Road (B–C) closes and a detour is recommended.
6. **Handle it:** on Incidents & Alerts press *Acknowledge*, then *Resolve* — the road reopens and the log records it.
7. **Ambulance:** press *Dispatch ambulance* — it follows a Dijkstra route and every junction turns green as it arrives.
8. **Heavy rain:** waterlogging risk rises on poorly drained roads; alerts and drainage tasks appear.
9. **Road damage:** a vibration spike on River Road creates a maintenance task — press *Complete* to repair it.
10. **Streetlights:** set the time to 20:00 — lights switch on, dim on empty roads and brighten for vehicles.
11. **Analytics:** review the charts and press *Download report (CSV)*.

Other things worth showing: **Sensor failure** (junction falls back to fixed timing), switching off a **gateway**
in Device Simulator (messages are buffered, then flushed), and the **light/dark** switch in the top bar.
**Reset demo** in the guide restores the starting scenario.

### Likely questions
- *Is the data real?* — No. Every sensor is a software model that reads the simulated city and publishes a reading.
  The control logic only uses those readings, so it would work the same with real sensors.
- *Why does it show 39/39 sensors?* — The registry has 39 virtual sensors (plus 3 gateways). A sensor counts as
  active when its status is online and its gateway is online. Fail or disconnect one and the number drops.
- *How are duplicate alerts avoided?* — De-duplication by type + location, plus a cooldown after resolution.

---

## 5. Settings and data
- Settings (speed, thresholds, signal limits, lighting rules, theme …) are saved in the browser's `localStorage`.
- Simulation history lives in memory for the open tab and can be cleared from Analytics or Settings.
- Reports export as CSV (time series, incidents, road health, emergency runs) or JSON (full summary).
