import { useState } from "react";
import { Users } from "lucide-react";
import { getAccountScopes, updateAccountScopes } from "../services/api";
import { appendAccountScope } from "../utils/accountScopes";

export default function AccountScopeControls({ onExpired }) {
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState("department");
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const account = email.trim().toLowerCase();
  const current = loaded?.email === account ? loaded : null;

  async function load(event) {
    event.preventDefault();
    if (!account || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setLoaded(null);
    try {
      setLoaded({ email: account, scopes: await getAccountScopes(account) });
    } catch (failure) {
      if (failure.status === 401) onExpired();
      setError(failure.message);
    } finally { setBusy(false); }
  }

  async function add(event) {
    event.preventDefault();
    if (!current || !value.trim() || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Read again to include edits made elsewhere since the form was loaded.
      const latest = await getAccountScopes(account);
      const next = appendAccountScope(latest, kind, value);
      if (next === latest) {
        setLoaded({ email: account, scopes: latest });
        setNotice("This scope is already assigned.");
      } else {
        const saved = await updateAccountScopes(account, next);
        setLoaded({ email: account, scopes: saved.scopes });
        setValue("");
        setNotice("Scope added. Existing scopes kept.");
      }
    } catch (failure) {
      if (failure.status === 401) onExpired();
      setError(failure.message);
    } finally { setBusy(false); }
  }

  return <section className="panel mt-5 p-5" aria-label="Account scope controls">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users size={17}/> Account scope controls</h2>
    <form onSubmit={load} className="flex flex-wrap items-end gap-2">
      <label className="block min-w-0 flex-1 text-xs text-muted">Account email
        <input type="email" required disabled={busy} value={email} onChange={event => {
          setEmail(event.target.value); setLoaded(null); setValue(""); setError(""); setNotice("");
        }} className="input-ui mt-1 block w-full rounded-lg px-3 py-2 text-xs"/>
      </label>
      <button type="submit" disabled={busy || !account} className="panel-soft rounded-lg px-3 py-2 text-xs disabled:opacity-40">Load scopes</button>
    </form>
    {current && <div className="mt-4">
      <p className="text-xs text-muted">Current scopes for {current.email}</p>
      {current.scopes.length ? <ul className="my-2 flex flex-wrap gap-2 text-xs" aria-label="Existing account scopes">
        {current.scopes.map(item => <li key={item.kind+":"+item.value} className="panel-soft rounded px-2 py-1">{item.kind}:{item.value}</li>)}
      </ul> : <p className="my-2 text-xs text-muted">No scopes assigned.</p>}
      <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">Scope type
          <select value={kind} disabled={busy} onChange={event => setKind(event.target.value)} className="input-ui mt-1 block rounded-lg px-3 py-2 text-xs">
            <option value="department">Department</option><option value="project">Project</option>
          </select>
        </label>
        <label className="min-w-0 flex-1 text-xs text-muted">Scope value
          <input required value={value} disabled={busy} onChange={event => setValue(event.target.value)} className="input-ui mt-1 block w-full rounded-lg px-3 py-2 text-xs"/>
        </label>
        <button type="submit" disabled={busy || !value.trim()} className="accent-bg rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40">Add scope</button>
      </form>
    </div>}
    {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    {notice && <p role="status" className="mt-2 text-xs text-muted">{notice}</p>}
  </section>;
}
