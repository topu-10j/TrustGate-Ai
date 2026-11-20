import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getCurrentUser, getAuditEvents, login as apiLogin, logout as apiLogout } from "../services/api";

const WorkspaceContext = createContext(null);
export const roleLabels = { intern: "Intern", employee: "Employee", admin: "Admin" };
export function useWorkspace() { return useContext(WorkspaceContext); }

function stableEventKey(event) { return event.id ? String(event.id) : [event.timestamp, event.role, event.decision, event.reasonCode].join("|"); }
function normalizeUser(user) { if (!user || !["intern", "employee", "admin"].includes(user.role)) throw new Error("Backend returned an invalid user role."); return user; }

export function AuthWorkspace({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [audit, setAudit] = useState({ events: [], pending: false, loaded: false, error: "", lastUpdated: null });
  const [newEvents, setNewEvents] = useState([]);
  const [revision, setRevision] = useState(0);
  const knownAuditKeys = useRef(new Set());
  const firstAuditLoad = useRef(false);
  const refreshAudit = useCallback(() => setRevision((n) => n + 1), []);
  const clearNewEvents = useCallback(() => setNewEvents([]), []);

  const clearPrivate = useCallback(() => {
    setAudit({ events: [], pending: false, loaded: false, error: "", lastUpdated: null });
    setNewEvents([]); knownAuditKeys.current = new Set(); firstAuditLoad.current = false;
  }, []);
  const restore = useCallback(async (signal) => {
    try { const data = await getCurrentUser(signal); if (!signal?.aborted) setUser(normalizeUser(data?.user)); }
    catch (error) { if (!signal?.aborted && error.status !== 401) setAuthError(error.message); }
    finally { if (!signal?.aborted) setAuthLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); restore(controller.signal); return () => controller.abort(); }, [restore]);

  const signIn = useCallback(async (email, password) => {
    setAuthError(""); setAuthLoading(true); clearPrivate();
    try { const data = await apiLogin(email, password); setUser(normalizeUser(data?.user)); return data.user; }
    catch (error) { setUser(null); setAuthError(error.message); throw error; }
    finally { setAuthLoading(false); }
  }, [clearPrivate]);
  const signOut = useCallback(async () => {
    setAuthLoading(true);
    try { await apiLogout(); setAuthError(""); }
    catch (error) { setAuthError(error.status === 401 ? "Session already expired." : `Could not confirm server sign-out: ${error.message}`); }
    finally { setUser(null); clearPrivate(); setAuthLoading(false); }
  }, [clearPrivate]);
  const expire = useCallback(() => { setUser(null); clearPrivate(); setAuthError("Your session expired. Please sign in again."); }, [clearPrivate]);

  useEffect(() => {
    if (user?.role !== "admin") { clearPrivate(); return; }
    const controller = new AbortController(); let inFlight = false;
    const load = async () => {
      if (inFlight || controller.signal.aborted) return; inFlight = true;
      setAudit((a) => ({ ...a, pending: !a.loaded, error: "" }));
      try {
        const events = await getAuditEvents(controller.signal); if (controller.signal.aborted) return;
        const keys = new Set(events.map(stableEventKey));
        if (firstAuditLoad.current) { const incoming = events.filter(e => !knownAuditKeys.current.has(stableEventKey(e))); if (incoming.length) setNewEvents(a => [...incoming, ...a].slice(0, 30)); }
        knownAuditKeys.current = keys; firstAuditLoad.current = true;
        setAudit({ events, pending: false, loaded: true, error: "", lastUpdated: new Date().toISOString() });
      } catch (error) { if (controller.signal.aborted) return; if (error.status === 401) expire(); else setAudit(a => ({ ...a, pending: false, error: error.message })); }
      finally { inFlight = false; }
    };
    load(); const timer = window.setInterval(load, 4000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [user?.role, revision, clearPrivate, expire]);

  const value = { user, role: user?.role || null, email: user?.email || "", authLoading, authError, signIn, signOut, expire, sessionError: authError, audit, refreshAudit, newEvents, clearNewEvents, active: Boolean(user) };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useAuditView() {
  const { role, user, audit, authError, refreshAudit, newEvents, clearNewEvents } = useWorkspace();
  const available = role === "admin" && Boolean(user) && audit.loaded && !audit.error;
  return { available, canRefresh: role === "admin" && Boolean(user), pending: role === "admin" && !authError && !audit.error && (!audit.loaded || audit.pending), error: role === "admin" ? authError || audit.error : "", events: available ? audit.events : [], refresh: refreshAudit, newEvents: role === "admin" ? newEvents : [], clearNewEvents, lastUpdated: audit.lastUpdated };
}
