import { makeLocalAccount } from "../src/local-accounts.js";
import { withPasswordPrompt } from "../src/password-prompt.js";
import { createPostgresPool, postgresErrorMessage, provisionPostgresAccounts, rotateNetworkAccounts } from "../src/postgres-accounts.js";

const network = process.argv.includes("--network");
const minimum = network ? 16 : 5;
let pool;
try {
  const accounts = await withPasswordPrompt(async (secret) => {
    const dbPassword = process.env.PGPASSWORD || await secret("Database password for trustgate_app: ");
    pool = createPostgresPool(dbPassword);
    await pool.query("SELECT 1");
    if (network) console.log("This operation replaces the three existing account passwords for HTTPS network use.");
    console.log(`Database connected. Choose a different password of at least ${minimum} characters for each account.`);

    const result = [];
    for (const role of ["intern", "employee", "admin"]) {
      const email = role + "@trustgate.example";
      const password = await secret("New password for " + email + ": ");
      if (password.length < minimum || Buffer.byteLength(password) > 256) {
        throw new Error(`Password must be at least ${minimum} characters and at most 256 UTF-8 bytes.`);
      }
      if (password === dbPassword) throw new Error("Use a different password from the PostgreSQL connection password.");
      for (const previous of result) {
        if (previous.password === password) throw new Error("Use a different password for each account.");
      }
      if (await secret("Confirm " + role + " password: ") !== password) {
        throw new Error("Passwords did not match. No accounts were changed.");
      }
      result.push({ email, role, password });
    }
    return result;
  });

  const records = [];
  for (const account of accounts) {
    records.push(await makeLocalAccount(account.email, account.role, account.password));
    account.password = undefined;
  }

  if (network) {
    await rotateNetworkAccounts(pool, records);
    console.log("Network account passwords replaced. Restart the backend to clear old sessions.");
  } else {
    await provisionPostgresAccounts(pool, records);
    console.log("PostgreSQL accounts ready: Intern, Employee, Admin. Passwords were not printed.");
  }
} catch (error) {
  const safePromptErrors = new Set([
    "Run this command in an interactive terminal.",
    "Enter the database password.",
    "Invalid PostgreSQL port.",
    `Password must be at least ${minimum} characters and at most 256 UTF-8 bytes.`,
    "Local test accounts were not found; no passwords were changed.",
    "Use a different password for each account.",
    "Use a different password from the PostgreSQL connection password.",
    "Passwords did not match. No accounts were changed."
  ]);
  console.error(safePromptErrors.has(error.message) ? error.message : postgresErrorMessage(error));
  process.exitCode = 1;
} finally {
  await pool?.end();
}
