import { useState, useEffect, useRef } from "react";
import { ScanSearch, ShieldCheck, ShieldAlert, LockKeyhole, Fingerprint, FileSearch, Sparkles, Loader2, AlertTriangle, Copy } from "lucide-react";
import PageHeader from "../components/PageHeader";
import StatusPill from "../components/StatusPill";
import { scanPrompt } from "../services/api";
import { useWorkspace } from "../state/AuthWorkspace";
export default function LiveMonitor() {
  const { user, expire, sessionError } = useWorkspace();
  const scan = useRef(null);
  useEffect(() => () => scan.current?.abort(), []);
  const [prompt,setPrompt]=useState(""); const [result,setResult]=useState(null); const [loading,setLoading]=useState(false); const [error,setError]=useState(""); const [copyStatus,setCopyStatus]=useState("");
  function clear() {
    scan.current?.abort();
    scan.current = null;
    setPrompt(""); setResult(null); setError(""); setCopyStatus(""); setLoading(false);
  }

  async function handleScan() {
    if (!prompt.trim() || !user || scan.current) return;
    const request = new AbortController();
    scan.current = request;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await scanPrompt(prompt.trim(), request.signal);
      if (!request.signal.aborted) setResult(data);
    } catch (error) {
      if (request.signal.aborted) return;
      if (error.status === 401) expire();
      else if (error.status === 403 && error.code === "PROMPT_BLOCKED") setError(error.message || "This prompt was blocked by TrustGate security policy.");
      else if (error.status === 403 && error.code === "ACCESS_DENIED") setError(error.message || "You do not have permission to run a scan.");
      else setError(error.message);
    } finally {
      if (scan.current === request) {
        scan.current = null;
        setLoading(false);
      }
    }
  }

  return <div className="mx-auto max-w-5xl"><PageHeader eyebrow="THREAT INSPECTION" title="Prompt Scanner"
    description="Submit a prompt for inspection by the configured TrustGate backend security scanner."
    />
    {sessionError && <p role="alert" className="mb-4 text-sm text-red-400">{sessionError}</p>}
    <div className="grid gap-5 lg:grid-cols-[1.35fr_.8fr]"><section className="panel p-5 md:p-6"><div className="mb-5 flex items-center gap-3"><div className="accent-soft rounded-xl p-3"><ScanSearch size={21}/></div><div><h3 className="text-sm font-semibold text-main">Prompt inspection</h3><p className="text-[11px] text-muted">Enter a prompt for security review</p></div></div>
      <label htmlFor="scan-input" className="mb-2 block text-xs font-medium text-muted">PROMPT CONTENT</label><textarea id="scan-input" value={prompt} onChange={e=>setPrompt(e.target.value)} rows={9}  placeholder="Paste or type a prompt to inspect..." className="input-ui w-full resize-y rounded-xl p-4 text-sm leading-6 placeholder:text-subtle"/><div className="mt-2 flex justify-between text-[10px] text-muted"><span>{prompt.length}/1,000 characters</span><button onClick={clear} className="hover:accent-text">Clear</button></div>
      <button onClick={handleScan} disabled={!user || !prompt.trim() || loading} className="accent-bg mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50">{loading?<Loader2 className="animate-spin" size={16}/>:<ScanSearch size={16}/>} {loading?"Scanning prompt…":"Scan Prompt"}</button>
      {error&&<p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">{error}</p>}
      <p className="mt-3 text-center text-[10px] text-subtle">Results come from the Python security engine. Scan results are returned by the backend.</p>
    </section><section className="space-y-4"><div className="panel p-5"><div className="mb-4 flex items-center gap-2"><ShieldCheck className="accent-text" size={18}/><h3 className="text-sm font-semibold text-main">Inspection policy</h3></div>{[["Prompt injection","Pattern inspection"],["Jailbreak attempt","Instruction analysis"],["Sensitive data","PII / secret detection"],["Risk assessment","0–100 scoring"]].map(([a,b])=><div key={a} className="flex items-center justify-between border-b border-ui py-3 last:border-0"><span className="text-xs text-main">{a}</span><span className="text-[10px] text-muted">{b}</span></div>)}</div>
      <div className="panel p-5"><div className="flex items-center gap-2"><LockKeyhole className="accent-text" size={18}/><h3 className="text-sm font-semibold text-main">Latest inspection</h3></div>{result?<div className="mt-4 space-y-3"><div className="flex items-center justify-between"><span className="text-xs text-muted">Risk score</span><strong className="text-2xl text-main">{Number.isFinite(Number(result.risk_score))?Number(result.risk_score):"—"}<span className="text-xs text-muted">/100</span></strong></div><div className="h-2 overflow-hidden rounded-full bg-[var(--panel-2)]"><div className="h-full rounded-full" style={{width:`${Math.max(0,Math.min(100,Number(result.risk_score)||0))}%`,background:Number(result.risk_score)>=75?"#ef4444":Number(result.risk_score)>=50?"#f97316":Number(result.risk_score)>=25?"#eab308":"#84cc16"}}/></div><div className="flex flex-wrap gap-2"><StatusPill value={result.risk_level||"UNKNOWN"}/><StatusPill value={result.decision||"UNKNOWN"}/></div><div><p className="mb-1 text-[10px] text-muted">Threat type</p><p className="text-xs text-main">{Array.isArray(result.threats)?(result.threats.length?result.threats.join(", "):"None reported"):result.threat_type||result.threats||"Not reported by backend"}</p></div><div><p className="mb-1 text-[10px] text-muted">Masked prompt</p><div className="flex items-start gap-2 rounded-lg bg-[var(--input)] p-3"><p className="min-w-0 flex-1 break-words text-[11px] text-muted">{result.masked_prompt||"No text returned."}</p>{result.masked_prompt&&<button type="button" title="Copy masked prompt" onClick={async()=>{try{await navigator.clipboard.writeText(result.masked_prompt);setCopyStatus("Masked prompt copied.");}catch{setCopyStatus("Clipboard access was denied by the browser.");}}}><Copy size={14}/></button>}</div></div>{copyStatus&&<p role="status" className="text-[10px] text-muted">{copyStatus}</p>}<p className="text-[9px] text-subtle">Result provided by backend</p></div>:<div className="mt-5 flex flex-col items-center rounded-xl border border-dashed border-ui py-8 text-center"><FileSearch size={28} className="text-subtle"/><p className="mt-3 text-xs font-medium text-muted">No scan result yet</p><p className="mt-1 text-[10px] text-subtle">Enter a prompt and run a scan</p></div>}</div></section></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">{[{icon:Fingerprint,title:"Identity & secrets",desc:"Sensitive data pattern detection"},{icon:ShieldAlert,title:"Threat signals",desc:"Suspicious prompt patterns"},{icon:Sparkles,title:"Risk intelligence",desc:"Policy-based risk scoring"}].map(x=>{const I=x.icon;return <div key={x.title} className="panel-soft p-4"><I size={19} className="accent-text"/><p className="mt-3 text-xs font-semibold text-main">{x.title}</p><p className="mt-1 text-[10px] text-muted">{x.desc}</p></div>})}</div>
  </div>;
}
