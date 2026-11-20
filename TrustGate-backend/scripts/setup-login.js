import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localAccountsPath, makeLocalAccount } from "../src/local-accounts.js";

const accounts = [];
const credentials = [];
for (const role of ["intern", "employee", "admin"]) {
  const email = role + "@trustgate.example";
  const password = randomBytes(18).toString("base64url");
  accounts.push(await makeLocalAccount(email, role, password));
  credentials.push({ email, role, password });
}

try {
  await writeFile(localAccountsPath, JSON.stringify(accounts, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600
  });
  console.log("Local test logins (passwords are only displayed here):");
  credentials.forEach(({ email, password }) => console.log(email + "  " + password));
} catch (error) {
  console.error(error.code === "EEXIST"
    ? "Local accounts already exist. No credentials were overwritten."
    : "Could not save local test accounts.");
  process.exitCode = 1;
}
