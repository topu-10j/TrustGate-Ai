import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export async function withPasswordPrompt(work, input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Run this command in an interactive terminal.");
  }
  const sink = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const reader = createInterface({ input, output: sink, terminal: true, historySize: 0 });
  const abort = new AbortController();
  reader.once("SIGINT", () => abort.abort());
  reader.once("close", () => abort.abort());

  async function secret(label) {
    output.write(label);
    try {
      return await reader.question("", { signal: abort.signal });
    } finally {
      output.write("\n");
    }
  }

  try {
    return await work(secret);
  } finally {
    reader.close();
  }
}
