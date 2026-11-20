import { once } from "node:events";

const MAX_ATTEMPTS = 8;

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

/**
 * Bind a test server to an OS-selected loopback port compatible with Fetch.
 * Some OS ephemeral ranges contain ports Fetch will reject before sending HTTP.
 */
export async function listenForFetch(t, server, { fetchImpl = globalThis.fetch } = {}) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const listening = once(server, "listening");
    server.listen(0, "127.0.0.1");
    await listening;
    const base = "http://127.0.0.1:" + server.address().port;

    try {
      const probe = await fetchImpl(base + "/health", { signal: AbortSignal.timeout(5000) });
      await probe.arrayBuffer();
      if (!probe.ok) throw new Error("The backend test server did not pass its health check.");
    } catch (error) {
      await close(server);
      if (error?.cause?.message === "bad port" && attempt < MAX_ATTEMPTS) continue;
      throw error;
    }

    t.after(() => close(server));
    return base;
  }
}
