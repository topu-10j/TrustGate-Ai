import { createHash } from "node:crypto";
import { canRead } from "./policy.js";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 16 * 1024;
const types = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

export class VaultInputError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalidUpload() {
  return new VaultInputError(400, "INVALID_UPLOAD", "Send one file and the title and accessLevel fields.");
}

function tooLarge() {
  return new VaultInputError(413, "FILE_TOO_LARGE", "File must not exceed 5 MiB.");
}

export function validateDocumentMetadata(title, accessLevel) {
  if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 150 ||
      /[\x00-\x1f\x7f]/.test(title)) {
    throw new VaultInputError(400, "INVALID_TITLE", "Enter a document title of 1–150 characters.");
  }
  if (!canRead("admin", accessLevel)) {
    throw new VaultInputError(400, "INVALID_ACCESS_LEVEL", "Use public, employee, or confidential.");
  }
  return { title: title.trim(), accessLevel };
}

function verifyFile(file) {
  const filename = file.filename?.normalize("NFC");
  if (!filename || filename.length > 180 || /[\\/\x00-\x1f\x7f]/.test(filename)) {
    throw invalidUpload();
  }
  const match = /\.(pdf|docx|xlsx)$/i.exec(filename);
  const extension = match?.[1].toLowerCase();
  const mimeType = types[extension];
  if (!mimeType || (file.mimeType !== mimeType && file.mimeType !== "application/octet-stream")) {
    throw new VaultInputError(415, "UNSUPPORTED_FILE", "Upload a PDF, DOCX, or XLSX file.");
  }
  const signatureMatches = extension === "pdf"
    ? file.content.subarray(0, 5).equals(Buffer.from("%PDF-"))
    : file.content.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (!signatureMatches) {
    throw new VaultInputError(415, "INVALID_FILE_SIGNATURE", "The file header does not match the extension.");
  }
  return {
    filename,
    mimeType,
    content: file.content,
    sizeBytes: file.content.length,
    sha256: createHash("sha256").update(file.content).digest("hex")
  };
}

function parseMultipart(parser, body) {
  return new Promise((resolve, reject) => {
    const fields = Object.create(null);
    let file;
    let failure;
    const invalid = () => { failure ??= invalidUpload(); };

    parser.on("field", (name, value, { nameTruncated, valueTruncated }) => {
      if (!["title", "accessLevel"].includes(name) || Object.hasOwn(fields, name) ||
          nameTruncated || valueTruncated) {
        invalid();
        return;
      }
      fields[name] = value;
    });
    parser.on("file", (name, stream, info) => {
      stream.on("error", () => reject(invalidUpload()));
      if (name !== "file" || file) {
        invalid();
        stream.resume();
        return;
      }
      const chunks = [];
      file = { filename: info.filename, mimeType: info.mimeType };
      stream.on("limit", () => { failure = tooLarge(); });
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => { file.content = Buffer.concat(chunks); });
    });
    for (const event of ["partsLimit", "filesLimit", "fieldsLimit"]) parser.on(event, invalid);
    parser.on("error", () => reject(invalidUpload()));
    parser.on("close", () => {
      if (failure) return reject(failure);
      if (!file?.content || !Object.hasOwn(fields, "title") || !Object.hasOwn(fields, "accessLevel")) {
        return reject(invalidUpload());
      }
      resolve({ fields, file });
    });
    parser.end(body);
  });
}

export async function readVaultUpload(req) {
  const contentType = req.headers["content-type"];
  if (typeof contentType !== "string" || !/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new VaultInputError(415, "EXPECTED_MULTIPART", "Send multipart/form-data for file uploads.");
  }
  if (Number(req.headers["content-length"]) > MAX_MULTIPART_BYTES) throw tooLarge();

  const { default: Busboy } = await import("busboy");
  let parser;
  try {
    parser = Busboy({
      headers: { "content-type": contentType },
      defParamCharset: "utf8",
      limits: { fields: 2, files: 1, parts: 4, fieldSize: 1024, fileSize: MAX_FILE_BYTES + 1 }
    });
  } catch {
    throw invalidUpload();
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_MULTIPART_BYTES) throw tooLarge();
    chunks.push(chunk);
  }

  const { fields, file } = await parseMultipart(parser, Buffer.concat(chunks));
  if (file.content.length > MAX_FILE_BYTES) throw tooLarge();
  return {
    ...validateDocumentMetadata(fields.title, fields.accessLevel),
    ...verifyFile(file)
  };
}
