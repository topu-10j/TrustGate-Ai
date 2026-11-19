import { createContext, useCallback, useContext, useEffect, useId, useState } from "react";
import { createDemoSession, getAuditEvents } from "../services/api";

const WorkspaceContext = createContext(null);
export const roleLabels = { intern: "Intern", employee: "Employee", admin: "Admin" };

export function useDemoWorkspace() {
  return useContext(WorkspaceContext);
}

export function DemoWorkspace({ children }) {
  const [selection, setSelection] = useState({ role: "intern", version: 0 });
  const selectRole = (role) => setSelection((current) => role === current.role
    ? current : { role, version: current.version + 1 });
  const restart = () => setSelection((current) => ({ ...current, version: current.version + 1 }));

  return <Session key={selection.version} role={selection.role} selectRole={selectRole} restart={restart}>
    {children}
  </Session>;
}

function Session({ role, selectRole, restart, children }) {
  const [token, setToken] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [audit, setAudit] = useState({ events: [], pending: false, loaded: false, error: "" });
  const [revision, setRevision] = useState(0);
  const refreshAudit = useCallback(() => setRevision((current) => current + 1), []);
  const expire = useCallback(() => {
    setToken("");
    setAudit({ events: [], pending: false, loaded: false, error: "" });
    setSessionError("This demo session expired. Start a new session to continue.");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    createDemoSession(role, controller.signal).then((value) => {
      if (!controller.signal.aborted) setToken(value);
    }).catch((error) => {
      if (!controller.signal.aborted) setSessionError(error.message);
    });
    return () => controller.abort();
  }, [role]);

  useEffect(() => {
    if (role !== "admin" || !token) return;
    const controller = new AbortController();
    setAudit((current) => ({ ...current, pending: true, error: "" }));
    getAuditEvents(token, controller.signal).then((events) => {
      if (!controller.signal.aborted) setAudit({ events, pending: false, loaded: true, error: "" });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error.status === 401) expire();
      else setAudit({ events: [], pending: false, loaded: false, error: error.message });
    });
    return () => controller.abort();
  }, [role, token, revision, expire]);

  const value = { role, token, sessionError, selectRole, restart, expire, audit, refreshAudit };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function DemoRoleSelect() {
  const id = useId();
  const { role, selectRole } = useDemoWorkspace();
  return <div className="panel-soft min-w-[190px] p-3">
    <label htmlFor={id} className="block text-xs font-semibold text-main">Demo role</label>
    <select id={id} value={role} onChange={(event) => selectRole(event.target.value)}
      className="input-ui mt-1.5 block w-full rounded-lg px-3 py-2 text-sm">
      {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <p className="mt-1.5 text-[10px] text-muted">No sign-in required</p>
  </div>;
}

export function useAuditView() {
  const { role, token, audit, sessionError, refreshAudit } = useDemoWorkspace();
  const available = role === "admin" && Boolean(token) && audit.loaded && !audit.error;
  return {
    available,
    pending: role === "admin" && !sessionError && !audit.error && (!token || audit.pending || !audit.loaded),
    error: role === "admin" ? sessionError || audit.error : "",
    events: available ? audit.events : [],
    refresh: refreshAudit,
  };
}
