import { MAX_EVENTS } from "./audit.js";

export async function createPostgresAuditLog(pool, now = Date.now) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trustgate_audit_events (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('intern', 'employee', 'admin')),
      decision TEXT NOT NULL CHECK (decision IN ('allowed', 'denied')),
      reason_code TEXT NOT NULL
    )
  `);

  return {
    async record({ role, decision, reasonCode }) {
      await pool.query(
        "INSERT INTO trustgate_audit_events (occurred_at, role, decision, reason_code) VALUES ($1, $2, $3, $4)",
        [new Date(now()), role, decision, reasonCode]
      );
    },

    async list() {
      const result = await pool.query(`
        SELECT occurred_at, role, decision, reason_code
        FROM trustgate_audit_events
        ORDER BY id DESC
        LIMIT $1
      `, [MAX_EVENTS]);

      return result.rows.map(({ occurred_at, role, decision, reason_code }) => ({
        timestamp: new Date(occurred_at).toISOString(),
        role,
        decision,
        reasonCode: reason_code
      }));
    }
  };
}
