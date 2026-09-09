import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Boxes,
  CheckCircle2,
  ShieldCheck,
  Gauge,
  Plus,
  AlertTriangle,
  PowerOff,
  Unplug,
  PackagePlus,
  PackageCheck,
  Battery,
  ServerCrash,
  Bell,
  Lock,
  HeartPulse,
} from "lucide-react";

/* -------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------- */

type RobotState = "MOVING" | "WAITING" | "IDLE" | "OFFLINE";
type Severity = "info" | "warning" | "critical" | "success";
type PointKind = "pickup" | "dock" | "checkpoint";

interface RoutePoint {
  x: number;
  y: number;
  label: string;
  kind: PointKind;
}

interface RobotData {
  id: string;
  name: string;
  color: string;
  state: RobotState;
  battery: number;
  x: number; // current rendered position (percentage within the map)
  y: number;
  path: RoutePoint[]; // fixed route this robot cycles through
  segment: number; // index of the waypoint it is currently departing from
  progress: number; // 0..1 progress toward path[(segment + 1) % path.length]
}

interface EventItem {
  id: number;
  time: string;
  message: string;
  severity: Severity;
}

interface CollisionAlert {
  robot: string;
  yieldTo: string;
}

/* -------------------------------------------------------------------------
 * Static warehouse layout — shared between the map markers and the
 * robots' actual fixed routes, so what's drawn is what's simulated.
 * ---------------------------------------------------------------------- */

const PICKUP_A: RoutePoint = { x: 8, y: 18, label: "Pickup A", kind: "pickup" };
const PICKUP_B: RoutePoint = { x: 8, y: 82, label: "Pickup B", kind: "pickup" };
const DOCK_1: RoutePoint = { x: 92, y: 18, label: "Dock 1", kind: "dock" };
const DOCK_2: RoutePoint = { x: 92, y: 50, label: "Dock 2", kind: "dock" };
const DOCK_3: RoutePoint = { x: 92, y: 82, label: "Dock 3", kind: "dock" };

const PICKUP_POINTS = [PICKUP_A, PICKUP_B];
const DELIVERY_POINTS = [DOCK_1, DOCK_2, DOCK_3];

const SHELF_BLOCKS = [
  { x: 32, y: 14, w: 14, h: 22 },
  { x: 32, y: 62, w: 14, h: 22 },
  { x: 54, y: 14, w: 14, h: 22 },
  { x: 54, y: 62, w: 14, h: 22 },
];

const CONGESTION_ZONE = { x: 44, y: 40, w: 20, h: 18, label: "Zone B" };

// Fixed routes. AMR-01 and AMR-02 each shuttle a single pickup/dock pair;
// AMR-03 patrols a loop around the aisles between the shelf blocks.
const AMR01_PATH: RoutePoint[] = [PICKUP_A, DOCK_1];
const AMR02_PATH: RoutePoint[] = [PICKUP_B, DOCK_2];
const AMR03_PATROL: RoutePoint[] = [
  { x: 20, y: 24, label: "Checkpoint 1", kind: "checkpoint" },
  { x: 46, y: 24, label: "Checkpoint 2", kind: "checkpoint" },
  { x: 76, y: 24, label: "Checkpoint 3", kind: "checkpoint" },
  { x: 76, y: 76, label: "Checkpoint 4", kind: "checkpoint" },
  { x: 46, y: 76, label: "Checkpoint 5", kind: "checkpoint" },
  { x: 20, y: 76, label: "Checkpoint 6", kind: "checkpoint" },
];

const INITIAL_ROBOTS: RobotData[] = [
  { id: "amr-01", name: "AMR-01", color: "#2563EB", state: "MOVING", battery: 86, x: AMR01_PATH[0].x, y: AMR01_PATH[0].y, path: AMR01_PATH, segment: 0, progress: 0 },
  { id: "amr-02", name: "AMR-02", color: "#7C3AED", state: "MOVING", battery: 74, x: AMR02_PATH[0].x, y: AMR02_PATH[0].y, path: AMR02_PATH, segment: 0, progress: 0 },
  { id: "amr-03", name: "AMR-03", color: "#0D9488", state: "MOVING", battery: 93, x: AMR03_PATROL[0].x, y: AMR03_PATROL[0].y, path: AMR03_PATROL, segment: 0, progress: 0.35 },
];

// Fixed dispatch priority used to decide who yields when paths cross.
// Higher number = higher priority = keeps moving.
const PRIORITY: Record<string, number> = { "amr-01": 3, "amr-02": 2, "amr-03": 1 };

const STEP = 0.14; // fraction of a route leg covered per tick
const CONGESTION_DISTANCE = 16; // percentage-space distance that counts as "nearby"
const COLLISION_DISTANCE = 8; // distance that counts as an imminent path conflict
const PAUSE_TICKS = 3; // how many ticks the yielding robot holds position

const STATE_STYLES: Record<RobotState, { label: string; text: string; bg: string; dot: string }> = {
  MOVING: { label: "Moving", text: "text-status-info", bg: "bg-status-info-tint", dot: "bg-status-info" },
  WAITING: { label: "Waiting", text: "text-status-warning", bg: "bg-status-warning-tint", dot: "bg-status-warning" },
  IDLE: { label: "Idle", text: "text-ink-500", bg: "bg-border-subtle", dot: "bg-ink-400" },
  OFFLINE: { label: "Offline", text: "text-status-critical", bg: "bg-status-critical-tint", dot: "bg-status-critical" },
};

const SEVERITY_DOT: Record<Severity, string> = {
  info: "bg-status-info",
  warning: "bg-status-warning",
  critical: "bg-status-critical",
  success: "bg-status-success",
};

/* -------------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-IN", { hour12: false });
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

/** Advances a robot one tick along its fixed path. Assumes the caller has already confirmed it's eligible to move. */
function advanceRobot(robot: RobotData, step: number): RobotData {
  const from = robot.path[robot.segment];
  const to = robot.path[(robot.segment + 1) % robot.path.length];
  const progress = robot.progress + step;

  if (progress >= 1) {
    const segment = (robot.segment + 1) % robot.path.length;
    return { ...robot, state: "MOVING", segment, progress: 0, x: robot.path[segment].x, y: robot.path[segment].y };
  }

  return { ...robot, state: "MOVING", progress, x: lerp(from.x, to.x, progress), y: lerp(from.y, to.y, progress) };
}

/** Human-readable current objective, derived from route state rather than stored separately. */
function describeTask(robot: RobotData): string {
  if (robot.state === "OFFLINE") return "Offline";
  if (robot.state === "WAITING") return "Yielding — collision avoidance";
  const next = robot.path[(robot.segment + 1) % robot.path.length];
  return next.kind === "checkpoint" ? `Patrolling — next ${next.label}` : `Heading to ${next.label}`;
}

/** Composite fleet-health score — a simple, explainable blend of battery and current duty state. */
function computeHealth(robot: RobotData): { score: number; tone: "good" | "fair" | "poor"; note: string } {
  if (robot.state === "OFFLINE") return { score: 0, tone: "poor", note: "Inspection required" };
  const score = clamp(Math.round(robot.battery - (robot.state === "WAITING" ? 4 : 0)), 0, 100);
  const tone = score >= 70 ? "good" : score >= 40 ? "fair" : "poor";
  const hoursToService = Math.max(6, Math.round(score * 3.2));
  return { score, tone, note: `Service in ~${hoursToService} hrs` };
}

// Lazily-created, reused AudioContext — avoids the "too many contexts" browser
// warning and sidesteps autoplay restrictions by only ever starting on the
// back of a real user interaction (a button click already in the call chain).
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioContext) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      sharedAudioContext = new Ctor();
    }
    if (sharedAudioContext.state === "suspended") void sharedAudioContext.resume();
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/** A single soft, two-note enterprise notification chime — never a siren or alarm. */
function playChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.11;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    // Audio isn't available in this environment — never block the UI for it.
  }
}

/** Animates a number from its previous value up to `target` whenever it changes. */
function useCountUp(target: number, duration = 700) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let frame: number;

    const tick = (now: number) => {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    fromRef.current = target;
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}

/* -------------------------------------------------------------------------
 * Presentational sub-components (kept in this file by design)
 * ---------------------------------------------------------------------- */

function KPICard({
  icon: Icon,
  label,
  value,
  suffix,
  accent,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  suffix?: string;
  accent: string;
}) {
  const animated = useCountUp(value);
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
      className="rounded-card border border-border bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <span className="text-caption uppercase text-ink-500">{label}</span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-card"
          style={{ backgroundColor: `${accent}14` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} strokeWidth={2} />
        </div>
      </div>
      <p className="mt-3 tabular-nums text-ink-900" style={{ fontSize: 34, lineHeight: "40px", fontWeight: 600 }}>
        {animated}
        {suffix && <span className="ml-1 text-card-title text-ink-500">{suffix}</span>}
      </p>
    </motion.div>
  );
}

function RobotStatusCard({ robot }: { robot: RobotData }) {
  const style = STATE_STYLES[robot.state];
  const health = computeHealth(robot);
  const healthColor = health.tone === "good" ? "#16A34A" : health.tone === "fair" ? "#D97706" : "#DC2626";

  return (
    <div className="rounded-card border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: robot.color }} />
          <span className="text-body-emphasis text-ink-900">{robot.name}</span>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-micro ${style.bg} ${style.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </div>

      <p className="mt-2.5 text-body text-ink-500">{describeTask(robot)}</p>

      <div className="mt-3 flex items-center gap-2">
        <Battery className="h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={2} />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border-subtle">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${robot.battery}%`,
              backgroundColor: robot.battery > 30 ? "#16A34A" : "#DC2626",
            }}
          />
        </div>
        <span className="w-9 shrink-0 text-right text-micro tabular-nums text-ink-500">{robot.battery}%</span>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2">
        <span className="flex items-center gap-1.5 text-micro text-ink-400">
          <HeartPulse className="h-3.5 w-3.5" strokeWidth={2} style={{ color: healthColor }} />
          Fleet health
        </span>
        <span className="text-micro tabular-nums" style={{ color: healthColor, fontWeight: 600 }}>
          {health.score}
        </span>
      </div>
      <p className="mt-0.5 text-micro text-ink-400">{health.note}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * App
 * ---------------------------------------------------------------------- */

export default function App() {
  const [now, setNow] = useState(new Date());
  const [serverOnline, setServerOnline] = useState(true);
  const [robots, setRobots] = useState<RobotData[]>(INITIAL_ROBOTS);
  const [tasksCompleted, setTasksCompleted] = useState(247);
  const [conflictsResolved, setConflictsResolved] = useState(18);
  const [congestionScore, setCongestionScore] = useState(12);
  const [collisionAlert, setCollisionAlert] = useState<CollisionAlert | null>(null);
  const [forcingCongestion, setForcingCongestion] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [lastSeenEventId, setLastSeenEventId] = useState(2);
  const [events, setEvents] = useState<EventItem[]>([
    { id: 1, time: formatTime(new Date()), message: "AMR-01 completed task — Pickup A → Dock 1", severity: "success" },
    { id: 2, time: formatTime(new Date()), message: "Fleet coordinator online — 3/3 robots connected", severity: "info" },
  ]);

  // Simulation bookkeeping lives in refs, not state — it's mutated every
  // tick inside a plain interval callback (never inside a setState updater),
  // which is what keeps this safe from React 18 Strict Mode's double-invoke
  // checks and avoids stale-closure bugs from setInterval capturing old state.
  const robotsRef = useRef<RobotData[]>(INITIAL_ROBOTS);
  const pauseRef = useRef<Map<string, { ticksLeft: number; yieldTo: string }>>(new Map());
  const pairLevelRef = useRef<Map<string, "clear" | "congested" | "collision">>(new Map());
  const eventIdRef = useRef(3);
  const notifRef = useRef<HTMLDivElement>(null);

  const disconnectedRobotId = "amr-03";
  const robot3Offline = robots.find((r) => r.id === disconnectedRobotId)?.state === "OFFLINE";

  function commitRobots(next: RobotData[]) {
    robotsRef.current = next;
    setRobots(next);
  }

  function logEvents(items: Array<{ message: string; severity: Severity }>) {
    if (items.length === 0) return;
    const withIds: EventItem[] = items.map((item) => ({
      id: eventIdRef.current++,
      time: formatTime(new Date()),
      ...item,
    }));
    setEvents((prev) => [...withIds.slice().reverse(), ...prev].slice(0, 8));
    if (items.some((item) => item.severity === "critical")) playChime();
  }

  /* Clock */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* Close the notification dropdown on outside click */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ------------------------------------------------------------------
   * Core simulation tick — runs once per second. Handles movement,
   * proximity-based congestion detection, priority-based collision
   * avoidance, and the organic task-completion event stream.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const id = setInterval(() => {
      const current = robotsRef.current;
      const newEvents: Array<{ message: string; severity: Severity }> = [];
      let tasksThisTick = 0;
      let conflictsThisTick = 0;

      // 1) Resolve active pauses, then move everything else along its route.
      const stepped = current.map((robot) => {
        if (robot.state === "OFFLINE") return robot;

        const pause = pauseRef.current.get(robot.id);
        if (pause && pause.ticksLeft > 0) {
          const ticksLeft = pause.ticksLeft - 1;
          if (ticksLeft === 0) {
            pauseRef.current.delete(robot.id);
            newEvents.push({ message: `Route updated — ${robot.name} resumed after yielding`, severity: "info" });
            return { ...robot, state: "MOVING" as RobotState };
          }
          pauseRef.current.set(robot.id, { ...pause, ticksLeft });
          return { ...robot, state: "WAITING" as RobotState };
        }

        const moved = advanceRobot(robot, STEP);
        if (moved.segment !== robot.segment) {
          const arrived = moved.path[moved.segment];
          if (arrived.kind === "dock") {
            tasksThisTick += 1;
            newEvents.push({ message: `Task completed — ${robot.name} delivered to ${arrived.label}`, severity: "success" });
          } else if (arrived.kind === "pickup") {
            newEvents.push({ message: `Task assigned — ${robot.name} picked up load at ${arrived.label}`, severity: "info" });
          } else if (arrived.kind === "checkpoint" && moved.segment === 0) {
            newEvents.push({ message: `Route updated — ${robot.name} completed patrol loop`, severity: "info" });
          }
        }
        return moved;
      });

      // 2) Pairwise proximity check — this is the actual AI congestion /
      //    collision detection, driven by real distances, not a script.
      for (let i = 0; i < stepped.length; i++) {
        for (let j = i + 1; j < stepped.length; j++) {
          const a = stepped[i];
          const b = stepped[j];
          if (a.state === "OFFLINE" || b.state === "OFFLINE") continue;

          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          const key = pairKey(a.id, b.id);
          const prevLevel = pairLevelRef.current.get(key) ?? "clear";
          const level: "clear" | "congested" | "collision" =
            distance < COLLISION_DISTANCE ? "collision" : distance < CONGESTION_DISTANCE ? "congested" : "clear";

          if (level !== prevLevel) {
            if (level === "congested" && prevLevel === "clear") {
              newEvents.push({ message: `Congestion detected — ${a.name} and ${b.name} converging`, severity: "warning" });
            }
            if (level === "collision" && !pauseRef.current.has(PRIORITY[a.id] < PRIORITY[b.id] ? a.id : b.id)) {
              const lower = PRIORITY[a.id] < PRIORITY[b.id] ? a : b;
              const higher = lower.id === a.id ? b : a;
              pauseRef.current.set(lower.id, { ticksLeft: PAUSE_TICKS, yieldTo: higher.name });
              conflictsThisTick += 1;
              newEvents.push({ message: `Collision prevented — ${lower.name} yielded to ${higher.name}`, severity: "critical" });
            }
            if (level === "clear" && prevLevel !== "clear") {
              newEvents.push({ message: `Congestion cleared between ${a.name} and ${b.name}`, severity: "success" });
            }
          }

          pairLevelRef.current.set(key, level);
        }
      }

      // 3) Reflect any pause just triggered this tick immediately (no 1-tick lag).
      const final = stepped.map((robot) => {
        const pause = pauseRef.current.get(robot.id);
        if (robot.state !== "OFFLINE" && pause && pause.ticksLeft > 0) {
          return { ...robot, state: "WAITING" as RobotState };
        }
        return robot;
      });

      // 4) Derive the live congestion index from current pair states.
      let scoreTarget = 0;
      pairLevelRef.current.forEach((level) => {
        if (level === "collision") scoreTarget += 45;
        else if (level === "congested") scoreTarget += 22;
      });
      scoreTarget = clamp(scoreTarget, 0, 100);

      // 5) Surface the most urgent active pause as the on-map alert.
      let alert: CollisionAlert | null = null;
      pauseRef.current.forEach((info, robotId) => {
        if (info.ticksLeft > 0) {
          const name = final.find((r) => r.id === robotId)?.name ?? robotId;
          alert = { robot: name, yieldTo: info.yieldTo };
        }
      });

      commitRobots(final);
      setCollisionAlert(alert);
      setCongestionScore((prev) => Math.round(prev + (scoreTarget - prev) * 0.35));
      if (tasksThisTick > 0) setTasksCompleted((t) => t + tasksThisTick);
      if (conflictsThisTick > 0) setConflictsResolved((c) => c + conflictsThisTick);
      logEvents(newEvents);
    }, 1000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAddTask() {
    const target = robotsRef.current.find((r) => r.state !== "OFFLINE") ?? robotsRef.current[0];
    logEvents([{ message: `New priority task queued — assigned to ${target.name}`, severity: "info" }]);
    window.setTimeout(() => {
      setTasksCompleted((t) => t + 1);
      logEvents([{ message: `${target.name} completed priority task`, severity: "success" }]);
    }, 1400);
  }

  /** Forces a real proximity event for demo reliability — the same detection pipeline handles it from there. */
  function handleForceCongestion() {
    if (forcingCongestion) return;
    setForcingCongestion(true);

    const amr01 = robotsRef.current.find((r) => r.id === "amr-01");
    if (amr01) {
      const next = robotsRef.current.map((r) =>
        r.id === "amr-02" ? { ...r, x: clamp(amr01.x + 4, 4, 96), y: clamp(amr01.y + 4, 4, 96) } : r
      );
      commitRobots(next);
    }

    window.setTimeout(() => setForcingCongestion(false), 4000);
  }

  function handleToggleServer() {
    setServerOnline((online) => {
      const goingOffline = online;

      if (goingOffline) {
        logEvents([{ message: "Central server disconnected", severity: "critical" }]);
        window.setTimeout(() => logEvents([{ message: "Activating distributed coordination layer", severity: "warning" }]), 300);
        window.setTimeout(() => logEvents([{ message: "Peer-to-peer mesh established", severity: "info" }]), 1000);
        window.setTimeout(() => logEvents([{ message: "Fleet operating normally", severity: "success" }]), 2000);
        window.setTimeout(() => logEvents([{ message: "Congestion prediction active", severity: "info" }]), 4000);
        window.setTimeout(() => logEvents([{ message: "Mission continuity confirmed", severity: "success" }]), 5000);
      } else {
        logEvents([{ message: "Central server reconnected — fleet resynchronized", severity: "success" }]);
      }

      return !online;
    });
  }

  function handleToggleRobot() {
    const goingOffline = robotsRef.current.find((r) => r.id === disconnectedRobotId)?.state !== "OFFLINE";
    pauseRef.current.delete(disconnectedRobotId);

    const next = robotsRef.current.map((r) =>
      r.id === disconnectedRobotId ? { ...r, state: (goingOffline ? "OFFLINE" : "MOVING") as RobotState } : r
    );
    commitRobots(next);

    logEvents([
      goingOffline
        ? { message: "AMR-03 lost heartbeat — marked offline, peers rerouting", severity: "critical" }
        : { message: "AMR-03 heartbeat restored — rejoining fleet", severity: "success" },
    ]);
  }

  const activeRobots = robots.filter((r) => r.state !== "OFFLINE").length;
  const throughput = Math.round(tasksCompleted * 0.42);
  const zoneHot = congestionScore > 40;

  const containerStagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
  };

  return (
    <div className="min-h-screen bg-white text-ink-900">
      {/* ---------------------------------------------------------------- */}
      {/* Top Header                                                      */}
      {/* ---------------------------------------------------------------- */}
      <header className="sticky top-0 z-20 border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-brand">
              <span className="text-[15px] font-semibold text-white">F</span>
            </div>
            <div className="leading-tight">
              <p className="text-card-title text-ink-900">FleetMind Edge</p>
              <p className="text-micro text-ink-400">Prepared for Bharat Electronics Limited — Smart Warehouse Division</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              title="100% on-premise processing — no cloud dependency, no external network required"
              className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-micro font-semibold text-ink-500"
            >
              <Lock className="h-3.5 w-3.5" strokeWidth={2} />
              Edge AI · On-Premise
            </span>

            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  setLastSeenEventId(events[0]?.id ?? lastSeenEventId);
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink-500 transition-colors hover:bg-border-subtle hover:text-ink-900"
                aria-label="Notifications"
              >
                <Bell className="h-[18px] w-[18px]" strokeWidth={1.9} />
                {events.filter((e) => e.id > lastSeenEventId).length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-status-critical px-1 text-[10px] font-semibold text-white">
                    {events.filter((e) => e.id > lastSeenEventId).length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-11 z-30 w-80 rounded-card border border-border bg-white p-2 shadow-elevated"
                  >
                    <p className="px-2 py-1.5 text-caption uppercase text-ink-400">Notifications</p>
                    <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
                      {events.slice(0, 6).map((e) => (
                        <div key={e.id} className="flex items-start gap-2.5 rounded-card px-2 py-2 hover:bg-border-subtle">
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[e.severity]}`} />
                          <div className="min-w-0">
                            <p className="truncate text-body text-ink-900">{e.message}</p>
                            <p className="text-micro tabular-nums text-ink-400">{e.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="h-6 w-px bg-border" />

            <span
              className={`flex h-9 items-center gap-2 rounded-full border px-3 text-body-emphasis ${
                serverOnline
                  ? "border-status-success/20 bg-status-success-tint text-status-success"
                  : "border-status-critical/20 bg-status-critical-tint text-status-critical"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${serverOnline ? "bg-status-success" : "bg-status-critical"} animate-pulse-glow`} />
              {serverOnline ? "System Online" : "System Offline"}
            </span>
            <span className="text-body-emphasis tabular-nums text-ink-500">{formatTime(now)}</span>
          </div>
        </div>

        {/* Emergency banner — the centerpiece moment of the demo */}
        <AnimatePresence>
          {!serverOnline && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-status-critical/30 bg-status-critical-tint"
            >
              <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-6 py-3">
                <ServerCrash className="h-5 w-5 shrink-0 text-status-critical" strokeWidth={2} />
                <div>
                  <p className="text-body-emphasis tracking-wide text-status-critical" style={{ fontWeight: 700 }}>
                    CENTRAL SERVER OFFLINE
                  </p>
                  <p className="text-body text-status-critical/90">
                    Switching to Distributed Edge Coordination — robots continue operating peer-to-peer.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <motion.main
        initial="hidden"
        animate="show"
        variants={containerStagger}
        className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-6"
      >
        {/* -------------------------------------------------------------- */}
        {/* Row 1 — Hero KPIs                                             */}
        {/* -------------------------------------------------------------- */}
        <div className="grid grid-cols-4 gap-6">
          <KPICard icon={Boxes} label="Active Robots" value={activeRobots} suffix="/ 3" accent="#2563EB" />
          <KPICard icon={CheckCircle2} label="Tasks Completed" value={tasksCompleted} accent="#16A34A" />
          <KPICard icon={ShieldCheck} label="Collisions Prevented" value={conflictsResolved} accent="#7C3AED" />
          <KPICard icon={Gauge} label="Throughput" value={throughput} suffix="/ hr" accent="#D97706" />
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Business Impact — translates operational data into ROI terms  */}
        {/* -------------------------------------------------------------- */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
          className="rounded-card border border-border bg-brand-light p-5"
        >
          <h2 className="mb-4 text-card-title text-ink-900">Business Impact</h2>
          <div className="grid grid-cols-4 divide-x divide-border">
            <div className="pr-6">
              <p className="text-caption uppercase text-ink-500">Est. Monthly Savings</p>
              <p className="mt-1.5 text-card-title text-ink-900" style={{ fontSize: 22 }}>₹4.2L</p>
              <p className="mt-0.5 text-micro text-ink-400">vs. manual fleet operations</p>
            </div>
            <div className="px-6">
              <p className="text-caption uppercase text-ink-500">Labor Hours Reclaimed</p>
              <p className="mt-1.5 text-card-title text-ink-900" style={{ fontSize: 22 }}>640 <span className="text-body text-ink-500">hrs/mo</span></p>
              <p className="mt-0.5 text-micro text-ink-400">redeployed to higher-value work</p>
            </div>
            <div className="px-6">
              <p className="text-caption uppercase text-ink-500">Incidents Prevented</p>
              <p className="mt-1.5 text-card-title text-ink-900" style={{ fontSize: 22 }}>{conflictsResolved}</p>
              <p className="mt-0.5 text-micro text-ink-400">this session, live</p>
            </div>
            <div className="pl-6">
              <p className="text-caption uppercase text-ink-500">Projected ROI Payback</p>
              <p className="mt-1.5 text-card-title text-ink-900" style={{ fontSize: 22 }}>14 <span className="text-body text-ink-500">months</span></p>
              <p className="mt-0.5 text-micro text-ink-400">3-robot deployment, single shift</p>
            </div>
          </div>
        </motion.div>

        {/* -------------------------------------------------------------- */}
        {/* Row 2 — Digital Twin (hero) + Fleet Status                    */}
        {/* -------------------------------------------------------------- */}
        <div className="grid grid-cols-4 gap-6">
          <motion.div
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            className="col-span-3 rounded-card border border-border p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-card-title text-ink-900">Warehouse Digital Twin</h2>
              <span className="text-caption uppercase text-ink-400">Mumbai DC-4 · Live</span>
            </div>

            <div
              className="relative h-[500px] w-full overflow-hidden rounded-card border border-border-subtle"
              style={{
                backgroundColor: "#FAFAFB",
                backgroundImage:
                  "linear-gradient(#F1F2F4 1px, transparent 1px), linear-gradient(90deg, #F1F2F4 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            >
              {/* Live alert — collision risk takes priority over a plain congestion warning */}
              <AnimatePresence>
                {collisionAlert && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-status-critical/30 bg-status-critical-tint px-3 py-1.5 text-micro font-semibold text-status-critical"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Collision risk — {collisionAlert.robot} yielding to {collisionAlert.yieldTo}
                  </motion.div>
                )}
                {!collisionAlert && congestionScore > 25 && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-status-warning/30 bg-status-warning-tint px-3 py-1.5 text-micro font-semibold text-status-warning"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Congestion warning — rerouting in progress
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Shelf blocks */}
              {SHELF_BLOCKS.map((s, i) => (
                <div
                  key={i}
                  className="absolute rounded-[4px] border border-border bg-white"
                  style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }}
                />
              ))}

              {/* Congestion zone overlay — intensity driven by the live congestion index */}
              <AnimatePresence>
                {zoneHot && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute flex items-center justify-center rounded-[6px]"
                    style={{
                      left: `${CONGESTION_ZONE.x}%`,
                      top: `${CONGESTION_ZONE.y}%`,
                      width: `${CONGESTION_ZONE.w}%`,
                      height: `${CONGESTION_ZONE.h}%`,
                      backgroundColor: "rgba(220,38,38,0.10)",
                      border: "1px solid rgba(220,38,38,0.35)",
                    }}
                  >
                    <motion.span
                      animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      className="h-3 w-3 rounded-full bg-status-critical"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pickup points */}
              {PICKUP_POINTS.map((p) => (
                <div
                  key={p.label}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-card border border-border bg-white">
                    <PackagePlus className="h-3.5 w-3.5 text-ink-500" strokeWidth={2} />
                  </div>
                  <span className="whitespace-nowrap text-micro text-ink-500">{p.label}</span>
                </div>
              ))}

              {/* Delivery points */}
              {DELIVERY_POINTS.map((p) => (
                <div
                  key={p.label}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-card border border-border bg-white">
                    <PackageCheck className="h-3.5 w-3.5 text-ink-500" strokeWidth={2} />
                  </div>
                  <span className="whitespace-nowrap text-micro text-ink-500">{p.label}</span>
                </div>
              ))}

              {/* Robots — repositioned every second by the simulation tick, smoothly tweened between updates */}
              {robots.map((r) => (
                <motion.div
                  key={r.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  animate={{ left: `${r.x}%`, top: `${r.y}%`, opacity: r.state === "OFFLINE" ? 0.35 : 1 }}
                  transition={{ duration: 0.95, ease: "linear" }}
                >
                  <div className="relative flex flex-col items-center gap-1">
                    <div
                      className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow-elevated"
                      style={{ backgroundColor: r.color }}
                    >
                      {r.state === "MOVING" && (
                        <motion.span
                          className="absolute h-6 w-6 rounded-full"
                          style={{ backgroundColor: r.color, opacity: 0.35 }}
                          animate={{ scale: [1, 1.8], opacity: [0.35, 0] }}
                          transition={{ duration: 1.2, repeat: Infinity }}
                        />
                      )}
                    </div>
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-micro text-ink-500 shadow-sm">
                      {r.name}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Fleet Status Panel */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            className="col-span-1 h-full rounded-card border border-border p-5"
          >
            <h2 className="mb-4 text-card-title text-ink-900">Fleet Status</h2>
            <div className="flex flex-col gap-3">
              {robots.map((r) => (
                <RobotStatusCard key={r.id} robot={r} />
              ))}
            </div>
          </motion.div>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Row 3 — Congestion Prediction + Recent Events                 */}
        {/* -------------------------------------------------------------- */}
        <div className="grid grid-cols-2 gap-6">
          {/* AI Congestion Prediction */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            className="rounded-card border border-border p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-card-title text-ink-900">AI Congestion Prediction</h2>
              <span className="text-caption uppercase text-ink-400">Index {congestionScore}%</span>
            </div>

            <div className="grid grid-cols-8 gap-1.5">
              {Array.from({ length: 32 }).map((_, i) => {
                const isHotZone = [12, 13, 20, 21].includes(i);
                const level = congestionScore > 70 ? 3 : congestionScore > 40 ? 2 : congestionScore > 15 ? 1 : 0;
                const intensity = isHotZone ? level : i % 7 === 0 ? Math.min(1, level) : 0;
                const colors = ["#F3F4F6", "#FDE68A", "#F59E0B", "#DC2626"];
                return (
                  <motion.div
                    key={i}
                    animate={{ backgroundColor: colors[intensity] }}
                    transition={{ duration: 0.5 }}
                    className="aspect-square rounded-[3px]"
                  />
                );
              })}
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-card bg-border-subtle p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" strokeWidth={2} />
              <p className="text-body text-ink-500">
                {zoneHot
                  ? `${CONGESTION_ZONE.label} is at elevated occupancy right now — the planner is routing around it.`
                  : `${CONGESTION_ZONE.label} typically sees rising traffic around this time of day. Model: occupancy-frequency heuristic v1.`}
              </p>
            </div>
          </motion.div>

          {/* Recent Events — single-line live log, newest first */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            className="rounded-card border border-border p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-card-title text-ink-900">Event Log</h2>
              <span className="flex items-center gap-1.5 text-caption uppercase text-ink-400">
                <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
                Live
              </span>
            </div>
            <div className="flex max-h-[220px] flex-col gap-2 overflow-y-auto pr-1 font-mono">
              <AnimatePresence initial={false}>
                {events.map((e) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-baseline gap-2 text-body"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[e.severity]}`} />
                    <span className="shrink-0 tabular-nums text-ink-400">{e.time}</span>
                    <span className="text-ink-900">{e.message}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Bottom Action Bar                                              */}
        {/* -------------------------------------------------------------- */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
          className="flex flex-wrap items-center gap-3 rounded-card border border-border p-4"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleAddTask}
            className="flex items-center gap-2 rounded-card bg-brand px-4 py-2.5 text-body-emphasis text-white"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add Task
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleForceCongestion}
            disabled={forcingCongestion}
            className="flex items-center gap-2 rounded-card border border-status-warning/30 px-4 py-2.5 text-body-emphasis text-status-warning disabled:opacity-50"
          >
            <AlertTriangle className="h-4 w-4" strokeWidth={2} />
            {forcingCongestion ? "Congestion Active…" : "Simulate Congestion"}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleToggleRobot}
            className="flex items-center gap-2 rounded-card border border-border px-4 py-2.5 text-body-emphasis text-ink-900 transition-colors hover:bg-border-subtle"
          >
            <Unplug className="h-4 w-4 text-ink-500" strokeWidth={2} />
            {robot3Offline ? "Reconnect Robot" : "Disconnect Robot"}
          </motion.button>

          {/* The killer feature — deliberately the largest, boldest control on the bar */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleToggleServer}
            className="ml-auto flex items-center gap-2.5 rounded-card px-6 py-3.5 text-body-emphasis text-white shadow-elevated"
            style={{ backgroundColor: serverOnline ? "#DC2626" : "#16A34A", fontSize: 15, fontWeight: 600 }}
          >
            <PowerOff className="h-5 w-5" strokeWidth={2.2} />
            {serverOnline ? "Disconnect Central Server" : "Reconnect Central Server"}
          </motion.button>
        </motion.div>
      </motion.main>
    </div>
  );
}
