import { Bell, Menu, Search, Sun, Moon, Command, Wifi, WifiOff, X, ShieldAlert, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { checkBackendConnection, openAlertsStream } from "../services/api";
import { useLocation, useNavigate } from "react-router-dom";
import { roleLabels, useWorkspace, useAuditView } from "../state/AuthWorkspace";
import { alertIdentity, loadAlertReadKeys, saveAlertReadKeys } from "../utils/alertUtils";

const pageNames = {
  "/": "Dashboard", "/monitor": "Prompt Scanner", "/analysis": "AI Analysis",
  "/chat": "Secure Chat", "/documents": "Documents", "/logs": "Firewall Logs", "/analytics": "Analytics", "/vault": "Admin Vault", "/settings": "Settings"
};
function safeSessionStorage() {
  try { return window.sessionStorage; } catch { return null; }
}

const searchablePages = [
  ["dashboard", "/"], ["prompt scanner", "/monitor"], ["ai analysis", "/analysis"],
  ["secure chat", "/chat"], ["documents", "/documents"], ["firewall logs", "/logs"], ["analytics", "/analytics"], ["admin vault", "/vault"], ["settings", "/settings"]
];


export default function Topbar({ setOpen, theme, setTheme, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, email } = useWorkspace();
  const { newEvents, clearNewEvents } = useAuditView();
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [streamError, setStreamError] = useState("");
  const title = pageNames[location.pathname] || "Dashboard";
  const [connection, setConnection] = useState({ connected: false, checking: true });
  const [searchText, setSearchText] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const accessiblePages = role === "admin" ? searchablePages : searchablePages.filter(([label]) => !["firewall logs", "analytics", "admin vault"].includes(label));
  const storageRole = `${role}:${email || "signed-in"}`;
  const [readAlertsByRole, setReadAlertsByRole] = useState(() => ({
    [storageRole]: loadAlertReadKeys(safeSessionStorage(), storageRole),
  }));
  const readAlerts = useMemo(() => new Set(readAlertsByRole[storageRole] || []), [readAlertsByRole, storageRole]);
  const alertRows = useMemo(() => { const merged=[...liveAlerts,...newEvents]; const seen=new Set(); return merged.map(event=>({event,key:alertIdentity(event)})).filter(item=>!seen.has(item.key)&&seen.add(item.key)); }, [newEvents,liveAlerts]);
  const unreadCount = alertRows.filter(item => !readAlerts.has(item.key)).length;

  useEffect(() => {
    setNotificationsOpen(false);
    setProfileOpen(false);
    setMobileSearchOpen(false);
  }, [role]);

  useEffect(() => { saveAlertReadKeys(safeSessionStorage(), storageRole, readAlertsByRole[storageRole] || []); }, [storageRole, readAlertsByRole]);
  useEffect(() => {
    setLiveAlerts([]); setStreamError("");
    if (role !== "admin") return;
    const stream = openAlertsStream(event => setLiveAlerts(current => [event, ...current.filter(item => alertIdentity(item) !== alertIdentity(event))].slice(0, 50)), error => setStreamError(error.message));
    return () => stream.close();
  }, [role, email]);

  useEffect(() => {
    const controller = new AbortController();
    const check = async () => { const status = await checkBackendConnection(controller.signal); if (!controller.signal.aborted) setConnection({ ...status, checking: false }); };
    check();
    const timer = window.setInterval(check, 20000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  function runSearch(event) {
    if (event.key !== "Enter") return;
    const query = searchText.trim().toLowerCase();
    if (!query) return;
    const match = accessiblePages.find(([label]) => label.includes(query) || query.includes(label));
    if (match) { navigate(match[1]); setSearchText(""); setMobileSearchOpen(false); }
  }
  function openAlert(item) {
    setReadAlertsByRole(current => ({ ...current, [storageRole]: [...new Set([...(current[storageRole] || []), item.key])] }));
    setNotificationsOpen(false);
    const event = item.event;
    navigate(`/logs?event=${encodeURIComponent(event.timestamp ?? event.id ?? event.incidentId ?? "")}&role=${encodeURIComponent(event.role ?? "")}&decision=${encodeURIComponent(event.decision ?? "")}&reason=${encodeURIComponent(event.reasonCode ?? "")}`);
  }
  function markAllRead() { setReadAlertsByRole(current => ({ ...current, [storageRole]: [...new Set([...(current[storageRole] || []), ...alertRows.map(item => item.key)])] })); }

  return <header className="sidebar-bg sticky top-0 z-30 flex h-[70px] items-center justify-between border-b border-ui px-4 md:px-8">
    <div className="flex min-w-0 items-center gap-3">
      <button aria-label="Open navigation" onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted hover:bg-[var(--panel-2)] lg:hidden"><Menu size={21}/></button>
      <div className="min-w-0"><div className="text-[11px] text-muted">TrustGate <span className="mx-1">/</span> Workspace</div><h1 className="truncate text-[15px] font-semibold text-main">{title}</h1></div>
    </div>
    <div className="flex items-center gap-2 md:gap-4">
      <div className="input-ui relative hidden h-10 w-56 items-center gap-2 rounded-full px-3 lg:flex">
        <Search size={15} className="text-muted"/><input aria-label="Search pages" value={searchText} onChange={event=>setSearchText(event.target.value)} onKeyDown={runSearch} placeholder="Search pages, press Enter…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-subtle"/><Command size={13} className="text-subtle"/>
        {searchText.trim()&&<div className="absolute left-0 top-12 z-40 w-56 rounded-xl border border-ui bg-[var(--sidebar)] p-2 shadow-xl">{accessiblePages.filter(([label])=>label.includes(searchText.trim().toLowerCase())).map(([label,path])=><button key={path} type="button" onClick={()=>{navigate(path);setSearchText("");}} className="block w-full rounded-lg px-3 py-2 text-left text-xs capitalize text-main hover:bg-[var(--panel-2)]">{label}</button>)}{!accessiblePages.some(([label])=>label.includes(searchText.trim().toLowerCase()))&&<p className="px-3 py-2 text-xs text-muted">No matching pages</p>}</div>}
      </div>
      <div className="relative lg:hidden">
        <button type="button" aria-label="Search pages" aria-expanded={mobileSearchOpen} onClick={()=>setMobileSearchOpen(v=>!v)} className="panel-soft flex h-10 w-10 items-center justify-center text-muted"><Search size={17}/></button>
        {mobileSearchOpen&&<div className="absolute right-0 top-12 z-40 w-[min(320px,calc(100vw-24px))] rounded-xl border border-ui bg-[var(--sidebar)] p-2 shadow-xl"><input autoFocus aria-label="Search pages" value={searchText} onChange={e=>setSearchText(e.target.value)} onKeyDown={runSearch} placeholder="Search pages…" className="input-ui w-full rounded-lg px-3 py-2 text-xs"/>{searchText.trim()&&<div className="mt-2 max-h-48 overflow-y-auto">{accessiblePages.filter(([label])=>label.includes(searchText.trim().toLowerCase())).map(([label,path])=><button key={path} type="button" onClick={()=>{navigate(path);setSearchText("");setMobileSearchOpen(false);}} className="block w-full rounded-lg px-3 py-2 text-left text-xs capitalize text-main hover:bg-[var(--panel-2)]">{label}</button>)}{!accessiblePages.some(([label])=>label.includes(searchText.trim().toLowerCase()))&&<p className="px-3 py-2 text-xs text-muted">No matching pages</p>}</div>}</div>}
      </div>
      <div title={connection.connected ? "Backend connected" : "Backend unavailable"} className={`hidden items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] font-medium sm:flex ${connection.connected ? "border-emerald-500/30 text-emerald-500" : "border-amber-500/30 text-amber-500"}`}>
        {connection.connected ? <Wifi size={13}/> : <WifiOff size={13}/>}{connection.connected ? "API Connected" : connection.checking ? "Checking API" : "API Offline"}
      </div>
      <button aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="panel-soft flex h-10 w-10 items-center justify-center text-muted transition hover:text-main">{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button>
      <div className="relative">
        <button aria-label="Notifications" aria-expanded={notificationsOpen} onClick={()=>setNotificationsOpen(value=>!value)} className="panel-soft relative flex h-10 w-10 items-center justify-center text-muted"><Bell size={17}/>{unreadCount>0&&<span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unreadCount>9?"9+":unreadCount}</span>}</button>
        {notificationsOpen&&<div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-28px))] rounded-xl border border-ui bg-[var(--sidebar)] p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-bold text-main">Live Security Alerts</h3><button aria-label="Close notifications" onClick={()=>setNotificationsOpen(false)} className="text-muted"><X size={15}/></button></div>
          {role!=="admin"?<p className="py-5 text-center text-xs text-muted">Security incident stream is restricted to Admin.</p>:alertRows.length===0?<p className="py-5 text-center text-xs text-muted">No new incidents received.</p>:<div className="max-h-64 space-y-2 overflow-y-auto">{alertRows.slice(0,8).map(item=><div key={item.key} className={`rounded-lg border border-ui p-2 ${readAlerts.has(item.key)?"opacity-70":""}`}><div className="flex items-start gap-2"><ShieldAlert size={13} className="mt-0.5 shrink-0 text-amber-500"/><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-main">{String(item.event.decision||item.event.severity||item.event.type||"Incident").toUpperCase()} · {item.event.title||item.event.message||roleLabels[item.event.role]||item.event.role||"Security alert"}</p><p className="mt-1 text-[10px] text-muted">{item.event.reasonCode||"Permission decision"} · {item.event.timestamp?new Date(item.event.timestamp).toLocaleString():"Time unavailable"}</p><div className="mt-2 flex items-center gap-3"><button type="button" onClick={()=>openAlert(item)} className="text-[9px] accent-text">Open event →</button>{!readAlerts.has(item.key)&&<button type="button" onClick={()=>setReadAlertsByRole(current=>({...current,[storageRole]:[...new Set([...(current[storageRole]||[]),item.key])]}))} className="flex items-center gap-1 text-[9px] text-muted"><Check size={11}/> Mark as read</button>}<span className="ml-auto text-[9px] text-subtle">{readAlerts.has(item.key)?"Read":"Unread"}</span></div></div></div></div>)}</div>}
          {role==="admin"&&streamError&&<p role="status" className="mt-2 text-[10px] text-amber-500">{streamError}</p>}
          {role==="admin"&&alertRows.length>0&&<div className="mt-3 flex gap-2"><button onClick={markAllRead} disabled={!unreadCount} className="flex-1 rounded-lg bg-[var(--panel-2)] px-3 py-2 text-[10px] font-semibold text-main disabled:opacity-40">Mark all read</button><button onClick={()=>{clearNewEvents();setLiveAlerts([]);}} className="flex-1 rounded-lg border border-ui px-3 py-2 text-[10px] font-semibold text-muted">Dismiss alerts</button></div>}
          {role === "admin" && <button onClick={()=>{setNotificationsOpen(false);navigate("/logs");}} className="mt-2 w-full rounded-lg border border-ui px-3 py-2 text-[10px] font-semibold text-muted">Open Firewall Logs</button>}
        </div>}
      </div>
      <div className="relative hidden border-l border-ui pl-4 sm:block">
        <button type="button" onClick={()=>setProfileOpen(v=>!v)} aria-expanded={profileOpen} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-[var(--panel-2)]"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent)] text-[11px] font-bold text-white">TG</div><div className="text-left"><p className="text-xs font-semibold text-main">{roleLabels[role]}</p><p className="text-[10px] text-muted">{email} ▾</p></div></button>
        {profileOpen&&<div className="absolute right-0 top-12 z-50 w-48 rounded-xl border border-ui bg-[var(--sidebar)] p-3 shadow-xl"><p className="text-xs font-semibold text-main">{roleLabels[role]} session</p><p className="mt-1 break-all text-[10px] text-muted">{email}</p><button type="button" onClick={()=>{setProfileOpen(false);onLogout?.();}} className="mt-3 w-full rounded-lg border border-ui px-3 py-2 text-left text-xs text-muted hover:bg-[var(--panel-2)]">Sign out</button></div>}
      </div>
    </div>
  </header>;
}
