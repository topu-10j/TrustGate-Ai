import { NavLink } from "react-router-dom";
import {
  Shield, LayoutDashboard, RadioTower, ScanSearch, MessageSquareText,
  ScrollText, ChartNoAxesCombined, Settings, LifeBuoy, X, ShieldCheck
} from "lucide-react";

const groups = [
  { label: "WORKSPACE", links: [
    { label: "Dashboard", to: "/", icon: LayoutDashboard },
    { label: "Prompt Scanner", to: "/monitor", icon: RadioTower },
    { label: "AI Analysis", to: "/analysis", icon: ScanSearch },
    { label: "Secure Chat", to: "/chat", icon: MessageSquareText },
  ]},
  { label: "SECURITY CENTER", links: [
    { label: "Firewall Logs", to: "/logs", icon: ScrollText },
    { label: "Analytics", to: "/analytics", icon: ChartNoAxesCombined },
  ]},
];

export default function Sidebar({ open, setOpen }) {
  return <>
    {open && <button aria-label="Close navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/60 lg:hidden" />}
    <aside className={`desktop-sidebar sidebar-bg fixed inset-y-0 left-0 z-50 flex w-[218px] flex-col border-r border-ui transition-transform duration-300 lg:translate-x-0 ${open ? "open" : ""}`}>
      <div className="flex h-[70px] items-center justify-between border-b border-ui px-6">
        <div className="flex items-center gap-3">
          <div className="accent-bg flex h-10 w-10 items-center justify-center rounded-xl"><Shield size={22} strokeWidth={2.5}/></div>
          <div><div className="text-[19px] font-extrabold tracking-tight text-main">TrustGate</div><div className="text-[9px] font-bold tracking-[.25em] text-muted">AI SECURITY PLATFORM</div></div>
        </div>
        <button onClick={() => setOpen(false)} className="text-muted lg:hidden"><X size={20}/></button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-7">
        {groups.map(group => <div key={group.label} className="mb-8">
          <p className="mb-3 px-3 text-[10px] font-bold tracking-[.2em] text-subtle">{group.label}</p>
          <nav className="space-y-1">
            {group.links.map(link => {
              const Icon = link.icon;
              return <NavLink key={link.to} to={link.to} end={link.to === "/"} onClick={() => setOpen(false)}
                className={({isActive}) => `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition ${isActive ? "nav-active" : "nav-idle"}`}>
                <Icon size={18}/><span>{link.label}</span>
              </NavLink>;
            })}
          </nav>
        </div>)}
      </div>

      <div className="border-t border-ui p-4">
        <NavLink to="/settings" onClick={() => setOpen(false)} className={({isActive}) => `mb-3 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] ${isActive ? "nav-active" : "nav-idle"}`}>
          <Settings size={18}/> Settings
        </NavLink>
        <div className="panel-soft p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent)] text-xs font-bold text-white">TG</div>
            <div className="min-w-0"><p className="truncate text-xs font-semibold text-main">TrustGate Admin</p><p className="text-[10px] text-muted">Workspace preview</p></div>
            <ShieldCheck className="ml-auto accent-text" size={17}/>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 px-2 text-[10px] text-subtle"><LifeBuoy size={13}/> TrustGate Security Console · v1.0</div>
      </div>
    </aside>
  </>;
}