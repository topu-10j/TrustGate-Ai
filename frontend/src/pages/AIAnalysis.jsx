import { BrainCircuit, ShieldAlert, ScanEye, Fingerprint, Workflow, Sparkles } from "lucide-react";
import PageHeader from "../components/PageHeader";
import StatusPill from "../components/StatusPill";

const modules = [
  { icon: ScanEye, title: "Prompt Injection Analysis", desc: "Review prompt content for attempts to override system instructions or manipulate model behavior.", tag: "Pattern analysis", tone: "blue" },
  { icon: ShieldAlert, title: "Jailbreak Detection", desc: "Identify suspicious requests that attempt to bypass safety controls or policy boundaries.", tag: "Threat detection", tone: "purple" },
  { icon: Fingerprint, title: "Sensitive Data Inspection", desc: "Identify potential API keys, credentials, contact details and other sensitive data.", tag: "Data protection", tone: "lime" },
  { icon: Workflow, title: "Policy Decision Engine", desc: "Present a consistent allow, review, warn or block decision based on security findings.", tag: "Policy workflow", tone: "blue" }
];
export default function AIAnalysis() {
  return <div>
    <PageHeader eyebrow="INTELLIGENCE CENTER" title="AI Analysis" description="Explore the security analysis layers that protect AI requests inside TrustGate."/>
    <div className="panel mb-5 overflow-hidden p-6 md:p-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center"><div className="max-w-xl"><div className="mb-3 inline-flex items-center gap-2 rounded-full accent-soft px-3 py-1.5 text-[10px] font-semibold"><Sparkles size={13}/> TRUSTGATE INTELLIGENCE</div><h3 className="text-xl font-bold text-main md:text-2xl">Understand every AI request before it runs.</h3><p className="mt-3 text-sm leading-6 text-muted">A layered inspection workflow can help identify prompt attacks, risky instructions and sensitive data before requests are passed to an AI provider.</p></div><div className="flex h-28 w-28 shrink-0 items-center justify-center self-center rounded-[28px] border border-indigo-400/20 bg-gradient-to-br from-indigo-500/20 to-cyan-400/10 accent-text"><BrainCircuit size={54}/></div></div>
    </div>
    <div className="grid gap-4 md:grid-cols-2">{modules.map((m,i)=>{const I=m.icon;return <div key={m.title} className="panel p-5 transition hover:-translate-y-1"><div className="flex items-start justify-between"><div className={`rounded-xl p-3 ${m.tone==="purple"?"accent-soft":m.tone==="blue"?"accent-soft":"accent-soft"}`}><I size={22}/></div><span className="text-[10px] text-subtle">LAYER 0{i+1}</span></div><h3 className="mt-5 text-sm font-semibold text-main">{m.title}</h3><p className="mt-2 min-h-12 text-xs leading-6 text-muted">{m.desc}</p><div className="mt-4 flex items-center justify-between border-t border-ui pt-4"><span className="text-[10px] text-muted">{m.tag}</span><StatusPill value="MONITORING"/></div></div>})}</div>
    <p className="mt-5 text-[10px] text-subtle">These cards describe planned TrustGate capabilities; actual detection behavior will be supplied by the security engine and backend integration.</p>
  </div>;
}