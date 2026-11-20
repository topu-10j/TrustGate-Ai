import { randomUUID } from "node:crypto";
import { canRead } from "./policy.js";
import { MAX_FILE_BYTES } from "./vault-upload.js";
import { allDocumentScopesMatch } from "./document-scopes.js";

const fields = `
  id, title, filename, mime_type, size_bytes, access_level,
  scan_status, created_at, updated_at, archived_at
`;
const accessTiers = ["public", "employee", "confidential"];
const maxListing = 100;

function documentMetadata(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    accessLevel: row.access_level,
    scanStatus: row.scan_status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
    ...(Array.isArray(row.scopes) ? { scopes: row.scopes } : {})
  };
}

export async function createPostgresVault(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trustgate_vault_documents (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 150),
      filename TEXT NOT NULL CHECK (length(filename) BETWEEN 1 AND 180),
      mime_type TEXT NOT NULL,
      size_bytes INT NOT NULL CHECK (size_bytes BETWEEN 1 AND ${MAX_FILE_BYTES}),
      sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
      content BYTEA NOT NULL CHECK (octet_length(content) = size_bytes),
      access_level TEXT NOT NULL CHECK (access_level IN ('public', 'employee', 'confidential')),
      scan_status TEXT NOT NULL DEFAULT 'pending_scan'
        CHECK (scan_status IN ('pending_scan', 'clean', 'rejected')),
      uploaded_by TEXT NOT NULL REFERENCES trustgate_accounts(email),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      archived_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS trustgate_document_scopes (
      document_id UUID NOT NULL REFERENCES trustgate_vault_documents(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('department', 'project')),
      value TEXT NOT NULL,
      PRIMARY KEY (document_id, kind, value)
    );
    CREATE TABLE IF NOT EXISTS trustgate_account_scopes (
      email TEXT NOT NULL REFERENCES trustgate_accounts(email) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('department', 'project')),
      value TEXT NOT NULL,
      PRIMARY KEY (email, kind, value)
    )
  `);

  async function setScopes(target, key, scopes) {
    const account = target === "account";
    const master = account ? "trustgate_accounts" : "trustgate_vault_documents";
    const table = account ? "trustgate_account_scopes" : "trustgate_document_scopes";
    const field = account ? "email" : "document_id";
    const masterField = account ? "email" : "id";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(`SELECT 1 FROM ${master} WHERE ${masterField} = $1 FOR UPDATE`, [key]);
      if (!found.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query(`DELETE FROM ${table} WHERE ${field} = $1`, [key]);
      if (scopes.length) {
        await client.query(`
          INSERT INTO ${table} (${field}, kind, value)
          SELECT $1, kind, value FROM unnest($2::text[], $3::text[]) AS scopes(kind, value)
        `, [key, scopes.map(({ kind }) => kind), scopes.map(({ value }) => value)]);
      }
      await client.query("COMMIT");
      return scopes;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    setDocumentScopes: (id, scopes) => setScopes("document", id, scopes),
    setAccountScopes: (email, scopes) => setScopes("account", email, scopes),
    async getAccountScopes(email) {
      const { rows } = await pool.query(`
        SELECT COALESCE((
          SELECT json_agg(json_build_object('kind', s.kind, 'value', s.value) ORDER BY s.kind, s.value)
          FROM trustgate_account_scopes s WHERE s.email = a.email
        ), '[]'::json) AS scopes
        FROM trustgate_accounts a WHERE a.email = $1
      `, [email]);
      return rows[0]?.scopes ?? null;
    },

    async insert(input, email) {
      const result = await pool.query(`
        INSERT INTO trustgate_vault_documents
          (id, title, filename, mime_type, size_bytes, sha256, content, access_level, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${fields}
      `, [randomUUID(), input.title, input.filename, input.mimeType, input.sizeBytes,
        input.sha256, input.content, input.accessLevel, email]);
      return documentMetadata(result.rows[0]);
    },

    async listAdmin() {
      const result = await pool.query(`
        SELECT ${fields}, COALESCE((
          SELECT json_agg(json_build_object('kind', s.kind, 'value', s.value) ORDER BY s.kind, s.value)
          FROM trustgate_document_scopes s WHERE s.document_id = d.id
        ), '[]'::json) AS scopes
        FROM trustgate_vault_documents d
        ORDER BY created_at DESC, id DESC LIMIT $1
      `, [maxListing]);
      return result.rows.map(documentMetadata);
    },

    async listReadable(role, email = null) {
      const allowed = accessTiers.filter((level) => canRead(role, level));
      const result = await pool.query(`
        SELECT ${fields}
        FROM trustgate_vault_documents d
        WHERE scan_status = 'clean' AND archived_at IS NULL
          AND access_level = ANY($1::text[])
          AND ${allDocumentScopesMatch("d", "$3")}
        ORDER BY created_at DESC, id DESC LIMIT $2
      `, [allowed, maxListing, email]);
      return result.rows.map(documentMetadata);
    },

    async update(id, { title, accessLevel }) {
      const result = await pool.query(`
        UPDATE trustgate_vault_documents
        SET title = $2, access_level = $3, updated_at = now()
        WHERE id = $1 AND archived_at IS NULL
        RETURNING ${fields}
      `, [id, title, accessLevel]);
      return documentMetadata(result.rows[0]);
    },

    async archive(id) {
      const result = await pool.query(`
        UPDATE trustgate_vault_documents
        SET archived_at = COALESCE(archived_at, now()),
            updated_at = CASE WHEN archived_at IS NULL THEN now() ELSE updated_at END
        WHERE id = $1
        RETURNING ${fields}
      `, [id]);
      return documentMetadata(result.rows[0]);
    }
  };
}
