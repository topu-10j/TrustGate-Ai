import { useMemo, useState } from "react";
import { Search, Download, ScrollText, RefreshCw, FileJson, FileText, FileSpreadsheet } from "lucide-react";
import PageHeader from "../components/PageHeader";
import StatusPill from "../components/StatusPill";
import { Link, useSearchParams } from "react-router-dom";
import { roleLabels, useAuditView } from "../state/AuthWorkspace";
import { csvCell, printable } from "../utils/exportUtils";

function downloadBlob(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FirewallLogs() {
  const { events, available, pending: loading, error, refresh: loadEvents, lastUpdated, newEvents } = useAuditView();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedEvent = searchParams.get("event");
  const selectedRole = searchParams.get("role");
  const selectedDecision = searchParams.get("decision");
  const selectedReason = searchParams.get("reason");
  const selectedExists = selectedEvent !== null && events.some(e => String(e.timestamp ?? e.id ?? "") === selectedEvent && (!selectedRole || e.role === selectedRole) && (!selectedDecision || e.decision === selectedDecision) && (!selectedReason || e.reasonCode === selectedReason));
  function clearSelectedEvent() { setSearchParams({}); }
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState(() => ["allowed", "denied"].includes(searchParams.get("decision")) ? searchParams.get("decision") : "ALL");
  const [role, setRole] = useState(() => Object.hasOwn(roleLabels, searchParams.get("role") || "") ? searchParams.get("role") : "ALL");
  const [exportMessage, setExportMessage] = useState("");

  const rows = useMemo(() => events
    .filter((event) => [event.timestamp, event.id, event.role, event.decision, event.reasonCode]
       .some((value) => String(value ?? "").toLowerCase().includes(query.trim().toLowerCase())))
    .filter((event) => decision === "ALL" || event.decision === decision)
    .filter((event) => role === "ALL" || event.role === role), [events, query, decision, role]);

  const columns = ["timestamp", "role", "decision", "reasonCode"];
  function exportCSV() {
    const csv = [columns.join(","), ...rows.map((event) => columns.map((column) => csvCell(event[column])).join(","))].join("\n");
    downloadBlob("\ufeff" + csv, "text/csv;charset=utf-8;", "trustgate-firewall-logs.csv");
    setExportMessage(`CSV exported: ${rows.length} filtered records.`);
  }
  function exportJSON() {
    downloadBlob(JSON.stringify(rows.map(({ timestamp, role, decision, reasonCode }) => ({ timestamp, role, decision, reasonCode })), null, 2),
      "application/json;charset=utf-8;", "trustgate-firewall-logs.json");
    setExportMessage(`JSON exported: ${rows.length} filtered records.`);
  }
  function exportPDF() {
    const tableRows = rows.map((event) => `<tr><td>${printable(event.timestamp ? new Date(event.timestamp).toLocaleString() : "—")}</td><td>${printable(roleLabels[event.role] || event.role)}</td><td>${printable(event.decision)}</td><td>${printable(event.reasonCode)}</td></tr>`).join("");
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>TrustGate Firewall Logs</title><style>
      body{font:12px Arial,sans-serif;padding:28px;color:#18232a}h1{font-size:22px}p{color:#58636a}
      table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccd2d5;padding:9px;text-align:left}
      th{background:#f1f4f5}@media print{button{display:none}}
      </style></head><body><h1>TrustGate AI — Firewall Logs</h1><p>Filtered records: ${rows.length} · Generated: ${printable(new Date().toLocaleString())}</p>
      <table><thead><tr><th>Timestamp</th><th>Role</th><th>Decision</th><th>Reason code</th></tr></thead><tbody>${tableRows || "<tr><td colspan='4'>No matching records</td></tr>"}</tbody></table>
      <script>window.onload=()=>window.print();</script></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) {
      setExportMessage("Pop-up blocked. Allow pop-ups to print or save this report as PDF.");
      return;
    }
    popup.document.open();
    popup.document.write(doc);
    popup.document.close();
    setExportMessage("Print dialog opened. Choose “Save as PDF” to create the PDF file.");
  }

  const count = (value) => events.filter((event) => event.decision === value).length;
  return <div>
    <PageHeader eyebrow="SECURITY CENTER" title="Firewall Logs" description="Live audit events from the TrustGate backend." action={
      <div className="flex flex-wrap gap-2">
        <button onClick={exportCSV} disabled={!rows.length || !available} className="accent-bg flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold disabled:opacity-40"><FileSpreadsheet size={14}/> CSV</button>
        <button onClick={exportJSON} disabled={!rows.length || !available} className="panel-soft flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold disabled:opacity-40"><FileJson size={14}/> JSON</button>
        <button onClick={exportPDF} disabled={!available} className="panel-soft flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold disabled:opacity-40"><FileText size={14}/> PDF</button>
      </div>
    }/>
    {!available && !loading && !error && <p className="mb-4 text-xs text-muted"><Link to="/chat" className="accent-text underline">Sign in with an Admin account</Link> to view Firewall Logs.</p>}
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">Could not load backend events: {error} <button onClick={loadEvents} className="ml-2 underline">Retry</button></p>}
    {exportMessage && <p role="status" className="mb-3 rounded-lg border border-ui p-3 text-xs text-muted">{exportMessage}</p>}
    {selectedEvent !== null && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs"><div>{selectedExists ? <><strong className="text-amber-400">Selected alert event</strong><span className="ml-2 text-muted">{((Number.isFinite(Date.parse(selectedEvent)) ? new Date(selectedEvent).toLocaleString() : selectedEvent))} · {selectedRole} · {selectedDecision} · {selectedReason}</span></> : <span role="status" className="text-amber-400">Alert event could not be matched. It may be invalid or no longer in the current audit results.</span>}</div><button onClick={clearSelectedEvent} className="rounded-lg border border-ui px-3 py-1.5 text-muted">Clear selection</button></div>}
    <div className="mb-5 grid gap-3 sm:grid-cols-3">{[["All events", events.length], ["Blocked", count("denied")], ["Allowed", count("allowed")]].map(([label, value]) => <div key={label} className="panel p-4"><p className="text-[11px] text-muted">{label}</p><p className="mt-2 text-2xl font-bold text-main">{available ? value : "—"}</p></div>)}</div>
    <section className="panel p-5">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-2"><ScrollText size={18} className="accent-text"/><div><h3 className="text-sm font-semibold text-main">Event history</h3><p className="text-[10px] text-muted">{loading ? "Loading backend events…" : available ? `${events.length} audit events · auto-refresh every 4 seconds` : "Admin audit view"}</p></div></div>
        <div className="flex items-center gap-3"><span className="text-[10px] text-muted">{newEvents.length ? `${newEvents.length} new alerts` : "Live monitoring"}</span><button onClick={loadEvents} disabled={!available || loading} className="panel-soft flex items-center gap-2 self-start rounded-lg px-3 py-2 text-[10px] text-muted disabled:opacity-40"><RefreshCw size={13} className={loading ? "animate-spin" : ""}/> Refresh now</button></div>
      </div>
      <div className="mb-5 grid gap-2 md:grid-cols-[1fr_170px_170px]">
        <div className="input-ui flex items-center gap-2 rounded-xl px-3"><Search size={15} className="text-muted"/><input aria-label="Search logs" disabled={!available} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search time, role or reason…" className="w-full bg-transparent py-3 text-xs outline-none placeholder:text-subtle"/></div>
        <select aria-label="Decision filter" disabled={!available} value={decision} onChange={(event) => setDecision(event.target.value)} className="input-ui rounded-xl px-3 py-3 text-xs"><option value="ALL">All decisions</option><option value="allowed">Allowed</option><option value="denied">Denied</option></select>
        <select aria-label="Role filter" disabled={!available} value={role} onChange={(event) => setRole(event.target.value)} className="input-ui rounded-xl px-3 py-3 text-xs"><option value="ALL">All roles</option>{Object.entries(roleLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-ui text-[10px] uppercase tracking-wider text-subtle"><th className="pb-3">#</th><th className="pb-3">Reason</th><th className="pb-3">Source</th><th className="pb-3">Role</th><th className="pb-3">Decision</th><th className="pb-3">Timestamp</th></tr></thead><tbody>{rows.map((event, index) => <tr key={`${event.timestamp}-${event.role}-${index}`} className={`border-b border-ui last:border-0 ${selectedExists && String(event.timestamp ?? event.id ?? "") === selectedEvent && (!selectedRole || event.role === selectedRole) && (!selectedDecision || event.decision === selectedDecision) && (!selectedReason || event.reasonCode === selectedReason) ? "bg-amber-500/10" : ""}`}><td className="py-4 text-xs font-semibold text-main">{index + 1}</td><td className="py-4 text-xs text-muted">{event.reasonCode}</td><td className="py-4 text-xs text-muted">Role policy</td><td className="py-4">{roleLabels[event.role] || event.role}</td><td className="py-4"><StatusPill value={event.decision}/></td><td className="py-4 text-[10px] text-muted">{event.timestamp ? new Date(event.timestamp).toLocaleString() : "—"}</td></tr>)}</tbody></table>
        {loading && <p className="py-10 text-center text-xs text-muted">Loading backend events…</p>}
        {available && !loading && rows.length === 0 && <p className="py-10 text-center text-xs text-muted">No backend events match these filters.</p>}
      </div>
      <p className="mt-4 text-[10px] text-subtle">Showing the latest backend audit events. Export files contain the same filtered records displayed above.</p>
      {lastUpdated && <p className="mt-1 text-[10px] text-subtle">Last successful sync: {new Date(lastUpdated).toLocaleTimeString()}</p>}
    </section>
  </div>;
}
