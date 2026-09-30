# FleetMind Edge

**Edge-AI Based Distributed Fleet Coordination for Autonomous Mobile Robots (AMRs) in Smart Warehouses**

**Smart India Hackathon 2025**

| | |
| --- | --- |
| Problem Statement ID | 26123 |
| Theme | Smart Automation |
| Category | Software |
| Team | Loose Screws |
| Team ID | 179256 |

🎥 **[Watch the demo video](https://youtu.be/Q7ecotJYg1Q)**

---

## The Problem

Most AMR fleets in warehouses depend on a single central server for task allocation. That creates serious weaknesses:

- **Single point of failure:** one server outage halts every robot at once.
- **Costly downtime:** stalled fleets mean delayed shipments and lost throughput.
- **No graceful degradation:** existing systems have no fallback coordination mode.

## Our Solution

FleetMind Edge lets the fleet keep working when the central server goes down.

- **Peer-to-peer edge coordination:** robots talk directly to each other, so there is no single choke point.
- **Intelligent failover:** the fleet continues operating the moment the central server drops.
- **AI congestion prediction:** predicted bottlenecks add a penalty to route costs, so robots reroute around them automatically.
- **Live warehouse digital twin:** real-time monitoring and collision prevention in one dashboard.

## Key Features

| Feature | Description |
| --- | --- |
| Real-time AMR monitoring | Live positions, states (Moving / Waiting / Idle / Offline), battery and current task for each robot |
| AI congestion prediction | Congestion index and heatmap showing hot zones; a trained model produces route penalties |
| Collision prevention | Proximity detection with priority-based yielding when robot paths conflict |
| Distributed edge coordination | One-click "Disconnect Central Server" demo that switches the fleet to a peer-to-peer mode |
| Fleet health monitoring | Per-robot health score based on battery and duty state, with an estimated service window |
| Business impact analytics | KPIs for tasks completed, conflicts resolved, active robots and throughput |
| Live event log and notifications | Streaming log with severity levels, a notification dropdown and an audio chime for critical events |

## Demo Controls

The dashboard's bottom action bar lets you trigger scenarios live:

- **Add Task:** queues a priority task and assigns it to an available robot.
- **Simulate Congestion:** forces two robots close together to trigger the congestion and collision-avoidance pipeline.
- **Disconnect / Reconnect Robot:** takes AMR-03 offline (lost heartbeat) so peers reroute, then brings it back.
- **Disconnect Central Server:** the main feature. The system shows the offline banner, activates the distributed coordination layer, establishes the peer-to-peer mesh, and confirms that the mission continues.

## System Architecture

```text
User / Fleet Manager
  |
  v
Frontend (Vercel Dashboard)
  |
  v
Edge-AI Module
  |
  +---------------------> Warehouse Traffic Dataset
  |
  v
Machine Learning Model
  |
  v
Prediction / Route Penalty
  |
  v
Frontend (Dashboard Updates AMR Routes)
```

| Component | Responsibility |
| --- | --- |
| **Frontend** | User interaction, live fleet monitoring, display of congested routes across the warehouse floor |
| **Backend / Edge module** | Processes real-time AMR data, calculates route penalties, coordinates logic to avoid collisions (including offline distributed coordination) |
| **ML model** | Takes synthetic warehouse traffic data and predicts future bottlenecks |
| **Storage** | `warehouse_traffic_data_v2.csv` (synthetic training data) and `congestion_model.pkl` (trained model) |

See [`architecture.md`](./architecture.md) for details.

### Target Architecture (from our SIH proposal)

The full design uses a FastAPI backend with a WebSocket and REST gateway, a simulation orchestrator (tick loop), per-robot agents with an A\* planner, a P2P message bus, a conflict detection and resolution engine, an AI congestion prediction service that feeds A\* edge weights, and a SQLite/Postgres persistence layer. Production deployment is planned on ROS 2 + DDS with ORCA / NH-ORCA for local avoidance, and quantized ONNX / TensorRT models on edge hardware such as the Jetson Nano.

## Tech Stack

**Frontend**
- React + TypeScript (Vite-style entry: `main.tsx` mounts `App.tsx`)
- Tailwind CSS
- Framer Motion (animations)
- Lucide React (icons)
- Deployed on Vercel

**AI / ML**
- Python machine learning model for congestion prediction (`congestion_model.pkl`)
- Synthetic warehouse traffic dataset (`warehouse_traffic_data_v2.csv`)

**Planned for production**
- ROS 2 + DDS, ORCA / NH-ORCA, FastAPI, ONNX / TensorRT

## How the Dashboard Simulation Works

The dashboard runs a 1-second simulation tick that:

1. Moves each robot along a fixed route. AMR-01 and AMR-02 shuttle between pickup and dock points, and AMR-03 patrols a loop of six checkpoints.
2. Runs a pairwise distance check between robots. Robots within the congestion distance raise a warning, and robots within the collision distance trigger priority-based yielding (AMR-01 highest, then AMR-02, then AMR-03), where the lower-priority robot pauses for a few ticks.
3. Derives a live **congestion index** from the current pair states and updates the heatmap.
4. Streams events (task assigned, task completed, congestion detected, collision prevented, route updated) to the event log.

> **Note:** The web dashboard is a front-end demonstration of the coordination concept. Robot movement and the congestion heatmap in the UI are simulated in the browser, and the trained model and dataset back the prediction component described above.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- (Optional) Python 3.9+ to work with the ML model

### Run the dashboard locally

```bash
# 1. Clone the repository
git clone https://github.com/Shruti3622/FleetMind-Edge.git
cd FleetMind-Edge

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Open the local URL printed in the terminal (for Vite this is usually `http://localhost:5173`).

### Build for production

```bash
npm run build
npm run preview
```

> If your frontend lives in a sub-folder (for example `frontend/`), `cd` into it before running `npm install`.

## Feasibility and Targets

| Target | Goal |
| --- | --- |
| Recovery time after server loss | Under 5 seconds |
| Task completion rate | Above 95% |
| Collisions | 0 |
| Fleet size supported | 20+ AMRs with priority-based planning |

| Challenge | Mitigation |
| --- | --- |
| Deadlocks in traffic | Wait-for graph check with priority escalation (under 500 ms) |
| Network / Wi-Fi loss | Local ORCA avoidance, zero server dependency |
| Limited edge compute | Quantized ONNX / TensorRT models (under 10 ms) |
| Sim-to-real gap | Deterministic safety core; AI only tunes efficiency |

## Impact

- Reduced operational downtime
- Improved warehouse throughput
- Enhanced safety and collision prevention
- Lower maintenance costs
- Edge-grade intelligence with 100% on-premise processing and no cloud dependency

## References

- [Global path planning](https://www.sciencedirect.com/science/article/pii/S0004370214001386)
- [ORCA: local collision avoidance](https://gamma.cs.unc.edu/ORCA/)
- [ROS 2 documentation (P2P robot communication)](https://docs.ros.org/en/rolling/)
- [NVIDIA Jetson Nano (edge-AI hardware)](https://developer.nvidia.com/embedded/jetson-nano)
- [Deadlock detection in distributed systems](https://doi.org/10.1145/357360.357365)
- [Distributed task allocation](https://doi.org/10.1109/TC.1980.1675516)
- [Edge-AI congestion / traffic prediction](https://arxiv.org/abs/2101.11174)
- [Why this problem is real (Nav2 issue)](https://github.com/ros-navigation/navigation2/issues/4685)

## Team

**Team Loose Screws** · Smart India Hackathon 2025 · Team ID 179256

| Name | Role | Stream |
| --- | --- | --- |
| Shruti Bhuwania | Team Leader | B.Tech ME |
| Dev Rohilla | Team Member | B.Tech EE |
| Tithi Tekriwal | Team Member | B.Tech ME |
| Shweta Rohilla | Team Member | B.Tech ME |
| Anshu Kumari | Team Member | B.Tech ME |
| Kashvi Jain | Team Member | B.Tech ME |

Second-year undergraduates, NSUT.

## License

<!-- Add your license here (e.g., MIT) -->
