import axios from "axios";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

export const API_MODE = "backend";
export const API_BASE_URL = BASE_URL;

function getErrorMessage(error) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail || error.response?.data?.message;
    if (detail) return String(detail);
    if (error.response) return `API error ${error.response.status}`;
    if (error.code === "ECONNABORTED") return "Backend request timed out";
    return "Backend unavailable. Check that the API server is running.";
  }
  return error instanceof Error ? error.message : "Unexpected API error";
}

function requireObject(data, endpoint) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${endpoint} returned an invalid response`);
  }
  return data;
}

export async function scanPrompt(prompt) {
  try {
    const { data } = await client.post("/api/security/scan", { prompt });
    return requireObject(data, "Security scan");
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function sendChat(message) {
  try {
    const { data } = await client.post("/api/ai/chat", { message });
    return requireObject(data, "AI chat");
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getStats() {
  try {
    const { data } = await client.get("/api/security/stats");
    return requireObject(data, "Security statistics");
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

function normalizeEvent(event, index) {
  return {
    ...event,
    id: event.id || event.event_id || `API-${index + 1}`,
    type: event.type || event.threat || event.event_type || "Security event",
    source: event.source || "Backend API",
    risk: String(event.risk_level || event.risk || "UNKNOWN").toUpperCase(),
    risk_score: event.risk_score,
    decision: String(event.decision || event.action || "UNKNOWN").toUpperCase(),
    timestamp: event.timestamp || event.created_at || null,
    promptPreview: event.prompt_preview || "",
  };
}

export async function getBackendEvents() {
  try {
    const { data } = await client.get("/api/security/events");
    const events = Array.isArray(data) ? data : data?.events || data?.items;
    if (!Array.isArray(events)) {
      throw new Error("Security events returned an invalid response");
    }
    return events.map(normalizeEvent);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function checkBackendConnection() {
  try {
    await getStats();
    return { connected: true, mode: API_MODE, baseUrl: BASE_URL, checkedAt: new Date().toISOString() };
  } catch (error) {
    return {
      connected: false,
      mode: API_MODE,
      baseUrl: BASE_URL,
      checkedAt: new Date().toISOString(),
      error: error.message,
    };
  }
}
