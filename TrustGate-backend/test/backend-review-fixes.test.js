import assert from "node:assert/strict";
import { test } from "node:test";
import { createPostgresKnowledge } from "../src/postgres-knowledge.js";
import { createPostgresVault } from "../src/postgres-vault.js";
import { processVaultQueue } from "../src/vault-queue.js";

test("a per-file processing error leaves it pending and does not stop the next file", async () => {
  const files = ["defer", "clean", "rejected", "archived", "defer-index"].map((id) => ({ id, sha256: "hash" }));
  const scanned = [];
  const deferred = [];
  const indexed = [];
  const stats = await processVaultQueue({
    async pending() { return files; },
    async deferScan(file) { deferred.push(file.id); return file.id !== "archived"; },
    async finishScan(file, text, result) {
      if (file.id === "defer-index") throw new Error("fixture indexing error");
      if (result.rejected) return "rejected";
      indexed.push([file.id, text]);
      return "clean";
    }
  }, async (file) => {
    scanned.push(file.id);
    if (["defer", "archived"].includes(file.id)) throw new Error("fixture scanner error");
    if (file.id === "rejected") return { rejected: true, text: "" };
    return { rejected: false, text: "benign fixture" };
  });
  assert.deepEqual(scanned, files.map(({ id }) => id));
  assert.deepEqual(deferred, ["defer", "archived", "defer-index"]);
  assert.deepEqual(indexed, [["clean", "benign fixture"]]);
  assert.deepEqual(stats, { clean: 1, rejected: 1, unchanged: 1, deferred: 2 });
});

test("the queue does not report a deferred retry if the database could not save it", async () => {
  await assert.rejects(processVaultQueue({
    async pending() { return [{ id: "fixture" }]; },
    async deferScan() { throw new Error("fixture DB error"); }
  }, async () => { throw new Error("fixture scanner error"); }), /fixture DB error/);
});

test("incident writes take the shared commit-order lock in the same transaction as the insert", async () => {
  const db = [];
  const normalize = (sql) => sql.trim().replace(/\s+/g, " ");
  const client = {
    async query(sql) { db.push(normalize(sql)); return { rowCount: 1, rows: [{ id: "5" }] }; },
    release() { db.push("release"); }
  };
  const knowledge = await createPostgresKnowledge({ async query() {}, async connect() { return client; } });
  await knowledge.recordIncident({ type: "PROMPT_BLOCKED", severity: "medium", role: "intern" });
  assert.equal(db[0], "BEGIN");
  assert.equal(db[1], "SELECT pg_advisory_xact_lock(18473, 1)");
  assert.match(db[2], /^INSERT INTO trustgate_incidents/);
  assert.deepEqual(db.slice(3), ["COMMIT", "release"]);
  db.length = 0;
  await knowledge.finishScan({ id: "document", sha256: "digest" }, "", { rejected: true });
  assert.equal(db[0], "BEGIN");
  assert.match(db[1], /^UPDATE trustgate_vault_documents/);
  assert.equal(db[2], "SELECT pg_advisory_xact_lock(18473, 1)");
  assert.match(db[3], /^INSERT INTO trustgate_incidents/);
  assert.deepEqual(db.slice(4), ["COMMIT", "release"]);
});

test("pending scans prioritize untried files and retry only when due", async () => {
  const calls = [];
  const knowledge = await createPostgresKnowledge({
    async query(sql, args) { calls.push({ sql, args }); return { rows: [], rowCount: 1 }; }
  });
  await knowledge.pending();
  assert.equal(await knowledge.deferScan({ id: "fixture", sha256: "hash" }), true);
  assert.match(calls[1].sql, /scan_retry_at <= now\(\)/);
  assert.match(calls[1].sql, /NULLS FIRST/);
  assert.deepEqual(calls[1].args, [5]);
  assert.match(calls[2].sql, /now\(\) \+ interval '1 minute'/);
  assert.match(calls[2].sql, /scan_status = 'pending_scan' AND archived_at IS NULL/);
  assert.deepEqual(calls[2].args, ["fixture", "hash"]);
});

test("account scopes query is parameterized and returns only saved membership", async () => {
  const calls = [];
  const scopes = [{ kind: "project", value: "museum" }];
  const vault = await createPostgresVault({ async query(sql, args) {
    calls.push({ sql, args });
    return { rows: args?.[0] === "fixture@example.invalid" ? [{ scopes }] : [] };
  } });
  assert.deepEqual(await vault.getAccountScopes("fixture@example.invalid"), scopes);
  assert.equal(await vault.getAccountScopes("missing@example.invalid"), null);
  assert.match(calls[1].sql, /a\.email = \$1/);
  assert.doesNotMatch(calls[1].sql, /\b(?:hash|salt|password_policy)\b/);
  assert.deepEqual(calls[1].args, ["fixture@example.invalid"]);
});
