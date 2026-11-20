import { randomBytes } from "node:crypto";
import { withPasswordPrompt } from "../src/password-prompt.js";

const base = "http://127.0.0.1:3000";
const vault = "/api/vault/documents";
const titlePrefix = "Vault smoke: ";
const idPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const topicPattern = /^veloria[a-z]{10}$/;
const ask = (topic) => `When does ${topic} open?`;
const json = (body) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function request(path, options = {}, expected = 200) {
  const response = await fetch(base + path, { ...options, redirect: "error", signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (response.status !== expected) throw new Error(`${path} returned HTTP ${response.status}${data.code ? ` (${data.code})` : ""}.`);
  return { response, data };
}

async function login(role, password, sessions) {
  const email = `${role}@trustgate.example`;
  const { response, data } = await request("/api/auth/login", { method: "POST", ...json({ email, password }) });
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (data.user?.email !== email || data.user.role !== role || !cookie) throw new Error(`Unexpected ${role} login response.`);
  const call = (path, options = {}, status) => request(path, {
    ...options, headers: { ...options.headers, Cookie: cookie }
  }, status).then(({ data: body }) => body);
  sessions.push(call);
  return call;
}

function makePdf(topic) {
  const stream = `BT /F1 15 Tf 72 740 Td (The ${topic} museum opens on Thursday at noon.) Tj ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return String(offset).padStart(10, "0") + " 00000 n \n";
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

function hasSource(answer, id) {
  if (!Array.isArray(answer.sources)) throw new Error("Start the backend using start:integrated-local, not a legacy mode.");
  return answer.source?.id === id || answer.sources.some(({ id: source }) => source === id);
}

const [action, id] = process.argv.slice(2);
const sessions = [];
try {
  if (!(action === "upload" && !id) && !(action === "verify" && idPattern.test(id ?? ""))) {
    throw new Error("Use check-vault-local.js upload or check-vault-local.js verify DOCUMENT_ID.");
  }
  const { data: health } = await request("/health");
  if (!health.ok || health.mode !== "postgres-login") throw new Error("Start the backend using start:integrated-local on 127.0.0.1:3000.");
  await withPasswordPrompt(async (secret) => {
    const admin = await login("admin", await secret("TrustGate Admin account password: "), sessions);
    if (action === "upload") {
      const topic = "veloria" + Array.from(randomBytes(10), (n) => String.fromCharCode(97 + (n % 26))).join("");
      const before = await admin("/api/chat", { method: "POST", ...json({ message: ask(topic) }) });
      if (!Array.isArray(before.sources)) throw new Error("Start the backend using start:integrated-local, not a legacy mode.");
      const form = new FormData();
      form.set("title", titlePrefix + topic);
      form.set("accessLevel", "confidential");
      form.set("file", new Blob([makePdf(topic)], { type: "application/pdf" }), "trustgate-smoke.pdf");
      const { document } = await admin(vault, { method: "POST", body: form }, 201);
      console.log(`Document ID: ${document.id}`);
      const { documents } = await admin("/api/documents");
      const answer = await admin("/api/chat", { method: "POST", ...json({ message: ask(topic) }) });
      if (document.scanStatus !== "pending_scan" || documents.some((item) => item.id === document.id) || hasSource(answer, document.id)) {
        throw new Error("The upload was not hidden while pending.");
      }
      console.log(`PASS: PDF uploaded as pending_scan and cannot be retrieved before scanning.\nAfter running vault:scan, run verify with ID ${document.id}.`);
      return;
    }
    const { documents } = await admin(vault);
    const document = documents.find((item) => item.id === id);
    const topic = document?.title?.startsWith(titlePrefix) ? document.title.slice(titlePrefix.length) : "";
    if (!topicPattern.test(topic) || document.filename !== "trustgate-smoke.pdf" || document.archivedAt) {
      throw new Error("The ID does not belong to an active test document created by this command.");
    }
    if (document.scanStatus !== "clean") throw new Error(`The test file is ${document.scanStatus}. Run vault:scan and check its output.`);
    const question = { method: "POST", ...json({ message: ask(topic) }) };
    const answer = await admin("/api/chat", question);
    if (!hasSource(answer, id) || !answer.answer.includes("Thursday at noon")) throw new Error("Admin could not retrieve the indexed passage with its source ID.");
    console.log("PASS: Admin retrieved and cited the scanned document.");
    const intern = await login("intern", await secret("TrustGate Intern account password: "), sessions);
    const internDocs = (await intern("/api/documents")).documents;
    const denied = await intern("/api/chat", question);
    if (internDocs.some((item) => item.id === id) || hasSource(denied, id) || denied.answer.includes(`The ${topic} museum`)) {
      throw new Error("Intern was able to see confidential test content.");
    }
    console.log("PASS: Intern could not view or retrieve the confidential document.");
    await admin(`${vault}/${id}/archive`, { method: "POST" });
    console.log("PASS: Dummy document archived. Vault smoke test complete.");
  });
} catch (error) {
  const message = error.code === "ABORT_ERR" ? "Cancelled." : error.message;
  console.error(message === "fetch failed" ? `Could not reach the TrustGate backend at ${base}.` : message);
  process.exitCode = 1;
} finally {
  await Promise.allSettled(sessions.map((call) => call("/api/auth/logout", { method: "POST" })));
}
