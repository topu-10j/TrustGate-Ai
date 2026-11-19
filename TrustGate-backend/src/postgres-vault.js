import { randomUUID } from "node:crypto";
import { canRead } from "./policy.js";
import { MAX_FILE_BYTES } from "./vault-upload.js";

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
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null
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
    )
  `);

  return {
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
        SELECT ${fields}
        FROM trustgate_vault_documents
        ORDER BY created_at DESC, id DESC LIMIT $1
      `, [maxListing]);
      return result.rows.map(documentMetadata);
    },

    async listReadable(role) {
      const allowed = accessTiers.filter((level) => canRead(role, level));
      const result = await pool.query(`
        SELECT ${fields}
        FROM trustgate_vault_documents
        WHERE scan_status = 'clean' AND archived_at IS NULL
          AND access_level = ANY($1::text[])
        ORDER BY created_at DESC, id DESC LIMIT $2
      `, [allowed, maxListing]);
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
