import { withPasswordPrompt } from "../src/password-prompt.js";
import { createPostgresPool } from "../src/postgres-accounts.js";
import { createPostgresVault } from "../src/postgres-vault.js";
import { createPostgresKnowledge } from "../src/postgres-knowledge.js";
import { scanAndExtract } from "../src/vault-worker.js";
import { readSlackMessages } from "../src/slack-reader.js";
import { embedLocally } from "../src/local-embeddings.js";

let pool;
try {
  const operation = process.argv[2];
  if (operation !== "scan" && operation !== "slack") throw new Error("Unknown Vault tool.");
  const keys = await withPasswordPrompt(async (secret) => ({
    db: process.env.PGPASSWORD || await secret("Database password for trustgate_app: "),
    slack: operation === "slack"
      ? (process.env.SLACK_BOT_TOKEN || await secret("Slack bot token: "))
      : null
  }));
  pool = createPostgresPool(keys.db);
  await createPostgresVault(pool);
  const knowledge = await createPostgresKnowledge(pool, { embed: process.env.TRUSTGATE_VECTOR_RAG === "1" ? embedLocally : undefined });
  if (operation === "scan") {
    const pending = await knowledge.pending();
    let unchanged = 0;
    let clean = 0;
    let rejected = 0;
    for (const file of pending) {
      const result = await scanAndExtract(file);
      const status = await knowledge.finishScan(file, result.text, result);
      if (status === "clean") clean++;
      else if (status === "rejected") rejected++;
      else unchanged++;
    }
    console.log(`Vault scan finished: ${clean} indexed, ${rejected} rejected, ${unchanged} unchanged. Scans up to 5 pending files per run.`);
  } else {
    const messages = await readSlackMessages({ token: keys.slack, channel: process.argv[3] });
    let imported = 0;
    for (const message of messages) {
      if (await knowledge.importSlackMessage(message, "admin@trustgate.example")) imported++;
    }
    console.log(`Slack import: ${imported} new messages, ${messages.length - imported} duplicates. New records are confidential and pending scan.`);
  }
} catch (error) {
  const code = error.code;
  if (code === "28P01" || code === "3D000" || code === "ECONNREFUSED") {
    console.error("Could not connect to the TrustGate PostgreSQL database. Check the service and database password.");
  } else if (code === "VECTOR_NOT_AVAILABLE") {
    console.error(error.message);
  } else if (code === "ABORT_ERR") {
    console.error("Cancelled.");
  } else {
    const prefix = /^(File scanner|Text extraction|Text extractor|Local embedding|Could not compute local embeddings|Slack |Could not reach Slack|Enter a Slack|Run this command)/;
    console.error(prefix.test(error.message) ? error.message : "Could not complete the Vault operation.");
  }
  process.exitCode = 1;
} finally {
  await pool?.end();
}
