import { randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { findRequestedRecords } from "./catalog.js";
import { canRead, isDemoRole } from "./policy.js";
import { generateAnswer as defaultAnswer } from "./answer.js";
import { createAuditLog } from "./audit.js";
import { scanPrompt as defaultScanner } from "./scanner.js";
import { normalizeEmail, validCredentials } from "./local-accounts.js";
import { readVaultUpload, validateDocumentMetadata, VaultInputError } from "./vault-upload.js";
import { citedDocuments, fallbackGroundedAnswer, followUpQuery, groundedSources, shouldBlockChatScan } from "./grounded-chat.js";
import { streamAlerts } from "./alert-stream.js";
import { normalizedScopes } from "./document-scopes.js";

const BODY_LIMIT = 8 * 1024;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_LIMIT = 300;
const SESSION_COOKIE = "trustgate_session";
const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 8;
const MAX_CONCURRENT_LOGINS = 2;
const MAX_CONCURRENT_UPLOADS = 2;
const DEMO_PATHS = ["/api/demo/session", "/api/chat", "/api/audit", "/api/security/scan"];
const LOGIN_PATHS = ["/api/auth/login", "/api/auth/me", "/api/auth/logout"];
const vaultCollection = "/api/vault/documents";
const vaultItem = /^\/api\/vault\/documents\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(\/archive|\/scopes)?$/i;
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

function sessionCookie(token, maxAge, secureCookies) {
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? "; Secure" : ""}`;
}

function configureCors(req, res, allowedOrigins, loginMode, vaultEnabled) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (!allowedOrigins.has(origin)) {
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "This browser origin is not allowed.");
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", vaultEnabled ? "GET, POST, PATCH, OPTIONS" : "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Last-Event-ID");
  if (loginMode) res.setHeader("Access-Control-Allow-Credentials", "true");
}

export function createServer({
  generateAnswer = defaultAnswer,
  scanPrompt = defaultScanner,
  allowedOrigins = DEFAULT_ORIGINS,
  authenticate,
  accountSource = "local",
  now = Date.now,
  audit = createAuditLog(now),
  vault,
  knowledge,
  generateGrounded = ({ sources }) => fallbackGroundedAnswer(sources),
  allowedHosts = [],
  secureCookies = false,
  disableVaultUploads = false,
  serveFrontend
} = {}) {
  const sessions = new Map();
  const origins = new Set(allowedOrigins);
  const hosts = new Set(allowedHosts);
  const hasKnowledge = accountSource === "postgres" && typeof authenticate === "function" && Boolean(knowledge);
  const loginMode = typeof authenticate === "function";
  const mode = loginMode ? (accountSource === "postgres" ? "postgres-login" : "local-login") : "local-demo";
  let loginWindowStart = now();
  let loginAttempts = 0;
  const vaultEnabled = loginMode && accountSource === "postgres" && Boolean(vault);
  let activeLogins = 0;
  let activeUploads = 0;

  async function useAudit(operation) {
    try {
      return await operation();
    } catch {
      throw new ApiError(503, "AUDIT_UNAVAILABLE", "The audit log is temporarily unavailable.");
    }
  }

  async function useVault(operation) {
    try {
      return await operation();
    } catch {
      throw new ApiError(503, "VAULT_UNAVAILABLE", "The document vault is temporarily unavailable.");
    }
  }

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
    sessions.set(token, { role, email, expiresAt: time + SESSION_TTL_MS, chatRevision: 0 });
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

  async function scanOrThrow(text) {
    try { return await scanPrompt(text); }
    catch { throw new ApiError(503, "SCANNER_UNAVAILABLE", "The scanner is temporarily unavailable."); }
  }

  async function integratedChat(res, session, question, matches, chatRevision, previousQuestion) {
    const { role } = session;
    const warnings = [];
    const addWarning = (stage, scan) => {
      if (scan.decision === "WARN") {
        warnings.push({ stage, code: "SCANNER_WARNING", threats: scan.threats ?? [] });
      }
    };
    const reply = (body) => sendJson(res, 200, warnings.length ? { ...body, warnings } : body);
    if (await useVault(() => knowledge.isChatPaused(session.email, now()))) {
      throw new ApiError(429, "CHAT_COOLDOWN", "Chat is temporarily paused for this session.");
    }
    const input = await scanOrThrow(question);
    if (shouldBlockChatScan(input)) {
      await useAudit(() => audit.record({ role, decision: "denied", reasonCode: "PROMPT_BLOCKED" }));
      if (input.decision === "BLOCK") {
        await useVault(() => knowledge.recordPromptBlock({ email: session.email, role, time: now() }));
      } else {
        await useVault(() => knowledge.recordIncident({ role, type: "PROMPT_BLOCKED", severity: "medium" }));
      }
      throw new ApiError(403, "PROMPT_BLOCKED", "The prompt was blocked by the security scanner.");
    }
    addWarning("input", input);

    const masked = input.masked_prompt.trim().slice(0, 500);
    const bengali = /[\u0980-\u09FF]/u.test(masked);
    if (/^(?:hi|hello|hey|হ্যালো|সালাম)[!.?]*$/iu.test(masked)) {
      const answer = bengali ? "হ্যালো! অনুমোদিত কোম্পানির তথ্য নিয়ে প্রশ্ন করো।" :
        "Hi! Ask me about company information you are allowed to access.";
      return reply({ answer, source: null, sources: [] });
    }
    const lookup = followUpQuery(masked, previousQuestion);
    const rows = await useVault(() => knowledge.search(lookup, role, session.email));
    let sources;
    try { sources = await groundedSources(rows, scanPrompt); }
    catch { throw new ApiError(503, "SCANNER_UNAVAILABLE", "The scanner is temporarily unavailable."); }
    if (!sources.length && !matches.length) {
      const answer = bengali ? "এই প্রশ্নের জন্য কোনো অনুমোদিত কোম্পানি তথ্য পাওয়া যায়নি।" :
        "No approved company source was found for this question.";
      return reply({ answer, source: null, sources: [] });
    }
    await useAudit(() => audit.record({ role, decision: "allowed", reasonCode: "ACCESS_ALLOWED" }));

    let answer;
    let citations;
    try {
      if (sources.length) {
        citations = citedDocuments(sources);
        answer = await generateGrounded({ question: lookup, sources });
      } else {
        citations = matches.map(({ id, title }) => ({ id, title }));
        if (matches.length === 1) {
          const { id, title, content } = matches[0];
          answer = await generateAnswer({ question: masked, record: { id, title, content } });
        } else {
          answer = matches.map(({ content }) => content).join("\n");
        }
      }
      if (typeof answer !== "string" || !answer.trim()) throw new Error("Empty answer");
    } catch {
      throw new ApiError(502, "ANSWER_UNAVAILABLE", "The answer service is unavailable.");
    }
    const output = await scanOrThrow(answer.slice(0, 950));
    if (shouldBlockChatScan(output)) {
      throw new ApiError(502, "ANSWER_BLOCKED", "The answer was blocked by the security scanner.");
    }
    addWarning("output", output);
    if (session.chatRevision === chatRevision) session.lastQuestion = lookup;
    return reply({ answer: output.masked_prompt, source: citations[0], sources: citations });
  }

  return createHttpServer({ requestTimeout: 15_000 }, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Origin");

    try {
      // The supplied CLI listens on loopback. Reject unexpected Host headers as well.
      const host = (req.headers.host ?? "").toLowerCase();
      if (hosts.size ? !hosts.has(host) : !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
        throw new ApiError(400, "INVALID_HOST", "This host is not allowed.");
      }
      configureCors(req, res, origins, loginMode, vaultEnabled);
      const path = req.url.split("?")[0];
      if (serveFrontend?.(req, res, path)) return;
      const vaultMatch = vaultEnabled ? vaultItem.exec(path) : null;
      const isVaultPath = vaultEnabled && (path === vaultCollection || path === "/api/documents" || path === "/api/admin/account-scopes" || Boolean(vaultMatch));

      const incidentMatch = hasKnowledge ? /^\/api\/security\/incidents\/(\d{1,18})$/.exec(path) : null;
      const incidentPath = hasKnowledge && (path === "/api/security/incidents" ||
        path === "/api/security/alerts" || Boolean(incidentMatch));
      const supportedPaths = loginMode
        ? [...DEMO_PATHS.filter((route) => route !== "/api/demo/session"), ...LOGIN_PATHS]
        : DEMO_PATHS;
      const chatResetPath = hasKnowledge && path === "/api/chat/reset";
      if (req.method === "OPTIONS" && (supportedPaths.includes(path) || isVaultPath || incidentPath || chatResetPath)) {
        res.writeHead(204);
        return res.end();
      }

      if (req.method === "GET" && path === "/health") {
        return sendJson(res, 200, { ok: true, mode });
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
        res.setHeader("Set-Cookie", sessionCookie(token, SESSION_TTL_MS / 1000, secureCookies));
        return sendJson(res, 200, { user: { email: account.email, role: account.role } });
      }

      if (loginMode && req.method === "GET" && path === "/api/auth/me") {
        const { email, role } = requireSession(req);
        return sendJson(res, 200, { user: { email, role } });
      }

      if (loginMode && req.method === "POST" && path === "/api/auth/logout") {
        const token = accountSessionToken(req);
        if (token) sessions.delete(token);
        res.setHeader("Set-Cookie", sessionCookie("", 0, secureCookies));
        res.writeHead(204);
        return res.end();
      }

      if (incidentPath) {
        const current = requireSession(req);
        if (current.role !== "admin") {
          throw new ApiError(403, "ACCESS_DENIED", "Only an Admin can view incidents.");
        }
        if (req.method === "GET" && path === "/api/security/incidents") {
          return sendJson(res, 200, { incidents: await useVault(() => knowledge.listIncidents()) });
        }
        if (req.method === "GET" && path === "/api/security/alerts") {
          const token = accountSessionToken(req);
          if (!streamAlerts(req, res, knowledge, () => sessions.get(token) === current && current.expiresAt > now())) {
            throw new ApiError(429, "ALERT_STREAM_LIMIT", "Too many open alert streams.");
          }
          return;
        }
        if (req.method === "PATCH" && incidentMatch) {
          const status = await readJson(req, "status");
          if (!["acknowledged", "resolved"].includes(status)) {
            throw new ApiError(400, "INVALID_INCIDENT_STATUS", "Use acknowledged or resolved.");
          }
          const incident = await useVault(() => knowledge.updateIncident(incidentMatch[1], status));
          if (!incident) throw new ApiError(404, "INCIDENT_NOT_FOUND", "Incident not found.");
          return sendJson(res, 200, { incident });
        }
        throw new ApiError(404, "NOT_FOUND", "API endpoint not found.");
      }

      if (isVaultPath) {
        const { role, email } = requireSession(req);
        if (path === "/api/documents" && req.method === "GET") {
          return sendJson(res, 200, { documents: await useVault(() => vault.listReadable(role, email)) });
        }
        if (role !== "admin") {
          throw new ApiError(403, "ACCESS_DENIED", "Only an Admin can manage the document vault.");
        }
        if (path === vaultCollection && req.method === "GET") {
          return sendJson(res, 200, { documents: await useVault(() => vault.listAdmin()) });
        }
        if (path === vaultCollection && req.method === "POST") {
          if (disableVaultUploads) {
            throw new ApiError(403, "JUDGE_UPLOAD_DISABLED", "New file uploads are disabled in the judging demo.");
          }
          if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
            throw new ApiError(429, "UPLOAD_BUSY", "Too many uploads in progress. Try again shortly.");
          }
          activeUploads++;
          try {
            const upload = await readVaultUpload(req);
            const document = await useVault(() => vault.insert(upload, email));
            return sendJson(res, 201, { document });
          } finally {
            activeUploads--;
          }
        }
        if (vaultMatch && !vaultMatch[2] && req.method === "PATCH") {
          const { title, accessLevel } = await readJson(req, "title", "accessLevel");
          const metadata = validateDocumentMetadata(title, accessLevel);
          const document = await useVault(() => vault.update(vaultMatch[1], metadata));
          if (!document) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document not found.");
          return sendJson(res, 200, { document });
        }
        if (vaultMatch?.[2] === "/scopes" && req.method === "POST") {
          const scopes = normalizedScopes(await readJson(req, "scopes"));
          if (!scopes) throw new ApiError(400, "INVALID_SCOPES", "Use valid department and project codes.");
          const updated = await useVault(() => vault.setDocumentScopes(vaultMatch[1], scopes));
          if (!updated) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document not found.");
          return sendJson(res, 200, { scopes: updated });
        }
        if (path === "/api/admin/account-scopes" && req.method === "GET") {
          const emails = new URLSearchParams(req.url.slice(path.length)).getAll("email");
          const account = normalizeEmail(emails[0]);
          if (emails.length !== 1 || !validCredentials(account, "x")) {
            throw new ApiError(400, "INVALID_EMAIL", "Use one valid account email.");
          }
          const scopes = await useVault(() => vault.getAccountScopes(account));
          if (scopes === null) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "Account not found.");
          return sendJson(res, 200, { email: account, scopes });
        }
        if (path === "/api/admin/account-scopes" && req.method === "POST") {
          const input = await readJson(req, "email", "scopes");
          const account = normalizeEmail(input.email);
          const scopes = normalizedScopes(input.scopes);
          if (!scopes || !validCredentials(account, "x")) throw new ApiError(400, "INVALID_SCOPES", "Use an account email and valid department and project codes.");
          const updated = await useVault(() => vault.setAccountScopes(account, scopes));
          if (!updated) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "Account not found.");
          return sendJson(res, 200, { scopes: updated });
        }
        if (vaultMatch?.[2] === "/archive" && req.method === "POST") {
          const document = await useVault(() => vault.archive(vaultMatch[1]));
          if (!document) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document not found.");
          return sendJson(res, 200, { document });
        }
        throw new ApiError(404, "NOT_FOUND", "API endpoint not found.");
      }

      if (req.method === "GET" && path === "/api/audit") {
        const { role } = requireSession(req);
        if (role !== "admin") {
          throw new ApiError(403, "ACCESS_DENIED", "Only the Admin role can view the audit log.");
        }
        return sendJson(res, 200, { events: await useAudit(() => audit.list()) });
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

      if (req.method === "POST" && chatResetPath) {
        const session = requireSession(req);
        session.chatRevision++;
        delete session.lastQuestion;
        res.writeHead(204);
        return res.end();
      }

      if (req.method === "POST" && path === "/api/chat") {
        const session = requireSession(req);
        const { role, chatRevision, lastQuestion } = session;
        const value = await readJson(req, "message");
        if (typeof value !== "string" || value.trim().length === 0 || value.length > 500) {
          throw new ApiError(400, "INVALID_MESSAGE", "Enter a message of 1–500 characters.");
        }

        const question = value.trim();
        const matches = findRequestedRecords(question);
        if (matches.some(({ access }) => !canRead(role, access))) {
          await useAudit(() => audit.record({ role, decision: "denied", reasonCode: "ACCESS_DENIED" }));
          throw new ApiError(403, "ACCESS_DENIED", "Your demo role cannot access the requested information.");
        }
        if (hasKnowledge) {
          return await integratedChat(res, session, question, matches, chatRevision, lastQuestion);
        }
        if (matches.length !== 1) {
          throw new ApiError(422, "TOPIC_REQUIRED", "Ask about one supported company topic at a time.");
        }

        // The access decision must be recorded before an approved record reaches the provider.
        await useAudit(() => audit.record({ role, decision: "allowed", reasonCode: "ACCESS_ALLOWED" }));
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
      if (error instanceof ApiError || error instanceof VaultInputError) {
        return sendJson(res, error.status, { code: error.code, message: error.message });
      }
      return sendJson(res, 500, { code: "INTERNAL_ERROR", message: "Something went wrong." });
    }
  });
}
