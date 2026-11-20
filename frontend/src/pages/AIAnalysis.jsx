import { useMemo, useState } from "react";
import { BrainCircuit, ShieldAlert, ScanEye, Fingerprint, Workflow, Sparkles, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageHeader from "../components/PageHeader";
import StatusPill from "../components/StatusPill";
import { Link } from "react-router-dom";
import { roleLabels, useAuditView } from "../state/AuthWorkspace";

const modules = [
  { icon: ScanEye, title: "Prompt Injection Analysis", desc: "Review prompt content for attempts to override system instructions or manipulate model behavior.", tag: "Pattern analysis" },
  { icon: ShieldAlert, title: "Jailbreak Detection", desc: "Identify suspicious requests that attempt to bypass safety controls or policy boundaries.", tag: "Threat detection" },
  { icon: Fingerprint, title: "Sensitive Data Inspection", desc: "Identify potential API keys, credentials, contact details and other sensitive data.", tag: "Data protection" },
  { icon: Workflow, title: "Policy Decision Engine", desc: "Present a consistent allow, review, warn or block decision based on security findings.", tag: "Policy workflow" }
];
export default function AIAnalysis() {
  const { available, pending, error, events, refresh, lastUpdated } = useAuditView();
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [decisionFilter, setDecisionFilter] = useState("ALL");
  const filtered = useMemo(() => events.filter(event => (roleFilter === "ALL" || event.role === roleFilter) && (decisionFilter === "ALL" || event.decision === decisionFilter)), [events, roleFilter, decisionFilter]);
  const chartData = useMemo(() => Object.entries(roleLabels).map(([key, name]) => ({
    role: name,
    allowed: filtered.filter(event => event.role === key && event.decision === "allowed").length,
    denied: filtered.filter(event => event.role === key && event.decision === "denied").length,
  })), [filtered]);
  return <div>
    <PageHeader eyebrow="INTELLIGENCE CENTER" title="AI Analysis" description="Review the inspection layers and analyze recorded permission decisions." action={<div className="flex flex-wrap gap-2"><Link to="/monitor" className="accent-bg rounded-lg px-3 py-2 text-xs font-semibold">Run Prompt Scan</Link><button type="button" onClick={refresh} disabled={!available || pending} className="panel-soft flex items-center gap-2 rounded-lg px-3 py-2 text-xs disabled:opacity-40"><RefreshCw size={13} className={pending ? "animate-spin" : ""}/> Refresh</button></div>}/>
    <div className="panel mb-5 overflow-hidden p-6 md:p-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-center"><div className="max-w-xl"><div className="mb-3 inline-flex items-center gap-2 rounded-full accent-soft px-3 py-1.5 text-[10px] font-semibold"><Sparkles size={13}/> TRUSTGATE INTELLIGENCE</div><h3 className="text-xl font-bold text-main md:text-2xl">Understand every AI request before it runs.</h3><p className="mt-3 text-sm leading-6 text-muted">Use the Prompt Scanner for a live inspection. The charts below summarize backend permission decisions; they are not AI-provider usage or scanner-risk metrics.</p></div><div className="flex h-28 w-28 shrink-0 items-center justify-center self-center rounded-[28px] border border-indigo-400/20 bg-gradient-to-br from-indigo-500/20 to-cyan-400/10 accent-text"><BrainCircuit size={54}/></div></div></div>
    <section className="panel mb-5 p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-main">Permission decision analysis</h3><p className="mt-1 text-[10px] text-muted">Filtered backend audit events {available ? `· ${filtered.length} shown` : "· Admin data unavailable"}</p></div><div className="flex flex-wrap gap-2"><select aria-label="Filter analysis by role" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} disabled={!available} className="input-ui rounded-lg px-3 py-2 text-xs"><option value="ALL">All roles</option>{Object.entries(roleLabels).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select><select aria-label="Filter analysis by decision" value={decisionFilter} onChange={e=>setDecisionFilter(e.target.value)} disabled={!available} className="input-ui rounded-lg px-3 py-2 text-xs"><option value="ALL">All decisions</option><option value="allowed">Allowed</option><option value="denied">Denied</option></select></div></div>
      {error&&<p role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">{error} <button type="button" onClick={refresh} className="ml-2 underline">Retry</button></p>}
      {!available&&!pending&&!error&&<p className="mb-3 text-xs text-muted">Admin audit analysis is restricted to Admin accounts.</p>}
      {pending&&<p className="mb-3 text-xs text-muted">Loading audit data…</p>}
      <div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={available?chartData:[]} barGap={5}><CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/><XAxis dataKey="role" tick={{fill:"var(--muted)",fontSize:11}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:"var(--muted)",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"var(--sidebar)",border:"1px solid var(--border)",borderRadius:10,color:"var(--text)"}}/><Bar dataKey="allowed" name="Allowed" fill="#84cc16" radius={[4,4,0,0]}/><Bar dataKey="denied" name="Denied" fill="#f97316" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
      {available&&filtered.length===0&&!pending&&<p className="text-center text-xs text-muted">No events match the selected filters.</p>}
      <p className="mt-2 text-[10px] text-subtle">Source: GET /api/audit · Auto-refresh every 4 seconds. {lastUpdated?`Last sync ${new Date(lastUpdated).toLocaleTimeString()}`:""}</p>
    </section>
    <div className="grid gap-4 md:grid-cols-2">{modules.map((m,i)=>{const I=m.icon;return <div key={m.title} className="panel p-5 transition hover:-translate-y-1"><div className="flex items-start justify-between"><div className="accent-soft rounded-xl p-3"><I size={22}/></div><span className="text-[10px] text-subtle">LAYER 0{i+1}</span></div><h3 className="mt-5 text-sm font-semibold text-main">{m.title}</h3><p className="mt-2 min-h-12 text-xs leading-6 text-muted">{m.desc}</p><div className="mt-4 flex items-center justify-between border-t border-ui pt-4"><span className="text-[10px] text-muted">{m.tag}</span><StatusPill value="AVAILABLE IN SCANNER"/></div></div>})}</div>
    <p className="mt-5 text-[10px] text-subtle">These cards describe inspection layers. The Prompt Scanner runs the configured Python engine; chat permissions are checked separately.</p>
  </div>;
}
