import assert from "node:assert/strict";
import { test } from "node:test";
import { judgePasswords } from "../src/judge-demo.js";
import { createPostgresAuthenticator, requireNetworkAccounts } from "../src/postgres-accounts.js";

const env = {
  PGDATABASE: "trustgate_judge",
  PGPASSWORD: "test-db-only",
  TRUSTGATE_JUDGE_ADMIN_PASSWORD: "sample7",
  TRUSTGATE_JUDGE_EMPLOYEE_PASSWORD: "sample8",
  TRUSTGATE_JUDGE_INTERN_PASSWORD: "sample9"
};

test("fictional judges can use distinct seven-character passwords only on the judging database", () => {
  assert.deepEqual(judgePasswords(env), [["admin","sample7"], ["employee","sample8"], ["intern","sample9"]]);
  assert.throws(() => judgePasswords({ ...env, PGDATABASE: "trustgate" }), /separate/);
  assert.throws(() => judgePasswords({ ...env, TRUSTGATE_JUDGE_EMPLOYEE_PASSWORD: "sample7" }), /different/);
  assert.throws(() => judgePasswords({ ...env, TRUSTGATE_JUDGE_INTERN_PASSWORD: "small" }), /at least 7/);
  assert.throws(() => judgePasswords({ ...env, TRUSTGATE_JUDGE_INTERN_PASSWORD: "test-db-only" }), /different/);
});

test("the short judge policy does not satisfy standard HTTPS account checks or sign-in", async () => {
  const calls = [];
  const pool = { async query(sql, params) {
    calls.push({sql, params});
    if (sql.startsWith("SELECT count")) return { rows: [{ weak: params[0] === "judge-demo" ? 0 : 3 }] };
    return { rows: [] };
  } };
  await requireNetworkAccounts(pool, { judge: true });
  await assert.rejects(() => requireNetworkAccounts(pool), { code: "NETWORK_PASSWORDS_REQUIRED" });
  await createPostgresAuthenticator(pool, { network: true })("test@example.org", "sample7");
  await createPostgresAuthenticator(pool, { network: true, judge: true })("test@example.org", "sample7");
  assert.deepEqual(calls.slice(-2).map(call => call.params), [
    ["test@example.org", "network"], ["test@example.org", "judge-demo"]
  ]);
});
