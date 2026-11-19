export default function SectionTitle({ title, subtitle, right }) {
  return <div className="mb-5 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-main">{title}</h3>{subtitle && <p className="mt-1 text-[11px] text-muted">{subtitle}</p>}</div>{right}</div>;
}