import assert from "node:assert/strict";
import { test } from "node:test";
import { listenForFetch } from "../test-support/http-server.js";
import { createGeminiAnswerProvider, DEFAULT_GEMINI_MODEL } from "../src/gemini-answer.js";
import { createServer } from "../src/server.js";

const approvedRecord = { id: "office-hours", title: "Office hours", content: "Fictional office hours are 9 AM to 5 PM." };
const providerKey = "test-key-not-real";
const sampleResponse = () => Response.json({
  status: "completed",
  steps: [
    { type: "thought", content: [{ type: "text", text: "Internal thought" }] },
    { type: "model_output", content: [{ type: "text", text: "The office opens at 9 AM." }] }
  ]
});

test("Gemini gets only the approved demo record and a language label", async () => {
  const calls = [];
  const answer = createGeminiAnswerProvider({
    apiKey: providerKey,
    fetchImpl: async (...args) => { calls.push(args); return sampleResponse(); }
  });
  const question = "অফিসের সময় কী? My private note";
  assert.equal(await answer({ question, record: approvedRecord }), "The office opens at 9 AM.");
  assert.equal(calls.length, 1);
  const [url, opts] = calls[0];
  assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(opts.redirect, "error");
  assert.equal(opts.headers["x-goog-api-key"], providerKey);
  assert.equal(opts.headers["Api-Revision"], "2026-05-20");
  assert.ok(opts.signal instanceof AbortSignal);
  const body = JSON.parse(opts.body);
  assert.equal(body.model, DEFAULT_GEMINI_MODEL);
  assert.equal(body.store, false);
  assert.equal(Object.hasOwn(body, "previous_interaction_id"), false);
  assert.deepEqual(JSON.parse(body.input), {
    language: "Bengali", title: approvedRecord.title, content: approvedRecord.content
  });
  assert.doesNotMatch(opts.body, /My private note|test-key-not-real/);
});

test("demo passcodes and files outside the approved topics stay local", async () => {
  let calls = 0;
  const answer = createGeminiAnswerProvider({
    apiKey: providerKey,
    fetchImpl: async () => { calls++; return sampleResponse(); }
  });
  for (const id of ["server-password", "guest-wifi", "future-upload-id"]) {
    assert.equal(await answer({ question: "A private question", record: { id, content: "Local content" } }), "Local content");
  }
  assert.equal(calls, 0);
});

test("Gemini transport and response errors do not include upstream details", async () => {
  const input = { question: "office hours", record: approvedRecord };
  const fixtures = [
    [async () => { throw new Error("Internal request data"); }, /^Could not reach Gemini\.$/],
    [async () => Response.json({ error: "provider details" }, { status: 403 }), /^Gemini rejected the API key or project access\.$/],
    [async () => Response.json({ error: "provider details" }, { status: 429 }), /^Gemini quota or rate limit reached\.$/],
    [async () => Response.json({ status: "failed", error: "provider details" }), /^Gemini did not return an answer\.$/],
    [async () => Response.json({ status: "completed", steps: [] }), /^Gemini did not return an answer\.$/],
    [async () => new Response("not json"), /^Gemini did not return an answer\.$/]
  ];
  for (const [fetchImpl, message] of fixtures) {
    const answer = createGeminiAnswerProvider({ apiKey: providerKey, fetchImpl });
    await assert.rejects(answer(input), (error) => message.test(error.message));
  }
  assert.throws(() => createGeminiAnswerProvider({ apiKey: providerKey, model: "../unsafe" }), /Invalid Gemini model name/);
});

test("HTTP authorization and audit run before any request to Gemini", async (t) => {
  let fetchCalls = 0;
  const auditEntries = [];
  const provider = createGeminiAnswerProvider({
    apiKey: providerKey,
    fetchImpl: async (_url, opts) => {
      fetchCalls++;
      assert.deepEqual(auditEntries.map(({ decision }) => decision), ["denied", "allowed"]);
      const input = JSON.parse(JSON.parse(opts.body).input);
      assert.equal(input.title, "Confidential operating budget");
      assert.match(input.content, /BDT 1,200,000/);
      assert.doesNotMatch(opts.body, /private test note|server passcode/i);
      return sampleResponse();
    }
  });
  const server = createServer({
    generateAnswer: provider,
    accountSource: "postgres",
    audit: { async record(entry) { auditEntries.push(entry); } },
    authenticate: async (email) => ({ role: email.split("@")[0], email })
  });
  const base = await listenForFetch(t, server);
  const post = (path, value, cookie) => fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify(value)
  });
  const logIn = async (role) => {
    const result = await post("/api/auth/login", { email: role + "@trustgate.example", password: "test" });
    assert.equal(result.status, 200);
    return result.headers.get("set-cookie").split(";")[0];
  };
  const question = { message: "What is the budget? private test note" };
  assert.equal((await post("/api/chat", question, await logIn("intern"))).status, 403);
  assert.equal(fetchCalls, 0);
  const approved = await post("/api/chat", question, await logIn("admin"));
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).source.id, "confidential-budget");
  assert.equal(fetchCalls, 1);
});
