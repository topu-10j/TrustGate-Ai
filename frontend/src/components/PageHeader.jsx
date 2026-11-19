export default function PageHeader({ eyebrow = "TRUSTGATE WORKSPACE", title, description, action }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div><p className="mb-2 text-[10px] font-bold tracking-[.22em] accent-text">{eyebrow}</p><h2 className="text-2xl font-bold tracking-tight text-main md:text-[30px]">{title}</h2>{description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}</div>
    {action && <div>{action}</div>}
  </div>;
}