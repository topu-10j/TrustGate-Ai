import assert from "node:assert/strict";
import { test } from "node:test";
import { makeLocalAccount } from "../src/local-accounts.js";
import { createPostgresAuthenticator, provisionPostgresAccounts } from "../src/postgres-accounts.js";

test("PostgreSQL login uses a parameterized lookup and the row's role", async () => {
  const email = "employee@trustgate.example";
  const password = "test-only-credential-42";
  const record = await makeLocalAccount(email, "employee", password);
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: params[0] === email ? [record] : [] };
    }
  };
  const authenticate = createPostgresAuthenticator(pool);
  assert.deepEqual(await authenticate(email, password), { email, role: "employee" });
  assert.equal(await authenticate(email, "wrong"), null);
  assert.equal(await authenticate("unknown@trustgate.example", password), null);
  assert.deepEqual(calls.map((call) => call.params), [[email], [email], ["unknown@trustgate.example"]]);
  assert.ok(calls.every(({ sql }) => sql.includes("WHERE email = $1") && !sql.includes(email)));
});

test("PostgreSQL account provisioning is atomic and does not overwrite an existing account", async () => {
  const calls = [];
  let released = false;
  let fail = false;
  const duplicate = Object.assign(new Error("duplicate"), { code: "23505" });
  const client = {
    async query(sql, values) {
      calls.push({ sql: sql.trim(), values });
      if (fail && sql.startsWith("INSERT")) throw duplicate;
    },
    release() { released = true; }
  };
  const pool = { async connect() { return client; } };
  const account = { email: "admin@trustgate.example", role: "admin", salt: "example-salt", hash: "example-hash" };

  await provisionPostgresAccounts(pool, [account]);
  assert.equal(calls[0].sql, "BEGIN");
  assert.match(calls[1].sql, /^CREATE TABLE IF NOT EXISTS trustgate_accounts/);
  assert.match(calls[2].sql, /VALUES \(\$1, \$2, \$3, \$4\)$/);
  assert.deepEqual(calls[2].values, [account.email, account.role, account.salt, account.hash]);
  assert.equal(calls[3].sql, "COMMIT");
  assert.equal(released, true);

  calls.length = 0;
  released = false;
  fail = true;
  await assert.rejects(provisionPostgresAccounts(pool, [account]), { code: "23505" });
  assert.equal(calls.at(-1).sql, "ROLLBACK");
  assert.equal(released, true);
});
