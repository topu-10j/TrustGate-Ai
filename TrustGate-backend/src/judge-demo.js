import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { makeLocalAccount } from "./local-accounts.js";
import { splitDocument } from "./postgres-knowledge.js";
import { provisionDemoNetworkAccounts } from "./postgres-accounts.js";

const fixture = new URL("../../deploy/judge/", import.meta.url);
const dist = new URL("../../frontend/dist/", import.meta.url);
const demoFilename = "veloria-confidential-demo.pdf";
const demoId = "538e68cb-652a-4d90-85a2-283b08e04fda";
const roles = ["admin", "employee", "intern"];
const media = { js: "text/javascript", css: "text/css", svg: "image/svg+xml",
  png: "image/png", webp: "image/webp", woff: "font/woff", woff2: "font/woff2" };
const routes = new Set(["/", "/login", "/chat", "/vault", "/monitor",
  "/analysis", "/logs", "/analytics", "/documents", "/settings"]);

export function judgeEnvironment(env = process.env) {
  const address = env.RENDER_EXTERNAL_HOSTNAME;
  if (!env.TRUSTGATE_ALLOWED_HOSTS && !env.FRONTEND_ORIGIN && address) {
    return { ...env, TRUSTGATE_ALLOWED_HOSTS: address, FRONTEND_ORIGIN: "https://" + address };
  }
  return env;
}

export function judgePasswords(env) {
  if (!env.PGPASSWORD || env.PGDATABASE !== "trustgate_judge") {
    throw new Error("Use a separate trustgate_judge PostgreSQL database with PGPASSWORD configured.");
  }
  const passwords = roles.map(role => [role, env["TRUSTGATE_JUDGE_" + role.toUpperCase() + "_PASSWORD"]]);
  if (passwords.some(([, password]) => typeof password !== "string" || password.length < 7 ||
      Buffer.byteLength(password) > 256 || password.trim() !== password || password === env.PGPASSWORD) ||
      new Set(passwords.map(([, password]) => password)).size !== roles.length) {
    throw new Error("Set three different judge demo passwords (at least 7 characters, up to 256 UTF-8 bytes) in the service environment.");
  }
  return passwords;
}

export async function setupJudgeAccounts(pool, passwords) {
  const records = [];
  for (const [role, password] of passwords) {
    records.push(await makeLocalAccount(role + "@trustgate.example", role, password));
  }
  await provisionDemoNetworkAccounts(pool, records);
}

export async function seedJudgeDocument(pool, root = fixture) {
  const content = await readFile(new URL(demoFilename, root));
  const extracted = JSON.parse(await readFile(new URL("veloria-extracted.json", root), "utf8"));
  const chunks = splitDocument(extracted.text);
  if (!chunks.length || !chunks.join(" ").includes("Cedar Hall")) throw new Error("Invalid judge fixture.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(`
      INSERT INTO trustgate_vault_documents
        (id, title, filename, mime_type, size_bytes, sha256, content, access_level, scan_status, uploaded_by)
      VALUES ($1, 'Veloria Volunteer Orientation', $2, 'application/pdf', $3, $4, $5,
        'confidential', 'clean', 'admin@trustgate.example')
      ON CONFLICT (id) DO NOTHING
    `, [demoId, demoFilename, content.length, createHash("sha256").update(content).digest("hex"), content]);
    if (rowCount) await client.query(`
      INSERT INTO trustgate_vault_chunks (document_id, ordinal, body)
      SELECT $1, ordinal - 1, body FROM unnest($2::text[]) WITH ORDINALITY AS parts(body, ordinal)
    `, [demoId, chunks]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function loadJudgeFrontend(root = dist) {
  const index = await readFile(new URL("index.html", root));
  const files = new Map();
  for (const name of await readdir(new URL("assets/", root))) {
    const ext = /^[a-z0-9_-]+\.([a-z0-9]+)$/i.exec(name)?.[1];
    if (ext && Object.hasOwn(media, ext)) {
      files.set("/assets/" + name, [media[ext], await readFile(new URL("assets/" + name, root))]);
    }
  }
  if (!files.size) throw new Error("Vite assets are missing.");
  return (req, res, path) => {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    const asset = files.get(path);
    if (!asset && !routes.has(path === "/" ? path : path.replace(/\/$/, ""))) return false;
    const [type, data] = asset || ["text/html; charset=utf-8", index];
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Length", data.length);
    if (asset) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.writeHead(200);
    res.end(req.method === "HEAD" ? undefined : data);
    return true;
  };
}
