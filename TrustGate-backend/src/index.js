import { createServer } from "./server.js";
import { loadLocalAuthenticator } from "./local-accounts.js";
import { deploymentConfig } from "./deployment.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be a whole number from 1 to 65535.");
  process.exit(1);
}

const loginMode = process.argv.includes("--login");
const postgresMode = process.argv.includes("--postgres");
const geminiMode = process.argv.includes("--gemini");
const integrated = process.argv.includes("--integrated");
const openaiMode = process.argv.includes("--openai");
const judge = process.env.TRUSTGATE_JUDGE_DEMO === "1"
  ? await import("./judge-demo.js") : null;
let passwords;
let config;
try {
  config = deploymentConfig(judge ? judge.judgeEnvironment() : process.env, postgresMode);
  if (judge) {
    if (!config.secureCookies || !integrated || geminiMode || openaiMode ||
        process.env.TRUSTGATE_VECTOR_RAG === "1") {
      throw new Error("Judge demo requires integrated PostgreSQL, secure cookies and local retrieval.");
    }
    passwords = judge.judgePasswords(process.env);
  }
}
catch (error) {
  console.error(error.message);
  process.exit(1);
}
const { bindHost, ...options } = config;
if ((geminiMode || openaiMode || integrated) && !postgresMode) {
  console.error("This mode requires PostgreSQL-backed login.");
  process.exit(1);
}
if ((loginMode && postgresMode) || (geminiMode && openaiMode)) {
  console.error("Choose one login mode and one answer provider.");
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
    if (judge) await judge.setupJudgeAccounts(pool, passwords);
    passwords = undefined;
    await postgres.verifyPostgresSchema(pool);
    if (options.secureCookies) await postgres.requireNetworkAccounts(pool, { judge: Boolean(judge) });
    options.audit = await createPostgresAuditLog(pool);
    options.vault = await createPostgresVault(pool);
    if (integrated) {
      const { createPostgresKnowledge } = await import("./postgres-knowledge.js");
      const embed = process.env.TRUSTGATE_VECTOR_RAG === "1"
        ? (await import("./local-embeddings.js")).embedLocally : undefined;
      options.knowledge = await createPostgresKnowledge(pool, { embed });
    }
    if (judge) {
      try {
        options.serveFrontend = await judge.loadJudgeFrontend();
        await judge.seedJudgeDocument(pool);
        options.readOnlyVault = true;
        options.readOnlyIncidents = true;
      } catch {
        throw Object.assign(new Error("Could not initialize the bundled judge frontend and PDF fixture."), {
          code: "JUDGE_DEMO_INITIALIZATION_FAILED"
        });
      }
    }
    options.authenticate = postgres.createPostgresAuthenticator(pool, { network: options.secureCookies, judge: Boolean(judge) });
    options.accountSource = "postgres";
  } catch (error) {
    console.error((error.message === "Run this command in an interactive terminal." || ["VECTOR_NOT_AVAILABLE", "NETWORK_PASSWORDS_REQUIRED", "JUDGE_DEMO_INITIALIZATION_FAILED"].includes(error.code))
      ? error.message : postgres.postgresErrorMessage(error));
    await pool?.end();
    process.exit(1);
  }
}
if (geminiMode) {
  const { withPasswordPrompt } = await import("./password-prompt.js");
  const { createGeminiAnswerProvider, createGeminiGroundedProvider } = await import("./gemini-answer.js");
  try {
    const key = process.env.GEMINI_API_KEY || await withPasswordPrompt((secret) => secret("Gemini API key: "));
    const geminiOptions = { apiKey: key, model: process.env.TRUSTGATE_GEMINI_MODEL };
    options.generateAnswer = createGeminiAnswerProvider(geminiOptions);
    if (integrated) options.generateGrounded = createGeminiGroundedProvider(geminiOptions);
  } catch (error) {
    console.error(error.code === "ABORT_ERR" ? "Cancelled." : error.message);
    await pool?.end();
    process.exit(1);
  }
}
if (openaiMode) {
  const { withPasswordPrompt } = await import("./password-prompt.js");
  const { createOpenAIProviders } = await import("./openai-answer.js");
  try {
    const key = process.env.OPENAI_API_KEY || await withPasswordPrompt((secret) => secret("OpenAI API key: "));
    Object.assign(options, createOpenAIProviders({ apiKey: key, model: process.env.TRUSTGATE_OPENAI_MODEL }));
  } catch (error) {
    console.error(error.code === "ABORT_ERR" ? "Cancelled." : error.message);
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

server.listen(port, bindHost, () => {
  console.log(`TrustGate ${postgresMode ? "PostgreSQL login mode" : loginMode ? "local login mode" : "local demo"} running at http://${bindHost}:${port}`);
  if (geminiMode) console.log("Gemini is enabled for the approved fictional demo topics.");
  if (openaiMode) console.log("OpenAI is enabled for approved sources.");
  if (integrated) console.log("Vault retrieval, inline guard and Admin incidents are enabled.");
});
