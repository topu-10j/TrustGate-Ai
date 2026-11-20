import pg from "pg";
import { createPasswordVerifier } from "./local-accounts.js";

const { Pool } = pg;

const schema = `
  CREATE TABLE IF NOT EXISTS trustgate_accounts (
    email TEXT PRIMARY KEY CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
    role TEXT NOT NULL CHECK (role IN ('intern', 'employee', 'admin')),
    salt TEXT NOT NULL CHECK (length(salt) = 22),
    hash TEXT NOT NULL CHECK (length(hash) = 43),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

export function createPostgresPool(password, env = process.env) {
  if (typeof password !== "string" || !password) throw new Error("Enter the database password.");
  const port = Number(env.PGPORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PostgreSQL port.");
  return new Pool({
    host: env.PGHOST || "127.0.0.1",
    port,
    user: env.PGUSER || "trustgate_app",
    database: env.PGDATABASE || "trustgate",
    password,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    max: 5
  });
}

export async function verifyPostgresSchema(pool) {
  await pool.query("SELECT email, role, salt, hash FROM trustgate_accounts LIMIT 0");
}

export function createPostgresAuthenticator(pool, { network = false } = {}) {
  const verifyPassword = createPasswordVerifier();
  return async (email, password) => {
    const result = await pool.query(
      "SELECT email, role, salt, hash FROM trustgate_accounts WHERE email = $1" +
        (network ? " AND password_policy = 'network'" : ""),
      [email]
    );
    return verifyPassword(result.rows[0], password);
  };
}

export async function provisionPostgresAccounts(pool, accounts) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(schema);
    for (const account of accounts) {
      await client.query(
        "INSERT INTO trustgate_accounts (email, role, salt, hash) VALUES ($1, $2, $3, $4)",
        [account.email, account.role, account.salt, account.hash]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function postgresErrorMessage(error) {
  switch (error.code) {
    case "ECONNREFUSED": return "PostgreSQL is not accepting connections. Check that the Windows service is running.";
    case "28P01": return "PostgreSQL rejected the database password. Use the password for trustgate_app.";
    case "3D000": return "Database trustgate was not found.";
    case "42P01": return "TrustGate account tables are missing. Run npm run postgres:setup first.";
    case "23505": return "Test accounts already exist. No existing passwords were overwritten.";
    case "ABORT_ERR": return "Password entry cancelled.";
    default: return "Could not complete the PostgreSQL operation.";
  }
}

// No deployment can reuse the five-character local test credential policy.
export async function requireNetworkAccounts(pool) {
  await pool.query("ALTER TABLE trustgate_accounts ADD COLUMN IF NOT EXISTS password_policy TEXT NOT NULL DEFAULT 'local'");
  const { rows } = await pool.query("SELECT count(*)::int AS weak FROM trustgate_accounts WHERE password_policy <> 'network'");
  if (rows[0].weak !== 0) {
    const error = new Error("Rotate local account passwords before network startup using npm run postgres:network-passwords.");
    error.code = "NETWORK_PASSWORDS_REQUIRED";
    throw error;
  }
}

export async function rotateNetworkAccounts(pool, records) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE trustgate_accounts ADD COLUMN IF NOT EXISTS password_policy TEXT NOT NULL DEFAULT 'local'");
    for (const record of records) {
      const result = await client.query(`
        UPDATE trustgate_accounts SET salt = $3, hash = $4, password_policy = 'network'
        WHERE email = $1 AND role = $2
      `, [record.email, record.role, record.salt, record.hash]);
      if (result.rowCount !== 1) throw new Error("Local test accounts were not found; no passwords were changed.");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
