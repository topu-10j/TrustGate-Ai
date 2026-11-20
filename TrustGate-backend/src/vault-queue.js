import { scanAndExtract } from "./vault-worker.js";

export async function processVaultQueue(knowledge, scan = scanAndExtract) {
  const counts = { clean: 0, rejected: 0, unchanged: 0, deferred: 0 };
  for (const file of await knowledge.pending()) {
    let status;
    try {
      const result = await scan(file);
      status = await knowledge.finishScan(file, result.text, result);
    } catch {
      // Never release a file on error. If the DB is unavailable, deferScan throws
      // and the worker exits instead of reporting a retry that was not recorded.
      status = await knowledge.deferScan(file) ? "deferred" : "unchanged";
    }
    counts[status]++;
  }
  return counts;
}
