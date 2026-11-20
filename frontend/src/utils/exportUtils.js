/** CSV escaping plus spreadsheet formula-injection protection. */
export function csvCell(value) {
  const text = String(value ?? "");
  // Excel/LibreOffice may execute formula-like cells. Whitespace before a marker
  // is also dangerous, so inspect the first non-whitespace character.
  const firstNonWhitespace = text.trimStart();
  const safe = /^[=+@-]/.test(firstNonWhitespace) || /^[\t\r]/.test(text)
    ? "'" + text
    : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

/** Escape user/backend values before inserting into an HTML print document. */
export function printable(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

export { canAccessRoute } from "./authUtils.js";
