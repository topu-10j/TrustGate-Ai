import { useEffect, useRef, useState } from "react";
import { Bot, Send, ShieldCheck, LockKeyhole, Sparkles, User, Loader2, ShieldAlert } from "lucide-react";
import PageHeader from "../components/PageHeader";
import StatusPill from "../components/StatusPill";
import { sendChat } from "../services/api";
import { DemoRoleSelect, useDemoWorkspace } from "../state/DemoWorkspace";
const starters = [
  ["Ask office hours", "What are the office hours?"],
  ["Try budget question", "What is the confidential budget?"],
  ["Ask project deadline", "What is the project deadline?"],
];

export default function SecureChat() {
  const { role, token, sessionError, restart, expire, refreshAudit } = useDemoWorkspace();
  const [messages, setMessages] = useState([{ id: 0, role: "assistant", content: "Welcome to TrustGate. Ask a company question to check what your demo role can access." }]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef(null);
  const active = useRef(null);
  const sequence = useRef(0);
  const add = (item) => {
    const id = ++sequence.current;
    setMessages((old) => [...old, { id, ...item }]);
  };

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (messages.length > 1) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function submit(text = value) {
    const message = text.trim();
    if (!message || !token || active.current) return;
    const request = new AbortController();
    active.current = request;
    setValue("");
    setError("");
    add({ role: "user", content: message });
    setLoading(true);
    try {
      const answer = await sendChat(message, token, request.signal);
      if (!request.signal.aborted) add({ role: "assistant", content: answer, decision: "ALLOW" });
    } catch (failure) {
      if (request.signal.aborted) return;
      if (failure.status === 401) {
        expire();
      } else if (failure.status === 403 && failure.code === "ACCESS_DENIED") {
        add({ role: "assistant", content: failure.message, decision: "DENIED", code: failure.code });
      } else {
        setError(failure.message);
      }
    } finally {
      active.current = null;
      if (!request.signal.aborted) {
        setLoading(false);
        if (role === "admin") refreshAudit();
      }
    }
  }

 return <div className="mx-auto max-w-5xl"><PageHeader eyebrow="PROTECTED CONVERSATION" title="Secure AI Chat" description="Messages are checked against your demo role before a local response is returned." action={<DemoRoleSelect/>}/><section className="panel flex min-h-[620px] flex-col overflow-hidden"><div className="flex items-center justify-between border-b border-ui px-5 py-4"><div className="flex items-center gap-3"><div className="accent-soft rounded-xl p-2.5"><Bot size={21}/></div><div><h3 className="text-sm font-semibold text-main">TrustGate Assistant</h3><p className="text-[10px] text-muted">Fictional company data · local answer provider</p></div></div><div className="flex items-center gap-2 rounded-full accent-soft px-3 py-2 text-[10px] font-semibold"><ShieldCheck size={13}/> {token ? "SECURITY CHECK ENABLED" : sessionError ? "SESSION UNAVAILABLE" : "STARTING DEMO SESSION"}</div></div>
 <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6" aria-label="Chat messages" aria-live="polite">{messages.map(m=><div key={m.id} className={`flex gap-3 ${m.role==="user"?"flex-row-reverse":""}`}><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${m.role==="user"?"accent-soft":"accent-soft"}`}>{m.role==="user"?<User size={17}/>:<Bot size={18}/>}</div><div role={m.decision === "DENIED" ? "alert" : undefined} className={`max-w-[85%] rounded-2xl p-4 ${m.role==="user"?"accent-soft":"panel-soft"}`}>{m.decision === "DENIED" && <p className="mb-1 text-sm font-bold text-red-400">Access Denied</p>}<p className="whitespace-pre-wrap break-words text-sm leading-6 text-main">{m.content}</p>{m.decision&&<div className="mt-3 flex flex-wrap items-center gap-2"><StatusPill value={m.decision}/>{m.code && <span className="text-[10px] text-red-400">{m.code}</span>}{m.risk_level&&<StatusPill value={m.risk_level}/>}{Number.isFinite(m.risk_score)&&<span className="text-[10px] text-muted">Risk {m.risk_score}/100</span>}{m.mode&&<span className="text-[9px] text-subtle">{m.mode}</span>}</div>}{m.threats?.length>0&&<p className="mt-2 flex items-center gap-1 text-[10px] text-orange-400"><ShieldAlert size={12}/>{m.threats.join(", ")}</p>}</div></div>)}{loading&&<div className="flex items-center gap-3"><div className="accent-soft rounded-xl p-2"><Bot size={18}/></div><div className="panel-soft flex items-center gap-2 rounded-xl px-4 py-3 text-xs text-muted"><Loader2 size={14} className="animate-spin"/>Checking request…</div></div>}<div ref={bottom}/></div>
 <div className="flex flex-wrap gap-2 px-5 pb-3">{starters.map(([label,prompt])=><button key={label} type="button" disabled={!token || loading} onClick={()=>submit(prompt)} className="rounded-full border border-ui px-3 py-2 text-[10px] text-muted hover:border-[var(--accent)] disabled:opacity-40">{label}</button>)}</div>
 {(sessionError || error) && <p role="alert" className="px-5 pb-2 text-xs text-red-400">{sessionError || error} {sessionError && <button type="button" onClick={restart} className="ml-2 underline">Start a new session</button>}</p>}
 <form onSubmit={e=>{e.preventDefault();submit()}} className="border-t border-ui p-4"><div className="flex items-end gap-2 rounded-2xl border border-ui bg-[var(--input)] p-2"><textarea aria-label="Message" maxLength={500} rows={1} value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit()}}} placeholder="Message TrustGate… (Enter to send)" className="max-h-32 min-w-0 flex-1 resize-y bg-transparent px-3 py-2 text-xs text-main outline-none placeholder:text-subtle"/><button type="submit" disabled={!token||!value.trim()||loading} aria-label="Send message" className="accent-bg rounded-xl p-3 disabled:opacity-40"><Send size={16}/></button></div><p className="mt-2 text-center text-[9px] text-subtle"><LockKeyhole size={10} className="mr-1 inline"/>The backend records permission decisions in Firewall Logs. No live model is connected.</p></form></section></div>;
}
