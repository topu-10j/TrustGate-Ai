import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { listenForFetch } from "../test-support/http-server.js";
import { createServer } from "../src/server.js";
import { createPostgresVault } from "../src/postgres-vault.js";
import { MAX_FILE_BYTES } from "../src/vault-upload.js";

const endpoint = "/api/vault/documents";
const id = "f38d833e-7f9b-4b58-ac60-c422e7dbfe2c";
const pdf = Buffer.from("%PDF-1.7\nLocal fixture\n");
const roles = ["intern", "employee", "admin"];
const jsonBody = (value) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value)
});

async function app(t, vault, accountSource = "postgres") {
  const server = createServer({
    vault,
    accountSource,
    authenticate: async (email) => {
      const role = roles.find((name) => email === name + "@trustgate.example");
      return role ? { role, email } : null;
    }
  });
  const base = await listenForFetch(t, server);
  const request = (url, opts) => fetch(base + url, opts);
  return {
    request,
    async login(role) {
      const response = await request("/api/auth/login", { method: "POST", ...jsonBody({
        email: role + "@trustgate.example", password: "fixture"
      }) });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie").split(";")[0];
      return (url, opts = {}) => request(url, { ...opts, headers: { ...opts.headers, Cookie: cookie } });
    }
  };
}

function upload({ filename = "নোট.pdf", type = "application/pdf", bytes = pdf, access = "public", extra } = {}) {
  const form = new FormData();
  form.set("file", new Blob([bytes], { type }), filename);
  form.set("title", "Office policy");
  form.set("accessLevel", access);
  if (extra) form.set(extra, "extra");
  return { method: "POST", body: form };
}

test("document management and upload are Admin-only and remain absent in local mode", async (t) => {
  let writes = 0;
  const store = {
    listReadable: async (role) => [{ id, role }],
    listAdmin: async () => [],
    async insert() { writes++; },
    async update() { writes++; },
    async archive() { writes++; }
  };
  const api = await app(t, store);
  const local = await app(t, store, "local");
  assert.equal((await local.request(endpoint)).status, 404);
  assert.equal((await api.request(endpoint)).status, 401);
  for (const role of ["intern", "employee"]) {
    const signedIn = await api.login(role);
    assert.equal((await signedIn(endpoint)).status, 403);
    assert.equal((await signedIn(endpoint, upload())).status, 403);
    assert.equal((await signedIn(endpoint + "/" + id, { method: "PATCH" })).status, 403);
    assert.equal((await signedIn(endpoint + "/" + id + "/archive", { method: "POST" })).status, 403);
    const read = await signedIn("/api/documents");
    assert.deepEqual(await read.json(), { documents: [{ id, role }] });
  }
  assert.equal(writes, 0);
});

test("Admin uploads a document for scanning, changes permissions and archives metadata", async (t) => {
  let document;
  const api = await app(t, {
    async insert(input, email) {
      assert.equal(email, "admin@trustgate.example");
      assert.deepEqual(input.content, pdf);
      assert.equal(input.sha256, createHash("sha256").update(pdf).digest("hex"));
      document = { id, title: input.title, filename: input.filename, accessLevel: input.accessLevel,
        mimeType: input.mimeType, sizeBytes: input.sizeBytes, scanStatus: "pending_scan", archivedAt: null };
      return document;
    },
    async listAdmin() { return [document]; },
    async listReadable() { return []; },
    async update(docId, input) {
      if (docId !== id) return null;
      document = { ...document, ...input };
      return document;
    },
    async archive(docId) {
      if (docId !== id) return null;
      document = { ...document, archivedAt: "2026-11-20T14:00:00.000Z" };
      return document;
    }
  });
  const admin = await api.login("admin");
  const file = await admin(endpoint, upload());
  assert.equal(file.status, 201);
  const created = (await file.json()).document;
  assert.equal(created.filename, "নোট.pdf");
  assert.equal(created.scanStatus, "pending_scan");
  assert.equal(Object.hasOwn(created, "content"), false);
  assert.deepEqual(await (await admin("/api/documents")).json(), { documents: [] });

  const patch = await admin(endpoint + "/" + id, { method: "PATCH",
    ...jsonBody({ title: "Updated policy", accessLevel: "confidential" }) });
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).document.accessLevel, "confidential");
  assert.equal((await admin(endpoint + "/" + id, { method: "PATCH",
    ...jsonBody({ title: "Changed", accessLevel: "unknown" }) })).status, 400);

  const archived = await admin(endpoint + "/" + id + "/archive", { method: "POST" });
  assert.equal(archived.status, 200);
  assert.ok((await archived.json()).document.archivedAt);
  const list = await admin(endpoint);
  assert.equal((await list.json()).documents.length, 1);

  const preflight = await api.request(endpoint + "/" + id, { method: "OPTIONS", headers: {
    Origin: "http://127.0.0.1:5173", "Access-Control-Request-Method": "PATCH"
  } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-methods"), /PATCH/);
});

test("malformed, unsupported and oversized files are rejected before storage", async (t) => {
  let writes = 0;
  const api = await app(t, { async insert() { writes++; } });
  const admin = await api.login("admin");
  for (const [options, status, code] of [
    [upload({ filename: "report.txt" }), 415, "UNSUPPORTED_FILE"],
    [upload({ bytes: Buffer.from("not a PDF") }), 415, "INVALID_FILE_SIGNATURE"],
    [upload({ type: "text/plain" }), 415, "UNSUPPORTED_FILE"],
    [upload({ access: "admin" }), 400, "INVALID_ACCESS_LEVEL"],
    [upload({ extra: "scanStatus" }), 400, "INVALID_UPLOAD"],
    [upload({ bytes: Buffer.alloc(MAX_FILE_BYTES + 1) }), 413, "FILE_TOO_LARGE"],
    [{ method: "POST", ...jsonBody({}) }, 415, "EXPECTED_MULTIPART"]
  ]) {
    const response = await admin(endpoint, options);
    assert.equal(response.status, status, code);
    assert.equal((await response.json()).code, code);
  }
  assert.equal(writes, 0);
});

test("PostgreSQL filters reads by scan, archive and the server-side role tiers", async () => {
  const calls = [];
  const vault = await createPostgresVault({
    async query(sql, args) { calls.push({ sql, args }); return { rows: [] }; }
  });
  for (const role of roles) assert.deepEqual(await vault.listReadable(role), []);
  const reads = calls.slice(1);
  assert.deepEqual(reads.map(({ args }) => args[0]), [
    ["public"], ["public", "employee"], ["public", "employee", "confidential"]
  ]);
  for (const { sql } of reads) {
    assert.match(sql, /WHERE scan_status = 'clean' AND archived_at IS NULL/);
    assert.match(sql, /access_level = ANY\(\$1::text\[\]\)/);
    assert.doesNotMatch(sql, /\bcontent\b/);
  }
});
