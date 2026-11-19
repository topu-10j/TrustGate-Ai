export default function StatCard({ label, value, note, icon: Icon, tone = "lime", trend }) {
  const toneClass = tone === "blue" ? "accent-soft" : tone === "purple" ? "accent-soft" : "accent-soft";
  return <div className="panel group p-5 transition duration-200 hover:-translate-y-1">
    <div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted">{label}</p><p className="kpi-value mt-3 text-[30px] font-bold text-main">{value}</p></div><div className={`rounded-xl p-3 ${toneClass}`}><Icon size={20}/></div></div>
    <div className="mt-4 flex items-center justify-between gap-2"><p className="text-[11px] text-muted">{note}</p>{trend && <span className="text-[10px] font-semibold accent-text">{trend}</span>}</div>
  </div>;
}