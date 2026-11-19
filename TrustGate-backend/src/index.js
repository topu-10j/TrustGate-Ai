import { createServer } from "./server.js";
import { loadLocalAuthenticator } from "./local-accounts.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be a whole number from 1 to 65535.");
  process.exit(1);
}

const options = process.env.FRONTEND_ORIGIN
  ? { allowedOrigins: [process.env.FRONTEND_ORIGIN] }
  : {};
const loginMode = process.argv.includes("--login");
const postgresMode = process.argv.includes("--postgres");
if (loginMode && postgresMode) {
  console.error("Choose one login mode.");
  process.exit(1);
}
let pool;
if (loginMode) {
  try {
    options.authenticate = await loadLocalAuthenticator();
  } catch (error) {
    console.error(error.code === "ENOENT"
      ? "Local test accounts are missing. Run npm run login:setup first."
      : "Could not read the local account store.");
    process.exit(1);
  }
}
if (postgresMode) {
  const postgres = await import("./postgres-accounts.js").catch(() => {
    console.error("PostgreSQL driver is missing. Run npm ci in TrustGate-backend.");
    process.exit(1);
  });
  const { withPasswordPrompt } = await import("./password-prompt.js");
  const { createPostgresAuditLog } = await import("./postgres-audit.js");
  const { createPostgresVault } = await import("./postgres-vault.js");
  try {
    const password = process.env.PGPASSWORD || await withPasswordPrompt(
      (secret) => secret("Database password for trustgate_app: ")
    );
    pool = postgres.createPostgresPool(password);
    pool.on("error", () => console.error("PostgreSQL connection interrupted."));
    await postgres.verifyPostgresSchema(pool);
    options.audit = await createPostgresAuditLog(pool);
    options.vault = await createPostgresVault(pool);
    options.authenticate = postgres.createPostgresAuthenticator(pool);
    options.accountSource = "postgres";
  } catch (error) {
    console.error(error.message === "Run this command in an interactive terminal."
      ? error.message : postgres.postgresErrorMessage(error));
    await pool?.end();
    process.exit(1);
  }
}
const server = createServer(options);
if (pool) server.once("close", () => { void pool.end(); });

server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE"
    ? `Port ${port} is already in use. Set PORT to a different port.`
    : `Could not start TrustGate: ${error.message}`);
  process.exitCode = 1;
  if (pool) void pool.end();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`TrustGate ${postgresMode ? "PostgreSQL login mode" : loginMode ? "local login mode" : "local demo"} running at http://127.0.0.1:${port}`);
});
