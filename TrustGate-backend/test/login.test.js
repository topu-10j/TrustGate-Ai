import assert from "node:assert/strict";
import { test } from "node:test";
import { listenForFetch } from "../test-support/http-server.js";
import { createAccountAuthenticator, makeLocalAccount } from "../src/local-accounts.js";
import { createServer } from "../src/server.js";

async function start(t, options) {
  const server = createServer(options);
  const base = await listenForFetch(t, server);
  return (path, opts) => fetch(base + path, opts);
}

const email = (role) => role + "@trustgate.example";
const password = "test-only-password-123456";
const approvedOrigin = "http://127.0.0.1:5173";
const budget = { message: "What is the confidential budget?" };

function post(body, cookie, origin) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }), ...(origin && { Origin: origin }) },
    body: JSON.stringify(body)
  };
}

test("local login uses stored accounts, not the request role", async (t) => {
  const records = [];
  for (const role of ["intern", "employee", "admin"]) {
    records.push(await makeLocalAccount(email(role), role, password));
  }
  assert.ok(!JSON.stringify(records).includes(password));
  assert.notEqual(records[0].hash, records[1].hash);
  const request = await start(t, { authenticate: createAccountAuthenticator(records) });

  assert.deepEqual(await (await request("/health")).json(), { ok: true, mode: "local-login" });
  assert.equal((await request("/api/demo/session", post({ role: "admin" }))).status, 404);
  assert.equal((await request("/api/auth/me")).status, 401);
  assert.equal((await request("/api/chat", post(budget))).status, 401);
  assert.equal((await request("/api/auth/login", post({ email: email("intern"), password, role: "admin" }))).status, 400);

  const incorrect = await request("/api/auth/login", post({ email: email("intern"), password: "incorrect" }));
  const missing = await request("/api/auth/login", post({ email: email("missing"), password }));
  assert.equal(incorrect.status, 401);
  assert.equal(missing.status, 401);
  assert.deepEqual(await incorrect.json(), await missing.json());

  const cookies = {};
  for (const role of ["intern", "employee", "admin"]) {
    const login = await request("/api/auth/login", post({ email: email(role), password }, undefined, approvedOrigin));
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), { user: { email: email(role), role } });
    const setCookie = login.headers.get("set-cookie");
    assert.match(setCookie, /Path=\/api; HttpOnly; SameSite=Strict; Max-Age=1800/);
    assert.equal(login.headers.get("access-control-allow-credentials"), "true");
    assert.equal(login.headers.get("access-control-allow-origin"), approvedOrigin);
    cookies[role] = setCookie.split(";")[0];
    const me = await request("/api/auth/me", { headers: { Cookie: cookies[role] } });
    assert.deepEqual(await me.json(), { user: { email: email(role), role } });

    const budgetResponse = await request("/api/chat", post(budget, cookies[role]));
    assert.equal(budgetResponse.status, role === "admin" ? 200 : 403);
    const audit = await request("/api/audit", { headers: { Cookie: cookies[role] } });
    assert.equal(audit.status, role === "admin" ? 200 : 403);
  }

  const loggedOut = await request("/api/auth/logout", { method: "POST", headers: { Cookie: cookies.admin } });
  assert.equal(loggedOut.status, 204);
  assert.match(loggedOut.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await request("/api/auth/me", { headers: { Cookie: cookies.admin } })).status, 401);
  assert.equal((await request("/api/chat", post(budget, cookies.admin))).status, 401);
});

test("cross-origin login and logout are rejected and login attempts are bounded", async (t) => {
  let now = 0;
  const request = await start(t, { authenticate: async () => null, now: () => now });
  for (const path of ["/api/auth/login", "/api/auth/logout"]) {
    const response = await request(path, post({ email: email("admin"), password }, undefined, "https://untrusted.example"));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "ORIGIN_NOT_ALLOWED");
    assert.equal(response.headers.get("set-cookie"), null);
  }
  for (let i = 0; i < 8; i++) {
    assert.equal((await request("/api/auth/login", post({ email: email("missing"), password }))).status, 401);
  }
  assert.equal((await request("/api/auth/login", post({ email: email("missing"), password }))).status, 429);
  now += 60_000;
  assert.equal((await request("/api/auth/login", post({ email: email("missing"), password }))).status, 401);
});

test("signing in with another account revokes the previous cookie, and sessions expire", async (t) => {
  let now = 0;
  const request = await start(t, {
    authenticate: async (name) => ({ email: name, role: name.split("@")[0] }),
    now: () => now
  });
  const login = await request("/api/auth/login", post({ email: email("admin"), password }));
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const intern = await request("/api/auth/login", post({ email: email("intern"), password }, cookie));
  assert.equal(intern.status, 200);
  const internCookie = intern.headers.get("set-cookie").split(";")[0];
  assert.notEqual(internCookie, cookie);
  assert.equal((await request("/api/auth/me", { headers: { Cookie: cookie } })).status, 401);
  const cookieValue = internCookie.split("=")[1];
  assert.equal((await request("/api/auth/me", { headers: { Authorization: "Bearer " + cookieValue } })).status, 401);
  now += 30 * 60 * 1000;
  assert.equal((await request("/api/auth/me", { headers: { Cookie: internCookie } })).status, 401);
});
