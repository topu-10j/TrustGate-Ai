import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../security-engine/embed_vault.py", import.meta.url));
let active = 0;

export async function embedLocally(mode, texts) {
  if (active >= 2) throw new Error("Local embeddings are busy.");
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const python = process.env.TRUSTGATE_PYTHON || (process.platform === "win32" ? "python" : "python3");
      const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
        /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|HOME|USERPROFILE|PATHEXT|LANG|LC_ALL|HF_HOME|HF_HUB_OFFLINE|TRANSFORMERS_CACHE)$/i.test(name)));
      const child = spawn(python, ["-B", script], {
        env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "ignore"]
      });
      const chunks = [];
      let size = 0;
      let failure;
      const timer = setTimeout(() => {
        failure = new Error("Local embedding timed out.");
        child.kill();
      }, 180000);
      child.on("error", () => { failure = new Error("Local embedding was unavailable."); });
      child.stdin.on("error", () => { failure ??= new Error("Could not start local embedding."); });
      child.stdout.on("data", (part) => {
        if (failure) return;
        size += part.length;
        if (size > 2 * 1024 * 1024) {
          failure = new Error("Local embedding response was too large.");
          child.kill();
        } else chunks.push(part);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (failure || code !== 0) return reject(failure || new Error("Could not compute local embeddings."));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(new Error("Local embedding response was invalid.")); }
      });
      child.stdin.end(JSON.stringify({ mode, texts }));
    });
  } finally {
    active--;
  }
}
