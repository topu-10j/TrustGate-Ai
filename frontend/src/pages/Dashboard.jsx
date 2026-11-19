import { useEffect, useMemo, useState } from "react";
import { Activity, ShieldCheck, ShieldAlert, Ban, RadioTower } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import SectionTitle from "../components/SectionTitle";
import StatusPill from "../components/StatusPill";
import { getBackendEvents, getStats } from "../services/api";

function metric(stats, ...keys) {
  const value = keys.map((key) => stats?.[key]).find((item) => item !== undefined && item !== null);
  return value === undefined ? "—" : value;
}

function eventDate(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [eventsError, setEventsError] = useState("");

  useEffect(() => {
    let active = true;
    getStats().then((data) => {
      if (active) setStats(data);
    }).catch((error) => {
      if (active) setStatsError(error.message);
    });
    getBackendEvents().then((data) => {
      if (active) setEvents(data);
    }).catch((error) => {
      if (active) setEventsError(error.message);
    });
    return () => { active = false; };
  }, []);

  const chart = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        key: date.toLocaleDateString(),
        day: date.toLocaleDateString(undefined, { weekday: "short" }),
        safe: 0,
        threat: 0,
      };
    });
    (events || []).forEach((event) => {
      const date = eventDate(event.timestamp);
      const day = date && days.find((item) => item.key === date.toLocaleDateString());
      if (!day) return;
      if (event.decision === "ALLOW") day.safe += 1;
      else day.threat += 1;
    });
    return days;
  }, [events]);

  const riskCounts = useMemo(() => ({
    LOW: (events || []).filter((event) => event.risk === "LOW").length,
    MEDIUM: (events || []).filter((event) => event.risk === "MEDIUM").length,
    HIGH: (events || []).filter((event) => event.risk === "HIGH").length,
    CRITICAL: (events || []).filter((event) => event.risk === "CRITICAL").length,
  }), [events]);
  const eventTotal = events?.length || 0;
  const latest = (events || []).slice(0, 5);
  const low = eventTotal ? riskCounts.LOW / eventTotal * 100 : 0;
  const lowAndMedium = eventTotal ? (riskCounts.LOW + riskCounts.MEDIUM) / eventTotal * 100 : 0;
  const throughHigh = eventTotal ? (riskCounts.LOW + riskCounts.MEDIUM + riskCounts.HIGH) / eventTotal * 100 : 0;

  return <div>
    <PageHeader title="Security Overview" description="A unified view of your AI security posture, request activity and threat signals." action={<div className="flex items-center gap-2 rounded-xl border border-ui bg-[var(--panel)] px-3 py-2 text-xs text-muted"><span className={`h-2 w-2 rounded-full ${stats ? "bg-emerald-400" : "bg-amber-400"}`}/>{stats ? "Backend statistics" : "Backend required"}</div>}/>
    {statsError && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">Could not load dashboard statistics: {statsError}</p>}
    {eventsError && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">Could not load security events: {eventsError}</p>}
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total Requests" value={metric(stats, "total_requests", "total")} note="Backend recorded requests" icon={Activity} tone="blue"/>
      <StatCard label="Safe Requests" value={metric(stats, "safe_requests", "allowed_requests", "allowed")} note="Allowed requests" icon={ShieldCheck}/>
      <StatCard label="Threats Detected" value={metric(stats, "threats_detected", "threats")} note="Backend detected threats" icon={ShieldAlert} tone="purple"/>
      <StatCard label="Blocked Requests" value={metric(stats, "blocked_requests", "blocked")} note="Blocked by policy" icon={Ban} tone="blue"/>
    </div>
    <div className="mb-6 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <section className="panel p-5">
        <SectionTitle title="Traffic intelligence" subtitle="Last 7 days · backend security events"/>
        <div className="h-[270px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs><linearGradient id="safeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d7ff27" stopOpacity={.32}/><stop offset="95%" stopColor="#d7ff27" stopOpacity={0}/></linearGradient><linearGradient id="threatFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity={.22}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "var(--sidebar)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }}/><Area type="monotone" dataKey="safe" name="Allowed" stroke="#d7ff27" strokeWidth={2.5} fill="url(#safeFill)"/><Area type="monotone" dataKey="threat" name="Non-allowed" stroke="#f97316" strokeWidth={2} fill="url(#threatFill)"/>
        </AreaChart></ResponsiveContainer></div>
        {events === null && !eventsError && <p className="text-center text-[10px] text-subtle">Loading backend events…</p>}
        {events?.length === 0 && <p className="text-center text-[10px] text-subtle">The backend has not recorded any events yet.</p>}
      </section>
      <section className="panel p-5">
        <SectionTitle title="Security posture" subtitle="Risk distribution from backend events"/>
        <div className="flex h-[205px] items-center justify-center"><div className="relative flex h-44 w-44 items-center justify-center rounded-full" style={{ background: `conic-gradient(#d7ff27 0 ${low}%, #eab308 0 ${lowAndMedium}%, #f97316 0 ${throughHigh}%, #ef4444 0 100%)` }}><div className="flex h-32 w-32 flex-col items-center justify-center rounded-full" style={{ background: "var(--panel)" }}><span className="text-3xl font-bold text-main">{events === null ? "—" : eventTotal}</span><span className="mt-1 text-[10px] text-muted">Events</span></div></div></div>
        <div className="grid grid-cols-2 gap-3">{[["Low", "LOW", "#d7ff27"], ["Medium", "MEDIUM", "#eab308"], ["High", "HIGH", "#f97316"], ["Critical", "CRITICAL", "#ef4444"]].map(([name, key, color]) => <div key={key} className="flex items-center gap-2 text-[11px] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: color }}/>{name}<span className="ml-auto">{events === null ? "—" : riskCounts[key]}</span></div>)}</div>
      </section>
    </div>
    <section className="panel p-5">
      <SectionTitle title="Recent security events" subtitle="Latest scans and chat security decisions" right={<span className="flex items-center gap-1 text-[11px] accent-text"><RadioTower size={13}/> Event monitor</span>}/>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead><tr className="border-b border-ui text-[10px] uppercase tracking-wider text-subtle"><th className="pb-3 font-medium">Event ID</th><th className="pb-3 font-medium">Event</th><th className="pb-3 font-medium">Risk</th><th className="pb-3 font-medium">Decision</th><th className="pb-3 font-medium">Time</th></tr></thead><tbody>{latest.map((event) => <tr key={event.id} className="border-b border-ui last:border-0"><td className="py-4 text-xs font-semibold text-main">{event.id}</td><td className="py-4 text-xs text-muted">{event.type}</td><td className="py-4"><StatusPill value={event.risk}/></td><td className="py-4"><StatusPill value={event.decision}/></td><td className="py-4 text-xs text-muted">{eventDate(event.timestamp)?.toLocaleTimeString() || "—"}</td></tr>)}</tbody></table>
        {events === null && !eventsError && <p className="py-8 text-center text-xs text-muted">Loading backend events…</p>}
        {events?.length === 0 && <p className="py-8 text-center text-xs text-muted">The backend has not recorded any events yet.</p>}
      </div>
    </section>
  </div>;
}
