import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { isDemoRole } from "./policy.js";

export const localAccountsPath = new URL("../.local-accounts.json", import.meta.url);
const derive = promisify(scrypt);
const cost = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const base64url = /^[A-Za-z0-9_-]+$/;

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function validCredentials(email, password) {
  return email.length <= 254 && emailPattern.test(email) &&
    typeof password === "string" && password.length > 0 && Buffer.byteLength(password) <= 256;
}

export async function makeLocalAccount(email, role, password) {
  email = normalizeEmail(email);
  if (!isDemoRole(role) || !validCredentials(email, password) || password.length < 16) {
    throw new Error("Invalid account configuration.");
  }
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 32, cost);
  return { email, role, salt: salt.toString("base64url"), hash: hash.toString("base64url") };
}

function decode(value, bytes) {
  if (typeof value !== "string" || !base64url.test(value)) throw new Error("Invalid account store.");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== bytes || decoded.toString("base64url") !== value) {
    throw new Error("Invalid account store.");
  }
  return decoded;
}

export function createAccountAuthenticator(records) {
  if (!Array.isArray(records) || !records.length) throw new Error("Invalid account store.");
  const accounts = new Map();
  for (const record of records) {
    const email = normalizeEmail(record?.email);
    if (!email || email.length > 254 || !emailPattern.test(email) ||
        !isDemoRole(record.role) || accounts.has(email)) {
      throw new Error("Invalid account store.");
    }
    accounts.set(email, {
      email,
      role: record.role,
      salt: decode(record.salt, 16),
      hash: decode(record.hash, 32)
    });
  }
  const missing = { salt: randomBytes(16), hash: randomBytes(32) };

  return async function authenticate(email, password) {
    const account = accounts.get(email);
    const { salt, hash } = account ?? missing;
    const derived = await derive(password, salt, hash.length, cost);
    const matches = timingSafeEqual(derived, hash);
    return account && matches ? { email: account.email, role: account.role } : null;
  };
}

export async function loadLocalAuthenticator(path = localAccountsPath) {
  const records = JSON.parse(await readFile(path, "utf8"));
  return createAccountAuthenticator(records);
}
