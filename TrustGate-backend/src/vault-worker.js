import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const extractor = fileURLToPath(new URL("../../security-engine/extract_vault.py", import.meta.url));

function reducedEnv(env) {
  const permitted = new Set(["PATH", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "PATHEXT", "LANG", "LC_ALL", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMW6432"]);
  return Object.fromEntries(Object.entries(env).filter(([key]) => permitted.has(key.toUpperCase())));
}

const scannerFailure = () => new Error("File scanner could not complete. Nothing was released.");

async function defenderPath(env) {
  const vars = Object.fromEntries(Object.entries(env).map(([key, value]) => [key.toUpperCase(), value]));
  const candidates = [];
  if (vars.PROGRAMDATA) {
    const dir = join(vars.PROGRAMDATA, "Microsoft", "Windows Defender", "Platform");
    const versions = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const names = versions.filter(item => item.isDirectory() && /^\d+(?:\.\d+){3}(?:-\d+)?$/.test(item.name))
      .map(item => item.name).sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
    for (const name of names) candidates.push(join(dir, name, "MpCmdRun.exe"));
  }
  for (const root of new Set([vars.PROGRAMW6432, vars.PROGRAMFILES])) {
    if (root) candidates.push(join(root, "Windows Defender", "MpCmdRun.exe"));
  }
  for (const candidate of candidates) {
    if ((await stat(candidate).catch(() => null))?.isFile()) return candidate;
  }
  throw scannerFailure();
}

async function scanFile(file, execute, env, processOptions, platform) {
  const scanner = env.TRUSTGATE_VAULT_SCANNER || "clamav";
  const options = { ...processOptions, timeout: 40000 };
  if (scanner === "defender" && platform === "win32") {
    try {
      const command = await defenderPath(env);
      const { stdout } = await execute(command, ["-Scan", "-ScanType", "3", "-File", file, "-DisableRemediation"], options);
      // A generic success line or a nonzero code is not an unambiguous per-file verdict.
      const lowerPath = file.toLowerCase();
      const clean = stdout.split(/\r?\n/).some(line => {
        const verdict = line.trim().toLowerCase();
        return verdict === `scanning ${lowerPath} found no threats.` || verdict === `scanning "${lowerPath}" found no threats.`;
      });
      if (clean) return true;
    } catch {
      // Defender code 2 can mean either a detection or an operational error.
    }
    throw new Error("File scanner (Defender) did not confirm this file is clean. It remains pending and was not indexed.");
  }
  if (scanner !== "clamav") throw new Error("File scanner setting is invalid for this operating system.");
  try {
    await execute(env.TRUSTGATE_CLAMSCAN || "clamscan", ["--no-summary", file], options);
    return true;
  } catch (error) {
    if (error.code === 1 && !error.killed && !error.signal) return false;
    throw scannerFailure();
  }
}

export async function scanAndExtract(document, {
  execute = exec,
  env = process.env,
  platform = process.platform
} = {}) {
  const folder = await mkdtemp(join(tmpdir(), "trustgate-vault-"));
  try {
    const extension = /\.(pdf|docx|xlsx|txt)$/i.exec(document.filename)?.[1] ?? "bin";
    const file = join(folder, "upload." + extension.toLowerCase());
    await writeFile(file, document.content, { mode: 0o600, flag: "wx" });
    const processOptions = { windowsHide: true, env: reducedEnv(env), maxBuffer: 800 * 1024 };
    if (!await scanFile(file, execute, env, processOptions, platform)) return { rejected: true, text: "" };

    const python = env.TRUSTGATE_PYTHON || (platform === "win32" ? "python" : "python3");
    let result;
    try {
      const { stdout } = await execute(python, ["-B", extractor, file, document.mime_type], { ...processOptions, timeout: 20000 });
      result = JSON.parse(stdout);
    } catch (error) {
      if (error.code === 2 && !error.killed) return { rejected: true, text: "" };
      throw new Error("Text extraction could not complete. The file remains pending.");
    }
    if (typeof result.text !== "string" || result.text.length > 48000) {
      throw new Error("Text extractor produced an invalid response.");
    }
    return { rejected: false, text: result.text };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
