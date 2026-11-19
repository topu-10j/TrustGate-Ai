import { useMemo, useState } from "react";
import { Search, Download, ScrollText, RefreshCw } from "lucide-react";
import PageHeader from "../components/PageHeader";
import StatusPill from "../components/StatusPill";
import { Link } from "react-router-dom";
import { roleLabels, useAuditView } from "../state/DemoWorkspace";

function csvCell(value) {
  const text = String(value ?? "");
  return '"' + (/^[=+@-]|^[\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""') + '"';
}

export default function FirewallLogs() {
  const { events, available, pending: loading, error, refresh: loadEvents } = useAuditView();
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState("ALL");
  const [role, setRole] = useState("ALL");

  const rows = useMemo(() => events
    .map((event, index) => ({ ...event, rowLabel: index + 1 }))
    .filter((event) => [event.timestamp, event.role, event.decision, event.reasonCode]
       .some((value) => String(value ?? "").toLowerCase().includes(query.trim().toLowerCase())))
    .filter((event) => decision === "ALL" || event.decision === decision)
    .filter((event) => role === "ALL" || event.role === role), [events, query, decision, role]);

  function exportCSV() {
    const columns = ["timestamp", "role", "decision", "reasonCode"];
    const csv = [columns.join(","), ...rows.map((event) => columns.map((column) => csvCell(event[column])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "trustgate-firewall-logs.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const count = (value) => events.filter((event) => event.decision === value).length;
  return <div>
    <PageHeader eyebrow="SECURITY CENTER" title="Firewall Logs" description="Search and review permission decisions recorded by Secure Chat." action={<button onClick={exportCSV} disabled={!rows.length} className="accent-bg flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold disabled:opacity-40"><Download size={14}/> Export CSV</button>}/>
    {!available && !loading && !error && <p className="mb-4 text-xs text-muted"><Link to="/chat" className="accent-text underline">Select Admin in Secure Chat</Link> to view Firewall Logs.</p>}
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">Could not load backend events: {error}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-3">{[["All events", events.length], ["Blocked", count("denied")], ["Allowed", count("allowed")]].map(([label, value]) => <div key={label} className="panel p-4"><p className="text-[11px] text-muted">{label}</p><p className="mt-2 text-2xl font-bold text-main">{available ? value : "—"}</p></div>)}</div>
    <section className="panel p-5">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center"><div className="flex items-center gap-2"><ScrollText size={18} className="accent-text"/><div><h3 className="text-sm font-semibold text-main">Event history</h3><p className="text-[10px] text-muted">{loading ? "Loading backend events…" : available ? events.length + " audit events" : "Admin demo audit view"}</p></div></div><button onClick={loadEvents} disabled={!available || loading} className="panel-soft flex items-center gap-2 self-start rounded-lg px-3 py-2 text-[10px] text-muted disabled:opacity-40"><RefreshCw size={13} className={loading ? "animate-spin" : ""}/> Refresh</button></div>
      <div className="mb-5 grid gap-2 md:grid-cols-[1fr_170px_170px]"><div className="input-ui flex items-center gap-2 rounded-xl px-3"><Search size={15} className="text-muted"/><input aria-label="Search logs" disabled={!available} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search time, role or reason…" className="w-full bg-transparent py-3 text-xs outline-none placeholder:text-subtle"/></div><select aria-label="Decision filter" disabled={!available} value={decision} onChange={(event) => setDecision(event.target.value)} className="input-ui rounded-xl px-3 py-3 text-xs"><option value="ALL">All decisions</option><option value="allowed">Allowed</option><option value="denied">Denied</option></select><select aria-label="Role filter" disabled={!available} value={role} onChange={(event) => setRole(event.target.value)} className="input-ui rounded-xl px-3 py-3 text-xs"><option value="ALL">All demo roles</option>{Object.entries(roleLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-ui text-[10px] uppercase tracking-wider text-subtle"><th className="pb-3">#</th><th className="pb-3">Reason</th><th className="pb-3">Source</th><th className="pb-3">Demo role</th><th className="pb-3">Decision</th><th className="pb-3">Timestamp</th></tr></thead><tbody>{rows.map((event) => <tr key={event.timestamp + "-" + event.rowLabel} className="border-b border-ui last:border-0"><td className="py-4 text-xs font-semibold text-main">{event.rowLabel}</td><td className="py-4 text-xs text-muted">{event.reasonCode}</td><td className="py-4 text-xs text-muted">Role policy</td><td className="py-4">{roleLabels[event.role] || event.role}</td><td className="py-4"><StatusPill value={event.decision}/></td><td className="py-4 text-[10px] text-muted">{event.timestamp ? new Date(event.timestamp).toLocaleString() : "—"}</td></tr>)}</tbody></table>
        {loading && <p className="py-10 text-center text-xs text-muted">Loading backend events…</p>}
        {available && !loading && rows.length === 0 && <p className="py-10 text-center text-xs text-muted">No backend events match these filters.</p>}
      </div>
      <p className="mt-4 text-[10px] text-subtle">Event history shows the latest 100 permission decisions. Scanner inputs and chat answers are not logged.</p>
    </section>
  </div>;
}
