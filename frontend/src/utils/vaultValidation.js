export const MAX_VAULT_FILE_BYTES = 5 * 1024 * 1024;
export const VAULT_ALLOWED_TYPES = Object.freeze({
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
export function validateVaultFile(file) {
  if (!file) return { valid: false, reason: "Choose a file." };
  if (file.size > MAX_VAULT_FILE_BYTES) return { valid: false, reason: "File exceeds 5 MiB limit." };
  const ext = String(file.name || "").toLowerCase().split(".").pop();
  const acceptedType = Object.values(VAULT_ALLOWED_TYPES).includes(file.type);
  const acceptedExtension = Object.hasOwn(VAULT_ALLOWED_TYPES, ext);
  if (!acceptedType && !acceptedExtension) return { valid: false, reason: "Unsupported file type. Upload PDF, DOCX, or XLSX only." };
  return { valid: true, reason: "" };
}
