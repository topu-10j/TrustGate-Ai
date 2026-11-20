import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createScannerQueue } from "./scanner-queue.js";

const script = fileURLToPath(new URL("../../security-engine/scan_cli.py", import.meta.url));
const MAX_OUTPUT = 64 * 1024;
const TIMEOUT_MS = 3500;

function runPythonScanner(prompt) {
  return new Promise((resolve, reject) => {
  const python = process.env.TRUSTGATE_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const child = spawn(python, ["-B", script], {
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"]
  });

  let size = 0;
  const chunks = [];
  let failure;
  const timer = setTimeout(() => {
    failure = new Error("Scanner timed out");
    child.kill();
  }, TIMEOUT_MS);

  child.on("error", (error) => { failure = error; });
  child.stdin.on("error", (error) => { failure ||= error; });
  child.stdout.on("data", (chunk) => {
    if (failure) return;
    size += chunk.length;
    if (size > MAX_OUTPUT) {
      failure = new Error("Scanner output too large");
      child.kill();
    } else {
      chunks.push(chunk);
    }
  });
  child.once("close", (code) => {
    clearTimeout(timer);
    if (failure || code !== 0) return reject(failure || new Error("Scanner failed"));
    try {
      const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const { decision, risk_level, risk_score, masked_prompt, threats } = result;
      if (!["ALLOW", "WARN", "BLOCK"].includes(decision) ||
          !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(risk_level) ||
          !Number.isInteger(risk_score) || risk_score < 0 || risk_score > 100 ||
          typeof masked_prompt !== "string" || !Array.isArray(threats) ||
          !threats.every((value) => typeof value === "string")) {
        throw new Error("Invalid scanner response");
      }
      resolve({ decision, risk_level, risk_score, masked_prompt, threats });
    } catch (error) {
      reject(error);
    }
  });
  child.stdin.end(JSON.stringify({ prompt }), "utf8");
  });
}

export const scanPrompt = createScannerQueue(runPythonScanner);
