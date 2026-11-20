export const allowedKinds = ["department", "project"];

export function normalizedScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length > 20) return null;
  const result = new Map();
  for (const entry of scopes) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).length !== 2 ||
        !allowedKinds.includes(entry.kind) || typeof entry.value !== "string" ||
        !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(entry.value)) return null;
    result.set(entry.kind + ":" + entry.value, { kind: entry.kind, value: entry.value });
  }
  return [...result.values()];
}

// Both group scopes and the document's existing role tier must match.
// The placeholders are fixed SQL literals chosen by the caller, not user data.
export function allDocumentScopesMatch(documentAlias, accountParameter) {
  if (documentAlias !== "d" || !["$3"].includes(accountParameter)) throw new Error("Invalid scope clause.");
  return `NOT EXISTS (
    SELECT 1 FROM trustgate_document_scopes required
    WHERE required.document_id = ${documentAlias}.id AND NOT EXISTS (
      SELECT 1 FROM trustgate_account_scopes granted
      WHERE granted.email = ${accountParameter}
        AND granted.kind = required.kind AND granted.value = required.value
    )
  )`;
}
