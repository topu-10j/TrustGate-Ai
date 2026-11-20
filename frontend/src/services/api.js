import axios from "axios";

// Keep both local origins on 127.0.0.1. Auth is cookie-based; never persist tokens in JS.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
export const API_MODE = "real backend";
export const client = axios.create({ baseURL: API_BASE_URL, timeout: 20000, withCredentials: true });

export class ApiError extends Error {
  constructor(message, status, code, details) { super(message); this.name = "ApiError"; this.status = status; this.code = code; this.details = details; }
}
function errorFrom(error) {
  if (!axios.isAxiosError(error)) return error;
  if (error.response) {
    const { status, data } = error.response;
    const message = typeof data?.message === "string" ? data.message : typeof data?.error === "string" ? data.error : typeof data?.error?.message === "string" ? data.error.message : `Backend error (${status}).`;
    return new ApiError(message, status, data?.code || data?.error?.code, data);
  }
  return new ApiError(error.code === "ECONNABORTED" ? "The backend request timed out. Try again." : "Cannot reach TrustGate backend at " + API_BASE_URL + ". Check that it is running.");
}
async function request(method, url, options = {}) {
  try {
    const response = await client.request({ method, url, data: options.data, params: options.params, signal: options.signal, headers: options.headers });
    if (response.status === 204 || response.data == null || response.data === "") return null;
    return response.data;
  } catch (error) { if (axios.isCancel(error)) throw error; throw errorFrom(error); }
}
export const login = (email, password, signal) => request("POST", "/api/auth/login", { data: { email, password }, signal });
export const getCurrentUser = (signal) => request("GET", "/api/auth/me", { signal });
export const logout = (signal) => request("POST", "/api/auth/logout", { signal });
export const sendChat = async (message, signal) => { const data=await request("POST", "/api/chat", { data: { message }, signal }); if(typeof data?.answer!=="string") throw new ApiError("TrustGate returned no chat answer."); return data; };
export const scanPrompt = async (prompt, signal) => { const data=await request("POST", "/api/security/scan", { data: { prompt }, signal }); if(!data || typeof data!=="object") throw new ApiError("TrustGate returned an invalid scan result."); return data; };
export const getAuditEvents = async (signal) => { const data = await request("GET", "/api/audit", { signal }); if (!Array.isArray(data?.events)) throw new ApiError("TrustGate returned an invalid audit log."); return data.events; };
export const getIncidents = async (signal) => { const data = await request("GET", "/api/security/incidents", { signal }); if (!Array.isArray(data?.incidents)) throw new ApiError("TrustGate returned an invalid incidents response."); return data.incidents; };
export const updateIncident = (id, status, signal) => request("PATCH", `/api/security/incidents/${encodeURIComponent(id)}`, { data: { status }, signal });
export const getReadableDocuments = async (signal) => { const data = await request("GET", "/api/documents", { signal }); return Array.isArray(data?.documents) ? data.documents : Array.isArray(data) ? data : []; };
export const getVaultDocuments = async (signal) => { const data = await request("GET", "/api/vault/documents", { signal }); return Array.isArray(data?.documents) ? data.documents : Array.isArray(data) ? data : []; };
export const uploadVaultDocument = (formData, signal) => request("POST", "/api/vault/documents", { data: formData, signal });
export const updateVaultDocument = (id, payload, signal) => request("PATCH", `/api/vault/documents/${encodeURIComponent(id)}`, { data: payload, signal });
export const archiveVaultDocument = (id, signal) => request("POST", `/api/vault/documents/${encodeURIComponent(id)}/archive`, { signal });
export const updateVaultScopes = (id, scopes, signal) => request("POST", `/api/vault/documents/${encodeURIComponent(id)}/scopes`, { data: { scopes }, signal });
export const updateAccountScopes = (email, scopes, signal) => request("POST", "/api/admin/account-scopes", { data: { email, scopes }, signal });
export function openAlertsStream(onIncident, onError) {
  // Native EventSource supports cookies when withCredentials is true; no token is exposed to JS.
  const stream = new EventSource(`${API_BASE_URL}/api/security/alerts`, { withCredentials: true });
  stream.addEventListener("incident", (event) => { try { const payload=JSON.parse(event.data); onIncident(payload?.incident || payload); } catch { onError?.(new Error("Received an invalid incident alert.")); } });
  stream.onerror = () => onError?.(new ApiError("Live alert connection interrupted."));
  return stream;
}
export async function checkBackendConnection(signal) {
  try { await getCurrentUser(signal); return { connected: true, mode: API_MODE, baseUrl: API_BASE_URL }; }
  catch (error) { return { connected: error.status === 401 || error.status === 403, mode: API_MODE, baseUrl: API_BASE_URL, error: error.message }; }
}
