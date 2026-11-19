import axios from "axios";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
export const API_MODE = "local demo";

const client = axios.create({ baseURL: API_BASE_URL, timeout: 10000 });

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, url, { data, token, signal } = {}) {
  try {
    const response = await client.request({
      method,
      url,
      data,
      signal,
      headers: token ? { Authorization: "Bearer " + token } : undefined,
    });
    const body = response.data;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError("TrustGate returned an unexpected response.");
    }
    return body;
  } catch (error) {
    if (axios.isCancel(error) || !axios.isAxiosError(error)) throw error;
    if (error.response) {
      const { status, data } = error.response;
      throw new ApiError(
        typeof data?.message === "string" ? data.message : "Backend error (" + status + ").",
        status,
        data?.code
      );
    }
    throw new ApiError(error.code === "ECONNABORTED"
      ? "The backend request timed out. Try again."
      : "Cannot reach the TrustGate backend. Check that it is running.");
  }
}

export async function createDemoSession(role, signal) {
  const data = await request("POST", "/api/demo/session", { data: { role }, signal });
  if (typeof data.token !== "string" || data.role !== role) {
    throw new ApiError("TrustGate returned an invalid demo session.");
  }
  return data.token;
}

export async function sendChat(message, token, signal) {
  const data = await request("POST", "/api/chat", { data: { message }, token, signal });
  if (typeof data.answer !== "string") throw new ApiError("TrustGate returned no answer.");
  return data.answer;
}

export async function scanPrompt(prompt, token, signal) {
  return request("POST", "/api/security/scan", { data: { prompt }, token, signal });
}

export async function getAuditEvents(token, signal) {
  const data = await request("GET", "/api/audit", { token, signal });
  if (!Array.isArray(data.events)) throw new ApiError("TrustGate returned an invalid audit log.");
  return data.events;
}

export async function checkBackendConnection(signal) {
  try {
    const { ok, mode } = await request("GET", "/health", { signal });
    if (ok !== true) throw new ApiError("The backend is not ready.");
    return { connected: true, mode, baseUrl: API_BASE_URL };
  } catch (error) {
    return { connected: false, mode: API_MODE, baseUrl: API_BASE_URL, error: error.message };
  }
}
