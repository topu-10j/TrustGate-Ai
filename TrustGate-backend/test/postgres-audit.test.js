import assert from "node:assert/strict";
import { test } from "node:test";
import { createPostgresAuditLog } from "../src/postgres-audit.js";

test("PostgreSQL audit maps only the existing API fields and reads the newest 100", async () => {
  const time = new Date("2026-11-20T09:30:00.000Z");
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql: sql.trim(), values });
      return { rows: sql.includes("ORDER BY") ? [{
        occurred_at: time,
        role: "intern",
        decision: "denied",
        reason_code: "ACCESS_DENIED",
        internal_only: "not exposed"
      }] : [] };
    }
  };
  const log = await createPostgresAuditLog(pool, () => time.getTime());
  const entry = { role: "intern", decision: "denied", reasonCode: "ACCESS_DENIED" };
  await log.record({ ...entry, prompt: "not recorded", token: "not recorded" });
  assert.deepEqual(await log.list(), [{ timestamp: time.toISOString(), ...entry }]);

  assert.match(calls[0].sql, /^CREATE TABLE IF NOT EXISTS trustgate_audit_events/);
  assert.match(calls[1].sql, /VALUES \(\$1, \$2, \$3, \$4\)$/);
  assert.deepEqual(calls[1].values, [time, "intern", "denied", "ACCESS_DENIED"]);
  assert.match(calls[2].sql, /ORDER BY id DESC\s+LIMIT \$1$/);
  assert.deepEqual(calls[2].values, [100]);
});
