import { randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { findRequestedRecords } from "./catalog.js";
import { canRead, isDemoRole } from "./policy.js";
import { generateAnswer as defaultAnswer } from "./answer.js";
import { createAuditLog } from "./audit.js";
import { scanPrompt as defaultScanner } from "./scanner.js";
import { normalizeEmail, validCredentials } from "./local-accounts.js";

const BODY_LIMIT = 8 * 1024;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_LIMIT = 300;
const SESSION_COOKIE = "trustgate_session";
const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 8;
const MAX_CONCURRENT_LOGINS = 2;
const DEMO_PATHS = ["/api/demo/session", "/api/chat", "/api/audit", "/api/security/scan"];
const LOGIN_PATHS = ["/api/auth/login", "/api/auth/me", "/api/auth/logout"];
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function readJson(req, ...keys) {
  const contentType = req.headers["content-type"]?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiError(415, "EXPECTED_JSON", "Send Content-Type: application/json.");
  }
  const tooLarge = () => new ApiError(413, "BODY_TOO_LARGE", "Request body exceeds 8 KB.");
  if (Number(req.headers["content-length"]) > BODY_LIMIT) throw tooLarge();
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw tooLarge();
    chunks.push(chunk);
  }

  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must contain valid JSON.");
  }

  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== keys.length || !keys.every((key) => Object.hasOwn(input, key))) {
    throw new ApiError(400, "INVALID_REQUEST", `Expected only these fields: ${keys.join(", ")}.`);
  }
  return keys.length === 1 ? input[keys[0]] : input;
}

function accountSessionToken(req) {
  const values = (req.headers.cookie ?? "").split(";").map((part) => part.trim())
    .filter((part) => part.startsWith(SESSION_COOKIE + "="));
  if (values.length !== 1) return undefined;
  const value = values[0].slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

function configureCors(req, res, allowedOrigins, loginMode) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (!allowedOrigins.has(origin)) {
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "This browser origin is not allowed.");
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (loginMode) res.setHeader("Access-Control-Allow-Credentials", "true");
}

export function createServer({
  generateAnswer = defaultAnswer,
  scanPrompt = defaultScanner,
  allowedOrigins = DEFAULT_ORIGINS,
  authenticate,
  now = Date.now
} = {}) {
  const sessions = new Map();
  const origins = new Set(allowedOrigins);
  const audit = createAuditLog(now);
  const loginMode = typeof authenticate === "function";
  let loginWindowStart = now();
  let loginAttempts = 0;
  let activeLogins = 0;

  // One process-local limit is sufficient for the loopback-only login milestone.
  async function checkLogin(email, password) {
    const time = now();
    if (time - loginWindowStart >= LOGIN_WINDOW_MS) {
      loginWindowStart = time;
      loginAttempts = 0;
    }
    if (loginAttempts >= LOGIN_ATTEMPT_LIMIT || activeLogins >= MAX_CONCURRENT_LOGINS) {
      throw new ApiError(429, "LOGIN_RATE_LIMIT", "Too many login attempts. Try again shortly.");
    }
    loginAttempts += 1;
    activeLogins += 1;
    try {
      return await authenticate(email, password);
    } finally {
      activeLogins -= 1;
    }
  }

  function issueSession(role, email) {
    const time = now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= time) sessions.delete(token);
    }
    if (sessions.size >= SESSION_LIMIT) {
      throw new ApiError(429, "SESSION_LIMIT", "Too many active sessions.");
    }
    const token = randomBytes(32).toString("base64url");
    sessions.set(token, { role, email, expiresAt: time + SESSION_TTL_MS });
    return token;
  }

  function requireSession(req) {
    const token = loginMode
      ? accountSessionToken(req)
      : /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.headers.authorization ?? "")?.[1];
    const session = sessions.get(token);
    if (!session || session.expiresAt <= now()) {
      if (token) sessions.delete(token);
      throw new ApiError(401, "SESSION_REQUIRED", loginMode
        ? "Sign in to start a session."
        : "Select a demo role to start a new session.");
    }
    return session;
  }

  return createHttpServer({ requestTimeout: 15_000 }, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Origin");

    try {
      // The supplied CLI listens on loopback. Reject unexpected Host headers as well.
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(req.headers.host ?? "")) {
        throw new ApiError(400, "INVALID_HOST", "Use localhost or 127.0.0.1 for this demo.");
      }
      configureCors(req, res, origins, loginMode);
      const path = req.url.split("?")[0];

      const supportedPaths = loginMode
        ? [...DEMO_PATHS.filter((route) => route !== "/api/demo/session"), ...LOGIN_PATHS]
        : DEMO_PATHS;
      if (req.method === "OPTIONS" && supportedPaths.includes(path)) {
        res.writeHead(204);
        return res.end();
      }

      if (req.method === "GET" && path === "/health") {
        return sendJson(res, 200, { ok: true, mode: loginMode ? "local-login" : "local-demo" });
      }

      if (loginMode && req.method === "POST" && path === "/api/auth/login") {
        const input = await readJson(req, "email", "password");
        const email = normalizeEmail(input.email);
        if (!validCredentials(email, input.password)) {
          throw new ApiError(400, "INVALID_CREDENTIALS_FORMAT", "Enter a valid email and password.");
        }
        const account = await checkLogin(email, input.password);
        if (!account) {
          throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
        }
        const previous = accountSessionToken(req);
        if (previous) sessions.delete(previous);
        const token = issueSession(account.role, account.email);
        res.setHeader("Set-Cookie", sessionCookie(token, SESSION_TTL_MS / 1000));
        return sendJson(res, 200, { user: { email: account.email, role: account.role } });
      }

      if (loginMode && req.method === "GET" && path === "/api/auth/me") {
        const { email, role } = requireSession(req);
        return sendJson(res, 200, { user: { email, role } });
      }

      if (loginMode && req.method === "POST" && path === "/api/auth/logout") {
        const token = accountSessionToken(req);
        if (token) sessions.delete(token);
        res.setHeader("Set-Cookie", sessionCookie("", 0));
        res.writeHead(204);
        return res.end();
      }

      if (req.method === "GET" && path === "/api/audit") {
        const { role } = requireSession(req);
        if (role !== "admin") {
          throw new ApiError(403, "ACCESS_DENIED", "Only the Admin role can view the audit log.");
        }
        return sendJson(res, 200, { events: audit.list() });
      }

      if (!loginMode && req.method === "POST" && path === "/api/demo/session") {
        const role = await readJson(req, "role");
        if (!isDemoRole(role)) {
          throw new ApiError(400, "INVALID_ROLE", "Use intern, employee, or admin.");
        }
        const token = issueSession(role);
        return sendJson(res, 201, { token, role, expiresInSeconds: SESSION_TTL_MS / 1000 });
      }

      if (req.method === "POST" && path === "/api/security/scan") {
        requireSession(req);
        const prompt = await readJson(req, "prompt");
        if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 1000) {
          throw new ApiError(400, "INVALID_PROMPT", "Enter a prompt of 1–1,000 characters.");
        }
        let result;
        try {
          result = await scanPrompt(prompt);
        } catch {
          throw new ApiError(503, "SCANNER_UNAVAILABLE", "The Python scanner is unavailable. Check the backend setup.");
        }
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && path === "/api/chat") {
        const { role } = requireSession(req);
        const value = await readJson(req, "message");
        if (typeof value !== "string" || value.trim().length === 0 || value.length > 500) {
          throw new ApiError(400, "INVALID_MESSAGE", "Enter a message of 1–500 characters.");
        }

        const question = value.trim();
        const matches = findRequestedRecords(question);
        if (matches.some(({ access }) => !canRead(role, access))) {
          audit.record({ role, decision: "denied", reasonCode: "ACCESS_DENIED" });
          throw new ApiError(403, "ACCESS_DENIED", "Your demo role cannot access the requested information.");
        }
        if (matches.length !== 1) {
          throw new ApiError(422, "TOPIC_REQUIRED", "Ask about one supported company topic at a time.");
        }

        // Authorization above must succeed before any answer provider sees this record.
        audit.record({ role, decision: "allowed", reasonCode: "ACCESS_ALLOWED" });
        const { id, title, content } = matches[0];
        let answer;
        try {
          answer = await generateAnswer({ question, record: { id, title, content } });
          if (typeof answer !== "string" || !answer.trim()) throw new Error("No answer");
        } catch {
          throw new ApiError(502, "ANSWER_UNAVAILABLE", "The answer service is unavailable.");
        }
        return sendJson(res, 200, { answer, source: { id, title } });
      }

      throw new ApiError(404, "NOT_FOUND", "API endpoint not found.");
    } catch (error) {
      req.resume();
      if (error instanceof ApiError) {
        return sendJson(res, error.status, { code: error.code, message: error.message });
      }
      return sendJson(res, 500, { code: "INTERNAL_ERROR", message: "Something went wrong." });
    }
  });
}
