import { randomUUID, createHash } from "node:crypto";
import { canRead } from "./policy.js";
import { allDocumentScopesMatch } from "./document-scopes.js";

const accessLevels = ["public", "employee", "confidential"];
const projection = "d.id, d.title, d.filename, d.access_level, c.ordinal, c.body";

export function splitDocument(text) {
  const normalized = text.normalize("NFC").replace(/[\u0000\r]/g, "").replace(/[\t ]+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(/\s+/u).flatMap((word) => word.match(/.{1,300}/gu) || []);
  const chunks = [];
  let offset = 0;
  while (offset < words.length && chunks.length < 120) {
    let end = offset;
    let size = 0;
    while (end < words.length && size + words[end].length + 1 <= 740) {
      size += words[end++].length + 1;
    }
    if (end === offset) break;
    chunks.push(words.slice(offset, end).join(" "));
    offset = end === words.length ? end : Math.max(offset + 1, end - 10);
  }
  return chunks;
}

export function retrievalTerms(question) {
  const stop = new Set(["what", "when", "where", "does", "the", "with", "about", "and", "for", "are", "is", "of", "at", "on", "in", "to", "me", "my", "tell", "more", "আমার", "আমাদের", "কি", "কী", "কবে", "কোথায়", "কোথায়", "এটা"]);
  return [...new Set(question.normalize("NFC").toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [])]
    .filter((term) => term.length >= 2 && !stop.has(term)).slice(0, 16);
}

function toVector(values) {
  if (!Array.isArray(values) || values.length !== 384 ||
      values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("Invalid local embedding.");
  }
  return JSON.stringify(values);
}

export async function createPostgresKnowledge(pool, { embed } = {}) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trustgate_vault_chunks (
      document_id UUID NOT NULL REFERENCES trustgate_vault_documents(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 740),
      PRIMARY KEY (document_id, ordinal)
    );
    CREATE TABLE IF NOT EXISTS trustgate_incidents (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      type TEXT NOT NULL CHECK (type IN ('PROMPT_BLOCKED', 'FILE_REJECTED', 'CHAT_COOLDOWN')),
      severity TEXT NOT NULL CHECK (severity IN ('medium', 'high')),
      actor_role TEXT CHECK (actor_role IN ('intern', 'employee', 'admin')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
      document_id UUID REFERENCES trustgate_vault_documents(id)
    );
    CREATE TABLE IF NOT EXISTS trustgate_chat_limits (
      email TEXT PRIMARY KEY REFERENCES trustgate_accounts(email) ON DELETE CASCADE,
      window_start_ms BIGINT NOT NULL,
      strikes INT NOT NULL CHECK (strikes >= 0),
      paused_until_ms BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trustgate_slack_imports (
      source_key TEXT PRIMARY KEY,
      document_id UUID NOT NULL REFERENCES trustgate_vault_documents(id)
    )
  `);

  if (embed) {
    const extension = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
    if (!extension.rowCount) {
      const error = new Error("Enable pgvector in the TrustGate database first.");
      error.code = "VECTOR_NOT_AVAILABLE";
      throw error;
    }
    await pool.query("ALTER TABLE trustgate_vault_chunks ADD COLUMN IF NOT EXISTS embedding vector(384)");
  }

  const incidentFields = `id::text, occurred_at AS timestamp, type, severity, actor_role AS role, status, document_id AS "documentId"`;
  const incident = async (client, { type, severity, role = null, documentId = null }) => {
    const result = await client.query(`
      INSERT INTO trustgate_incidents (type, severity, actor_role, document_id)
      VALUES ($1, $2, $3, $4) RETURNING ${incidentFields}
    `, [type, severity, role, documentId]);
    return result.rows[0];
  };

  async function transact(action) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async pending(limit = 5) {
      const result = await pool.query(`
        SELECT id, filename, mime_type, sha256, content
        FROM trustgate_vault_documents
        WHERE scan_status = 'pending_scan' AND archived_at IS NULL
        ORDER BY created_at ASC, id ASC LIMIT $1
      `, [limit]);
      return result.rows;
    },

    async finishScan(document, text, { rejected = false } = {}) {
      const chunks = rejected ? [] : splitDocument(text);
      rejected ||= chunks.length === 0;
      const vectors = rejected || !embed ? null : (await embed("passage", chunks)).map(toVector);
      if (vectors && vectors.length !== chunks.length) throw new Error("Invalid local embedding count.");
      return transact(async (client) => {
        const { rowCount } = await client.query(`
          UPDATE trustgate_vault_documents
          SET scan_status = $3, updated_at = now()
          WHERE id = $1 AND sha256 = $2 AND scan_status = 'pending_scan' AND archived_at IS NULL
        `, [document.id, document.sha256, rejected ? "rejected" : "clean"]);
        if (!rowCount) return "unchanged";
        if (rejected) {
          await incident(client, { type: "FILE_REJECTED", severity: "high", documentId: document.id });
        } else if (vectors) {
          await client.query(`
            INSERT INTO trustgate_vault_chunks (document_id, ordinal, body, embedding)
            SELECT $1, ordinal - 1, body, vector_text::vector
            FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS parts(body, vector_text, ordinal)
          `, [document.id, chunks, vectors]);
        } else {
          await client.query(`
            INSERT INTO trustgate_vault_chunks (document_id, ordinal, body)
            SELECT $1, ordinal - 1, body FROM unnest($2::text[]) WITH ORDINALITY AS parts(body, ordinal)
          `, [document.id, chunks]);
        }
        return rejected ? "rejected" : "clean";
      });
    },

    async search(question, role, email = null) {
      const terms = retrievalTerms(question);
      const allowed = accessLevels.filter((level) => canRead(role, level));
      if (!terms.length || !allowed.length) return [];
      const vector = embed ? toVector((await embed("query", [question]))[0]) : null;
      // Access and scan conditions are applied in the same DB query that selects excerpts.
      const vectorRank = vector ? `COALESCE(1 - (c.embedding <=> $4::vector), 0)` : "0";
      const result = await pool.query(`
        SELECT ${projection}, rank.score
        FROM trustgate_vault_chunks c
        JOIN trustgate_vault_documents d ON d.id = c.document_id
        CROSS JOIN LATERAL (
          SELECT count(*) AS score FROM unnest($1::text[]) AS terms(term)
          WHERE strpos(lower(c.body), term) > 0 OR strpos(lower(d.title), term) > 0
        ) rank
        WHERE d.scan_status = 'clean' AND d.archived_at IS NULL AND d.access_level = ANY($2::text[])
          AND ${allDocumentScopesMatch("d", "$3")}
          AND (rank.score > 0 OR ${vectorRank} >= 0.82)
        ORDER BY rank.score DESC, ${vectorRank} + 0.0 DESC, d.created_at DESC, c.ordinal ASC LIMIT 4
      `, vector ? [terms, allowed, email, vector] : [terms, allowed, email]);
      return result.rows;
    },

    recordIncident: (event) => incident(pool, event),

    async isChatPaused(email, time) {
      const { rowCount } = await pool.query(
        "SELECT 1 FROM trustgate_chat_limits WHERE email = $1 AND paused_until_ms > $2",
        [email, time]
      );
      return rowCount > 0;
    },

    recordPromptBlock({ email, role, time }) {
      return transact(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 1))", [email]);
        await incident(client, { role, type: "PROMPT_BLOCKED", severity: "high" });
        const { rows } = await client.query(
          "SELECT window_start_ms, strikes, paused_until_ms FROM trustgate_chat_limits WHERE email = $1",
          [email]
        );
        const previous = rows[0];
        if (previous && Number(previous.paused_until_ms) > time) return;
        const sameWindow = previous && time - Number(previous.window_start_ms) < 5 * 60_000;
        const strikes = sameWindow ? previous.strikes + 1 : 1;
        const paused = strikes >= 2;
        await client.query(`
          INSERT INTO trustgate_chat_limits (email, window_start_ms, strikes, paused_until_ms)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (email) DO UPDATE SET
            window_start_ms = EXCLUDED.window_start_ms, strikes = EXCLUDED.strikes,
            paused_until_ms = EXCLUDED.paused_until_ms
        `, [email, sameWindow ? previous.window_start_ms : time, paused ? 0 : strikes, paused ? time + 60_000 : 0]);
        if (paused) await incident(client, { role, type: "CHAT_COOLDOWN", severity: "medium" });
      });
    },

    async listIncidents(after) {
      const where = after === undefined ? "" : "WHERE id > $1";
      const order = after === undefined ? "DESC" : "ASC";
      const result = await pool.query(`
        SELECT ${incidentFields} FROM trustgate_incidents ${where} ORDER BY trustgate_incidents.id ${order} LIMIT 100
      `, after === undefined ? [] : [after]);
      return result.rows;
    },

    async updateIncident(id, status) {
      const result = await pool.query(`
        UPDATE trustgate_incidents SET status = $2 WHERE id = $1 RETURNING ${incidentFields}
      `, [id, status]);
      return result.rows[0] ?? null;
    },

    importSlackMessage({ sourceKey, title, text }, adminEmail) {
      const content = Buffer.from(text, "utf8");
      return transact(async (client) => {
        // A per-import transaction lock avoids duplicate documents if imports run at the same time.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceKey]);
        const existing = await client.query("SELECT 1 FROM trustgate_slack_imports WHERE source_key = $1", [sourceKey]);
        if (existing.rowCount) return false;
        const id = randomUUID();
        await client.query(`
          INSERT INTO trustgate_vault_documents
            (id, title, filename, mime_type, size_bytes, sha256, content, access_level, uploaded_by)
          SELECT $1, $2, 'slack-message.txt', 'text/plain', $3, $4, $5, 'confidential', email
          FROM trustgate_accounts WHERE email = $6 AND role = 'admin'
        `, [id, title, content.length, createHash("sha256").update(content).digest("hex"), content, adminEmail]);
        await client.query("INSERT INTO trustgate_slack_imports (source_key, document_id) VALUES ($1, $2)", [sourceKey, id]);
        return true;
      });
    }
  };
}
