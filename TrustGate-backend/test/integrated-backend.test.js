import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "../src/server.js";
import { listenForFetch } from "../test-support/http-server.js";
import { deploymentConfig } from "../src/deployment.js";
import { splitDocument, retrievalTerms, createPostgresKnowledge } from "../src/postgres-knowledge.js";
import { readSlackMessages } from "../src/slack-reader.js";
import { scanAndExtract } from "../src/vault-worker.js";
import { createGeminiGroundedProvider } from "../src/gemini-answer.js";
import { access, readFile } from "node:fs/promises";

function scan(text) {
  const decision = text.includes("BLOCK_FIXTURE") ? "BLOCK" : "ALLOW";
  return { decision, masked_prompt: text.replaceAll("demo@example.com", "[MASKED_EMAIL]") };
}

async function setup(t, options = {}) {
  const incidents = [];
  const strikes = new Map();
  const knowledge = {
    search: async () => [],
    async isChatPaused(email) { return (strikes.get(email) ?? 0) >= 2; },
    async recordIncident(event) { this.addIncident(event); },
    async recordPromptBlock({ role, email }) {
      strikes.set(email, (strikes.get(email) ?? 0) + 1);
      this.addIncident({ type: "PROMPT_BLOCKED", role });
      if (strikes.get(email) === 2) this.addIncident({ type: "CHAT_COOLDOWN", role });
    },
    addIncident(event) { incidents.push({ id: String(incidents.length + 1), status: "open", ...event }); },
    async listIncidents(after) { return after === undefined ? incidents : incidents.filter(row => Number(row.id) > Number(after)); },
    async updateIncident(id, status) {
      const item = incidents.find(row => row.id === id);
      if (!item) return null;
      item.status = status;
      return item;
    },
    ...options.knowledge
  };
  const server = createServer({
    authenticate: async (email) => ({ email, role: email.split("@")[0] }),
    accountSource: "postgres",
    scanPrompt: async (text) => scan(text),
    ...options,
    knowledge
  });
  const base = await listenForFetch(t, server);
  const request = (path, options) => fetch(base + path, options);
  const json = (method, value, cookie) => ({
    method, headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify(value)
  });
  async function login(role) {
    const result = await request("/api/auth/login", json("POST", { email: role + "@example.org", password: "test-only" }));
    assert.equal(result.status, 200);
    const cookie = result.headers.get("set-cookie").split(";")[0];
    return {
      get: (path, signal) => request(path, { headers: { Cookie: cookie }, signal }),
      chat: (message) => request("/api/chat", json("POST", { message }, cookie)),
      post: (path, value) => request(path, json("POST", value, cookie)),
      patch: (path, value) => request(path, json("PATCH", value, cookie))
    };
  }
  return { login, incidents, request };
}

test("judging viewer permits chat and Admin history but blocks Vault and incident edits", async (t) => {
  const api = await setup(t, {
    readOnlyVault: true,
    readOnlyIncidents: true,
    vault: { async listAdmin() { return []; } }
  });
  const admin = await api.login("admin");
  const intern = await api.login("intern");
  assert.equal((await admin.chat("Where is the orientation?")).status, 200);
  await intern.chat("BLOCK_FIXTURE");
  const list = await admin.get("/api/security/incidents");
  assert.equal(list.status, 200);
  assert.equal((await list.json()).incidents[0].status, "open");
  const edit = await admin.patch("/api/security/incidents/1", { status: "resolved" });
  assert.equal(edit.status, 403);
  assert.equal((await edit.json()).code, "JUDGE_INCIDENTS_READ_ONLY");
  assert.equal(api.incidents[0].status, "open");
  assert.equal((await admin.get("/api/vault/documents")).status, 200);
  const upload = await admin.post("/api/vault/documents", {});
  assert.equal(upload.status, 403);
  assert.equal((await upload.json()).code, "JUDGE_VAULT_READ_ONLY");
  assert.equal((await admin.post("/api/admin/account-scopes", {})).status, 403);
});

test("grounded chat passes only masked question and approved excerpts, and cites source IDs locally", async (t) => {
  const calls = [];
  const api = await setup(t, {
    knowledge: {
      async search(question, role) {
        assert.equal(role, "employee");
        assert.ok(!question.includes("demo@example.com"));
        return [
          { id: "approved", title: "Handbook", body: "Remote work is allowed on Tuesdays. Ask demo@example.com." },
          { id: "blocked", title: "Bad fixture", body: "BLOCK_FIXTURE" }
        ];
      }
    },
    generateGrounded: async (request) => { calls.push(request); return "Use demo@example.com on Tuesdays."; }
  });
  const employee = await api.login("employee");
  const result = await employee.chat("Remote work questions for demo@example.com?");
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    answer: "Use [MASKED_EMAIL] on Tuesdays.",
    source: { id: "approved", title: "Handbook" },
    sources: [{ id: "approved", title: "Handbook" }]
  });
  const followUp = await employee.chat("Tell me more!");
  assert.equal(followUp.status, 200);
  assert.match(calls[1].question, /Remote work.*Tell me more/);
  assert.equal(calls[0].sources.length, 1);
  assert.doesNotMatch(JSON.stringify(calls), /demo@example.com|BLOCK_FIXTURE/);
  const denied = await employee.chat("What is the confidential budget?");
  assert.equal(denied.status, 403);
  assert.equal(calls.length, 2);
});

test("chat reset needs a valid session and clears context only for that session", async (t) => {
  const api = await setup(t, { knowledge: {
    async search(question) {
      return question.includes("Orientation") ? [{ id: "fixture", title: "Museum note", body: "Orientation is Tuesday." }] : [];
    }
  } });
  assert.equal((await api.request("/api/chat/reset", { method: "POST" })).status, 401);
  const preflight = await api.request("/api/chat/reset", { method: "OPTIONS", headers: {
    Origin: "http://127.0.0.1:5173", "Access-Control-Request-Method": "POST"
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
  const [intern, employee] = await Promise.all([api.login("intern"), api.login("employee")]);
  for (const account of [intern, employee]) {
    assert.equal((await (await account.chat("Orientation details")).json()).source.id, "fixture");
    assert.equal((await (await account.chat("Tell me more")).json()).source.id, "fixture");
  }
  const reset = await intern.post("/api/chat/reset");
  assert.equal(reset.status, 204);
  assert.equal(await reset.text(), "");
  assert.equal((await intern.get("/api/auth/me")).status, 200);
  assert.deepEqual((await (await intern.chat("Tell me more")).json()).sources, []);
  assert.equal((await (await employee.chat("Tell me more")).json()).source.id, "fixture");
});

test("an in-flight answer cannot restore an old chat context after reset", async (t) => {
  let arrived, release;
  const generating = new Promise(resolve => { arrived = resolve; });
  const continueAnswer = new Promise(resolve => { release = resolve; });
  const api = await setup(t, {
    knowledge: { async search(question) {
      return question.includes("Orientation") ? [{ id: "fixture", title: "Museum note", body: "Orientation is Tuesday." }] : [];
    } },
    async generateGrounded() { arrived(); await continueAnswer; return "Orientation is Tuesday."; }
  });
  const intern = await api.login("intern");
  const inFlight = intern.chat("Orientation details");
  try {
    await Promise.race([generating, inFlight.then(() => { throw new Error("Expected provider to pause"); })]);
    assert.equal((await intern.post("/api/chat/reset")).status, 204);
  } finally { release(); }
  assert.equal((await inFlight).status, 200);
  assert.deepEqual((await (await intern.chat("Tell me more")).json()).sources, []);
});

test("confirmed scanner blocks cause a cooldown and Admin-only persisted incident API and stream", async (t) => {
  const api = await setup(t);
  const intern = await api.login("intern");
  const admin = await api.login("admin");
  for (let i = 0; i < 2; i++) {
    const result = await intern.chat("BLOCK_FIXTURE");
    assert.equal(result.status, 403);
    assert.equal((await result.json()).code, "PROMPT_BLOCKED");
  }
  const reLogged = await api.login("intern");
  const cool = await reLogged.chat("hello");
  assert.equal(cool.status, 429);
  assert.equal((await cool.json()).code, "CHAT_COOLDOWN");
  assert.equal((await intern.get("/api/security/incidents")).status, 403);
  assert.equal((await intern.get("/api/security/alerts")).status, 403);
  const stored = await (await admin.get("/api/security/incidents")).json();
  assert.deepEqual(stored.incidents.map(({ type }) => type), ["PROMPT_BLOCKED", "PROMPT_BLOCKED", "CHAT_COOLDOWN"]);
  assert.doesNotMatch(JSON.stringify(stored), /BLOCK_FIXTURE|@example\.org/);
  const update = await admin.patch("/api/security/incidents/1", { status: "acknowledged" });
  assert.equal((await update.json()).incident.status, "acknowledged");
  const signal = AbortSignal.timeout(2000);
  const stream = await admin.get("/api/security/alerts", signal);
  assert.match(stream.headers.get("content-type"), /text\/event-stream/);
  const reader = stream.body.getReader();
  try {
    let text = "";
    while (!text.includes("CHAT_COOLDOWN")) {
      const value = await reader.read();
      assert.equal(value.done, false);
      text += new TextDecoder().decode(value.value);
    }
    assert.match(text, /event: incident/);
  } finally {
    await reader.cancel();
  }
});

test("integrated chat blocks instruction WARNs, reports other WARNs, and keeps scanner scoring unchanged", async (t) => {
  const calls = [];
  const api = await setup(t, {
    async scanPrompt(text) {
      const threats = /INSTRUCTION_FIXTURE/.test(text) ? ["PROMPT_INJECTION"] :
        /SENSITIVE_FIXTURE/.test(text) ? ["PASSWORD"] : [];
      return { decision: threats.length ? "WARN" : "ALLOW", threats,
        masked_prompt: text.replaceAll("SENSITIVE_FIXTURE", "[MASKED_PASSWORD]") };
    },
    knowledge: { async search() {
      return [{ id: "excluded", title: "Other note", body: "INSTRUCTION_FIXTURE" },
        { id: "approved", title: "Handbook", body: "Museum tours start at noon." }];
    } },
    async generateGrounded(request) {
      calls.push(request);
      return request.question.includes("Check output") ? "INSTRUCTION_FIXTURE" : "Museum tours start at noon. SENSITIVE_FIXTURE";
    }
  });
  const intern = await api.login("intern");
  const standalone = await intern.post("/api/security/scan", { prompt: "INSTRUCTION_FIXTURE" });
  assert.equal((await standalone.json()).decision, "WARN");
  for (let i = 0; i < 2; i++) {
    const blocked = await intern.chat("INSTRUCTION_FIXTURE");
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, "PROMPT_BLOCKED");
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(api.incidents.map(({ type, severity }) => [type, severity]),
    [["PROMPT_BLOCKED", "medium"], ["PROMPT_BLOCKED", "medium"]]);

  const allowed = await intern.chat("Museum tours SENSITIVE_FIXTURE");
  assert.equal(allowed.status, 200);
  const result = await allowed.json();
  assert.match(result.answer, /\[MASKED_PASSWORD\]/);
  assert.deepEqual(result.sources, [{ id: "approved", title: "Handbook" }]);
  assert.deepEqual(result.warnings, ["input", "output"].map((stage) => ({ stage, code: "SCANNER_WARNING", threats: ["PASSWORD"] })));
  assert.doesNotMatch(JSON.stringify(calls), /INSTRUCTION_FIXTURE|SENSITIVE_FIXTURE/);
  const blockedOutput = await intern.chat("Check output");
  assert.equal(blockedOutput.status, 502);
  assert.equal((await blockedOutput.json()).code, "ANSWER_BLOCKED");
});

test("Slack import reads only a validated channel, limits messages and omits token from URL", async () => {
  const messages = await readSlackMessages({
    token: "xoxb-test_only",
    channel: "C123456789",
    async fetchImpl(url, options) {
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://slack.com");
      assert.equal(parsed.pathname, "/api/conversations.history");
      assert.equal(parsed.searchParams.get("limit"), "15");
      assert.equal(options.headers.Authorization, "Bearer xoxb-test_only");
      assert.doesNotMatch(url, /xoxb/);
      return Response.json({ ok: true, messages: [
        { type: "message", text: "Team office note", ts: "1234567890.000001" },
        { type: "message", subtype: "file_share", ts: "1234567890.000002", text: "Attachments ignored" }
      ] });
    }
  });
  assert.deepEqual(messages.map(({ sourceKey, text }) => [sourceKey, text]), [
    ["C123456789:1234567890.000001", "Team office note"]
  ]);
  await assert.rejects(readSlackMessages({ token: "xoxb-test_only", channel: "https://example.org" }), /channel ID/);
});

test("worker never extracts on a rejected or unavailable scanner and cleans its private temp copy", async () => {
  const fixture = { filename: "sample.pdf", mime_type: "application/pdf", content: Buffer.from("clean local fixture") };
  let scannerPath;
  let calls = 0;
  const result = await scanAndExtract(fixture, {
    env: { TRUSTGATE_CLAMSCAN: "test-scanner", GEMINI_API_KEY: "not forwarded", PGPASSWORD: "not forwarded" },
    async execute(command, args, options) {
      calls++;
      assert.equal(command, "test-scanner");
      assert.equal(Object.hasOwn(options.env, "PGPASSWORD"), false);
      scannerPath = args.at(-1);
      assert.deepEqual(await readFile(scannerPath), fixture.content);
      throw Object.assign(new Error("scanner test fixture"), { code: 1 });
    }
  });
  assert.deepEqual(result, { rejected: true, text: "" });
  assert.equal(calls, 1);
  await assert.rejects(access(scannerPath), { code: "ENOENT" });
  await assert.rejects(scanAndExtract(fixture, {
    async execute() { throw Object.assign(new Error("not installed"), { code: "ENOENT" }); }
  }), /Nothing was released/);
});

test("retrieval preserves role/scan filters with optional vector ranking", async () => {
  assert.ok(splitDocument("Policy. ".repeat(150)).every(chunk => chunk.length <= 740));
  assert.deepEqual(retrievalTerms("অফিসের সময় কী? what is office hours?"), ["অফিসের", "সময়".normalize("NFC"), "office", "hours"]);
  const calls = [];
  const store = await createPostgresKnowledge({
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [], rowCount: 1 };
    }
  }, { embed: async () => [Array(384).fill(0.1)] });
  await store.search("Office hours", "intern", "intern@example.org");
  const { sql, values } = calls.at(-1);
  assert.match(sql, /scan_status = 'clean' AND d.archived_at IS NULL/);
  assert.match(sql, /access_level = ANY/);
  assert.match(sql, /<=> \$4::vector/);
  assert.deepEqual(values[1], ["public"]);
  assert.equal(values[2], "intern@example.org");
  assert.equal(JSON.parse(values[3]).length, 384);
  assert.match(sql, /FROM trustgate_document_scopes required/);
});

test("network configuration requires explicit hosts, HTTPS and PostgreSQL; local stays unchanged", () => {
  assert.equal(deploymentConfig({}, false).bindHost, "127.0.0.1");
  assert.throws(() => deploymentConfig({ TRUSTGATE_BIND_HOST: "0.0.0.0" }, true), /requires PostgreSQL/);
  const config = deploymentConfig({
    TRUSTGATE_BIND_HOST: "0.0.0.0", TRUSTGATE_ALLOWED_HOSTS: "api.example.org",
    FRONTEND_ORIGIN: "https://app.example.org"
  }, true);
  assert.equal(config.secureCookies, true);
  assert.deepEqual(config.allowedHosts, ["api.example.org"]);
});

test("Gemini document request omits document IDs and keeps the exchange stateless", async () => {
  const provider = createGeminiGroundedProvider({
    apiKey: "test-only",
    async fetchImpl(_url, options) {
      const payload = JSON.parse(options.body);
      assert.equal(payload.store, false);
      assert.deepEqual(JSON.parse(payload.input), {
        question: "When is orientation?", sources: [{ title: "Handbook", text: "Orientation is Monday." }]
      });
      return Response.json({ status: "completed", steps: [
        { type: "model_output", content: [{ type: "text", text: "Orientation is Monday." }] }
      ] });
    }
  });
  assert.equal(await provider({
    question: "When is orientation?",
    sources: [{ id: "private-record-id", title: "Handbook", text: "Orientation is Monday." }]
  }), "Orientation is Monday.");
});

test("alternate OpenAI provider receives only source excerpts and ignores non-message output", async () => {
  const { createOpenAIProviders } = await import("../src/openai-answer.js");
  let calls = 0;
  const provider = createOpenAIProviders({
    apiKey: "test-only",
    async fetchImpl(url, options) {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      const payload = JSON.parse(options.body);
      assert.equal(payload.store, false);
      assert.deepEqual(JSON.parse(payload.input), {
        question: "Orientation?", sources: [{ title: "Handbook", text: "Monday" }]
      });
      return Response.json({ status: "completed", output: [
        { type: "reasoning", content: [{ type: "output_text", text: "Not shown" }] },
        { type: "message", role: "assistant", content: [{ type: "output_text", text: "Monday" }] }
      ] });
    }
  });
  assert.equal(await provider.generateAnswer({ record: { id: "server-password", content: "Local" }, question: "test" }), "Local");
  assert.equal(await provider.generateGrounded({
    question: "Orientation?", sources: [{ id: "never sent", title: "Handbook", text: "Monday" }]
  }), "Monday");
  assert.equal(calls, 1);
});
