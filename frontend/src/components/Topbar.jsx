import { Bell, Menu, Search, Sun, Moon, Command, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { checkBackendConnection } from "../services/api";
import { useLocation } from "react-router-dom";
import { roleLabels, useDemoWorkspace } from "../state/DemoWorkspace";

const pageNames = {
  "/": "Dashboard", "/monitor": "Prompt Scanner", "/analysis": "AI Analysis",
  "/chat": "Secure Chat", "/logs": "Firewall Logs", "/analytics": "Analytics", "/settings": "Settings"
};

export default function Topbar({ setOpen, theme, setTheme }) {
  const location = useLocation();
  const { role } = useDemoWorkspace();
  const title = pageNames[location.pathname] || "Dashboard";
  const [connection, setConnection] = useState({ connected: false, checking: true });
  useEffect(() => {
    const controller = new AbortController();
    const check = async () => { const status = await checkBackendConnection(controller.signal); if (!controller.signal.aborted) setConnection({ ...status, checking: false }); };
    check();
    const timer = window.setInterval(check, 20000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  return <header className="sidebar-bg sticky top-0 z-30 flex h-[70px] items-center justify-between border-b border-ui px-4 md:px-8">
    <div className="flex min-w-0 items-center gap-3">
      <button aria-label="Open navigation" onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted hover:bg-[var(--panel-2)] lg:hidden"><Menu size={21}/></button>
      <div className="min-w-0"><div className="text-[11px] text-muted">TrustGate <span className="mx-1">/</span> Workspace</div><h1 className="truncate text-[15px] font-semibold text-main">{title}</h1></div>
    </div>
    <div className="flex items-center gap-2 md:gap-4">
      <div className="input-ui hidden h-10 w-56 items-center gap-2 rounded-full px-3 lg:flex">
        <Search size={15} className="text-muted"/><span className="flex-1 text-xs text-subtle">Search anything...</span><Command size={13} className="text-subtle"/>
      </div>
      <div title={connection.connected ? "Backend connected" : "Backend unavailable"} className={`hidden items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] font-medium sm:flex ${connection.connected ? "border-emerald-500/30 text-emerald-500" : "border-amber-500/30 text-amber-500"}`}>
        {connection.connected ? <Wifi size={13}/> : <WifiOff size={13}/>}
        {connection.connected ? "API Connected" : connection.checking ? "Checking API" : "API Offline"}
      </div>
      <button aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="panel-soft flex h-10 w-10 items-center justify-center text-muted transition hover:text-main">
        {theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}
      </button>
      <button aria-label="Notifications" title="No notifications service is connected" className="panel-soft relative flex h-10 w-10 items-center justify-center text-muted"><Bell size={17}/><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)]"/></button>
      <div className="hidden items-center gap-2.5 border-l border-ui pl-4 sm:flex">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent)] text-[11px] font-bold text-white">TG</div>
        <div><p className="text-xs font-semibold text-main">{roleLabels[role]}</p><p className="text-[10px] text-muted">Demo role</p></div>
      </div>
    </div>
  </header>;
}