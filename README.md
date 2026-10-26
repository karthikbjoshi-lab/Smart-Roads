# 🚦 Smart Roads — IoT-Enabled Intelligent Transportation Infrastructure

Smart Roads is a web-based IoT simulation of an intelligent road network. Virtual sensors monitor traffic, weather and road condition across six junctions, enabling adaptive traffic signals, accident detection, emergency vehicle priority, smart streetlights and predictive maintenance, all shown on a live interactive dashboard.

> **Note:** This is a simulation. Every sensor, message, vehicle and outcome is generated in software. No physical hardware is connected, no real traffic is controlled and no real emergency services are contacted.

---

## 📌 Table of Contents
- [About the Project](#-about-the-project)
- [Key Features](#-key-features)
- [How It Works](#-how-it-works)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Available Commands](#-available-commands)
- [Project Structure](#-project-structure)
- [System Architecture](#-system-architecture)
- [Simulation Rules](#-simulation-rules)
- [Pages Overview](#-pages-overview)
- [Demo Guide](#-demo-guide)
- [Testing](#-testing)
- [Limitations](#-limitations)
- [Future Scope](#-future-scope)

---

## 📖 About the Project

Cities face growing traffic congestion, slow emergency response, wasted streetlight energy and poorly maintained roads. A smart road system uses IoT sensors and automated decision-making to tackle these problems in real time.

This project demonstrates how such a system works, without needing physical hardware. It simulates a small city with **6 signalised junctions, 12 road segments, 5 entry points and 42 virtual IoT devices**. The system senses what is happening, sends the data through roadside gateways, processes it with rules, and responds automatically.

The application runs entirely in the browser. No backend, database, paid API, API key or internet connection is required.

---

## ✨ Key Features

### 🗺️ Interactive Road Network
- Live SVG city map with junctions, roads, pedestrian crossings, a park, a lake and a river
- ~38 vehicles (cars, bikes, buses, trucks) moving along real road paths, driving on the left
- Colour-coded traffic overlay: **green** (free), **yellow** (moderate), **red** (heavy), **dark red dashed** (blocked)
- Click any junction or road to inspect live readings
- Layer toggles (vehicles, signals, sensors, incidents, streetlights, gateway links, labels), plus zoom and pan

### 🚥 Adaptive Traffic Signals
- A safe state machine for every junction: green → yellow → all-red → other direction
- Conflicting directions are **never green at the same time**
- Green time adapts to the number of waiting vehicles, within configurable limits
- The green ends early when a direction is empty and the other has a queue
- Fixed-cycle mode, automatic fallback when a sensor fails, and a manual demonstration mode
- Every timing change is logged as **before → after**

### 🚨 Accident & Hazard Detection
- Seven incident types: collision, road blockage, heavy congestion, waterlogging, low visibility, severe weather and road damage
- Raised automatically by detector rules, or simulated by the operator with a chosen location and severity
- Each incident shows its severity, location, description and a recommended response, including an automatically calculated detour
- Life cycle: **Active → Acknowledged → Resolved**, with a full history log
- De-duplication and cooldowns, so the same problem never floods the alert feed

### 🚑 Emergency Vehicle Priority
- Dispatch an ambulance, fire engine or police vehicle between any two points
- Shortest route found with **Dijkstra's algorithm**, avoiding busy and blocked roads
- Automatic re-routing if a road on the route becomes blocked
- Each junction on the route turns green as the vehicle approaches, then returns to normal
- RFID readers verify the emergency vehicle at key junctions
- Live ETA, priority status, waiting time and a history of completed runs

### 💡 Smart Streetlights
- 12 LED streetlights with motion detection
- **Automatic mode:** off in daylight, dimmed at night, 100% when a vehicle or pedestrian is nearby
- **Energy-saving mode:** a low minimum brightness, rising to full only on motion
- **Manual mode:** on/off and a brightness slider for each light
- Fail-safe full brightness if a controller fails
- Virtual time-of-day control (day, dusk, night, dawn)
- Estimated energy use and savings compared with conventional lamps

### 🛣️ Road Health & Predictive Maintenance
- A virtual road-condition sensor on every road segment
- Tracks surface condition, vibration, pothole risk and waterlogging risk
- Road health score from 0 to 100 (higher is better)
- A transparent rule-based risk model creates maintenance tasks automatically
- Maintenance queue with acknowledge and complete actions
- Simulate damage events and view road health over time

### 🌦️ Weather & Environmental Sensors
- Virtual sensors for temperature, rainfall, ambient light, visibility and air quality
- Five conditions: Clear, Rain, Heavy Rain, Fog and Low Light
- Weather affects vehicle speed, waterlogging risk, visibility alerts and streetlight brightness

### 📡 Device Simulator & IoT Communication
- Registry of 42 virtual devices: vehicle sensors, motion sensors, weather stations, road sensors, RFID readers, streetlight controllers and gateways
- MQTT-style messages (topic plus JSON payload) moving through **Queued → Delivered → Processed**
- Edge and cloud processing with simulated latency and packet loss
- Simulate a gateway outage: messages are buffered and delivered once it reconnects
- Add devices, connect or disconnect them, simulate failures, trigger readings and send test messages
- Live data-flow diagram: **Sensor → Gateway → Edge → Cloud → Control Action**

### 📊 Analytics & Reports
- Charts for vehicle counts, traffic density, waiting time, incidents by severity and type, energy use, road health, device connectivity and communication performance
- Time filters: last 5, 15 or 30 minutes, or the entire simulation
- Download a report as **CSV** or **JSON**

### 🎛️ Simulation Controls & User Experience
- Start, pause, resume, stop and reset
- Speed control: 0.5×, 1×, 2× and 5×
- One-click scenarios: generate traffic, accident, heavy rain, road blockage, emergency vehicle and sensor failure
- **11-step guided demo** and a first-visit welcome screen
- Light and dark mode, alert notifications, confirmation dialogs and a mobile-friendly layout

---

## ⚙️ How It Works

The system follows the four-stage IoT pipeline:

| Stage | What happens |
|---|---|
| **1. Sense** | 39 virtual sensors read the simulated city: vehicle counts, queues, rainfall, light, vibration and motion |
| **2. Communicate** | Readings are sent as messages through 3 roadside gateways (West, Central, East) |
| **3. Process** | Edge and cloud rules detect congestion, accidents, waterlogging, low visibility and road damage |
| **4. Respond** | Signals adapt, emergency vehicles get priority, streetlights adjust, alerts are raised and maintenance is scheduled |

**How the virtual sensors work:** the simulation engine knows the position of every vehicle and the state of the weather and roads. Each virtual sensor reads the part of this simulated world it would "see" in reality (for example, the vehicles within 150 m of its junction) and publishes a reading. The control logic only uses these sensor readings, so the same logic would work if the virtual sensors were replaced with real hardware.

---

## 🛠️ Tech Stack

| Category | Technology |
|---|---|
| Frontend framework | React 19 |
| Language | TypeScript |
| Build tool & dev server | Vite |
| Styling | Tailwind CSS 4 |
| State management | Zustand + Immer |
| Charts | Recharts |
| Icons | Lucide React |
| Animations | Motion |
| Road map | Custom SVG (works offline) |
| Storage | Browser localStorage (settings only) |
| Testing | Vitest |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 22 LTS** (or v20.19 or newer). Download it from [nodejs.org](https://nodejs.org).

Check the installation:
```bash
node -v
npm -v
```

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/<your-username>/smart-roads.git
cd smart-roads
```

**2. Install dependencies**
```bash
npm install
```

**3. Start the development server**
```bash
npm run dev
```

**4. Open in your browser**
```
http://localhost:5173
```

To stop the server, press `Ctrl + C` in the terminal.

### Verify the installation
```bash
npm ls --depth=0
```
All 16 packages should be listed with version numbers.

### Troubleshooting

| Problem | Solution |
|---|---|
| `npm` not recognised | Reinstall Node.js and open a new terminal |
| `UNMET DEPENDENCY` | Run `npm install` in the project folder |
| PowerShell: "running scripts is disabled" | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Port 5173 already in use | Run `npm run dev -- --port 5174` |
| Network errors during install | Switch to a different network (e.g. mobile hotspot) and retry |
| Broken installation | Delete the `node_modules` folder and run `npm install` again |

---

## 📜 Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the development server at http://localhost:5173 |
| `npm test` | Run the automated tests |
| `npm run build` | Type-check and create a production build in `dist/` |
| `npm run preview` | Preview the production build at http://localhost:4173 |
| `npm run build:single` | Build a single self-contained HTML file in `dist-single/` |
| `npm run typecheck` | Check the code for TypeScript errors |

---

## 📁 Project Structure

```
smart-roads/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── README.md
└── src/
    ├── main.tsx                  # App entry point
    ├── App.tsx                   # Page routing and theme
    ├── index.css                 # Design tokens (light & dark mode)
    │
    ├── sim/                      # SIMULATION ENGINE (pure logic, no UI)
    │   ├── types.ts              # Data model
    │   ├── network.ts            # Road graph: junctions, roads, streetlights
    │   ├── engine.ts             # Central simulation clock
    │   ├── signals.ts            # Traffic signal controller
    │   ├── vehicles.ts           # Vehicle movement & emergency vehicles
    │   ├── stats.ts              # Sensor readings (queues, density, wait)
    │   ├── routing.ts            # Dijkstra route planner
    │   ├── incidents.ts          # Incident detection & lifecycle
    │   ├── weather.ts            # Weather sensors & daylight
    │   ├── lighting.ts           # Smart streetlights & energy
    │   ├── roadHealth.ts         # Predictive maintenance
    │   ├── devices.ts            # IoT devices & messaging
    │   ├── history.ts            # Data snapshots for charts
    │   ├── random.ts             # Seeded random numbers
    │   └── engine.test.ts        # Automated tests
    │
    ├── store/
    │   ├── simStore.ts           # Central state + simulation timer
    │   └── quickActions.ts       # One-click scenario actions
    │
    ├── services/
    │   ├── storage.ts            # Settings persistence
    │   └── report.ts             # CSV / JSON export
    │
    ├── components/               # Reusable UI (layout, map, charts, cards)
    ├── pages/                    # The 10 application pages
    └── demo/
        └── GuidedDemo.tsx        # Welcome screen + guided demo
```

---

## 🏗️ System Architecture

The application has three separate layers:

```
┌──────────────────────────────────────────────┐
│  PRESENTATION LAYER                          │
│  Pages, map, charts, controls (React)        │
├──────────────────────────────────────────────┤
│  STATE LAYER                                 │
│  Central store + simulation clock (Zustand)  │
├──────────────────────────────────────────────┤
│  SIMULATION ENGINE                           │
│  City model, sensors, rules (TypeScript)     │
└──────────────────────────────────────────────┘
```

**Simulation loop:** a single timer runs every 100 ms. Each tick advances the simulated world by `0.1 s × speed`, in this order:

1. Weather sensors update
2. Traffic signals count down and change phase
3. Vehicles move
4. Sensors recalculate their readings
5. Streetlights adjust
6. **Every simulated second:** pedestrians, road wear, incident detection and device messages
7. **Every 5 simulated seconds:** a snapshot is saved for the charts

The random numbers are **seeded**, so the same scenario always behaves the same way, which keeps results repeatable.

---

## 📐 Simulation Rules

### Traffic signals
```
N–S Green → N–S Yellow (3 s) → All Red (1.5 s) → E–W Green → E–W Yellow (3 s) → All Red (1.5 s) → repeat
```
- **Adaptive green time** = `min green + 2.5 s × (queued vehicles + ½ × approaching vehicles)`, limited to 10–45 s
- **Fixed mode** = 20 s green
- **Sensor offline** → the junction falls back to fixed timing automatically

### Emergency priority
- The priority request is sent **230 m** before a junction
- The requested direction gets green after a **2 s safety minimum** for the conflicting direction
- Normal operation resumes once the vehicle has passed

### Route planning
- Dijkstra's algorithm with edge cost = `road length × (1 + 1.5 × traffic density)`
- Blocked roads are excluded

### Incident detection

| Incident | Trigger |
|---|---|
| Heavy congestion | Road density ≥ 70% for 15 seconds |
| Waterlogging | Waterlogging risk ≥ 70% |
| Low visibility | Visibility < 200 m |
| Severe weather | Rainfall ≥ 30 mm/h |
| Road damage | Pothole risk ≥ 85% |

Only one incident can be open per type and location, and a resolved incident cannot reappear for 60 seconds.

### Road health
```
Health = 0.6 × Surface + 0.25 × (100 − Pothole Risk) + 0.15 × (100 − Waterlogging Risk)
```
Maintenance tasks are created when pothole risk ≥ 65%, health < 60, waterlogging risk ≥ 70% or vibration ≥ 4.5 mm/s.

> This is a **rule-based predictive maintenance simulation**, not a trained machine-learning model.

### Streetlights

| Mode | Daylight | Night | Motion detected |
|---|---|---|---|
| Automatic | Off | 30–80% (by darkness) | 100% |
| Energy-saving | Off | 20% | 100% |
| Manual | Operator controlled | Operator controlled | — |
| Fail-safe | Off | 100% | 100% |

Energy is estimated as LED rated power (90 W) × brightness, compared with a 150 W conventional lamp.

All thresholds can be changed on the **Settings** page.

---

## 🖥️ Pages Overview

| Page | Purpose |
|---|---|
| **Overview** | KPI cards, map preview, live charts, recent events, network health, weather |
| **Live Road Network** | Full interactive map with layers, zoom and inspector |
| **Traffic Management** | Adaptive signal control, junction cards, manual mode, timing log |
| **Incidents & Alerts** | Create, filter, acknowledge and resolve incidents; searchable event log |
| **Emergency Response** | Dispatch vehicles, route preview, priority status, tracking |
| **Road Health** | Road conditions, risk model, maintenance queue, health trends |
| **Smart Streetlights** | Lighting modes, time-of-day control, per-light status, energy chart |
| **Analytics & Reports** | All charts, time filters, CSV/JSON export |
| **Device Simulator** | Data-flow diagram, device registry, gateways, live messages |
| **Settings** | Speed, thresholds, signal limits, lighting rules, theme, reset options |

---

## 🎬 Demo Guide

A complete demonstration takes about **5 minutes**:

1. Open the app and click **Start guided demo** on the welcome screen
2. **Sensors report:** vehicle counts and queues update every 2 seconds
3. **Trigger congestion:** a traffic surge is sent into Junction B
4. **Adaptive signals:** Junction B's green time increases (see "Recent timing changes")
5. **Simulate an accident:** Lake Road is closed and a detour is recommended
6. **Handle the incident:** acknowledge it, then resolve it
7. **Dispatch an ambulance:** every junction on its route turns green
8. **Heavy rain:** waterlogging risk rises on poorly drained roads
9. **Road damage:** a maintenance task is created; complete it to repair the road
10. **Streetlights:** switch to night and watch the lights respond to motion
11. **Analytics:** review the charts and download the report

Also worth showing: **Sensor failure** (fixed-timing fallback), **gateway outage** (message buffering) and the **light/dark mode** switch.

---

## 🧪 Testing

Run the automated tests with:
```bash
npm test
```

The tests check that:
- ✅ Conflicting directions are never green at the same time
- ✅ Busier approaches get longer green times, within limits
- ✅ Fixed timing is used when adaptive control is off
- ✅ Junctions fall back to fixed timing when a sensor fails
- ✅ Incidents are created, de-duplicated, acknowledged and resolved correctly
- ✅ Alerts are not repeated for the same ongoing condition
- ✅ The route planner finds valid connected routes
- ✅ Blocked roads are avoided
- ✅ Emergency vehicles reach their destination with signal priority

---

## ⚠️ Limitations

- All sensor data, communication and outcomes are simulated
- Traffic behaviour is simplified (no lane changes or turn-specific signal phases)
- Energy figures are estimates, not measured consumption
- Predictive maintenance uses fixed rules, not machine learning
- Simulation history is stored only in the open browser tab

---

## 🔭 Future Scope

- Connect real sensors (ESP32 or Raspberry Pi, ultrasonic or IR vehicle counters, rain gauges)
- Use a real MQTT broker (for example Mosquitto or HiveMQ) for device communication
- Add a backend (FastAPI or Node.js) with a database for long-term data storage
- Train a machine-learning model for traffic prediction and predictive maintenance
- Use real maps (OpenStreetMap) and live traffic data
- Add a mobile app for citizens and field crews

---

## 📄 License

This project was developed for academic purposes as a college IoT microproject.
