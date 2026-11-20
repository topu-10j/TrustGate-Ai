import { Link } from "react-router-dom";
export default function StatCard({ label, value, note, icon: Icon, tone = "lime", trend, to }) {
  const toneClass = tone === "blue" ? "accent-soft" : tone === "purple" ? "accent-soft" : "accent-soft";
  const card = <div className={`panel group p-5 transition duration-200 ${to ? "hover:-translate-y-1 hover:border-[var(--accent)]" : ""}`}>
    <div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted">{label}</p><p className="kpi-value mt-3 text-[30px] font-bold text-main">{value}</p></div><div className={`rounded-xl p-3 ${toneClass}`}><Icon size={20}/></div></div>
    <div className="mt-4 flex items-center justify-between gap-2"><p className="text-[11px] text-muted">{note}</p>{trend && <span className="text-[10px] font-semibold accent-text">{trend}</span>}</div>
  </div>;
  return to ? <Link to={to} aria-label={`${label}: ${value}. ${note}`} className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{card}</Link> : card;
}
