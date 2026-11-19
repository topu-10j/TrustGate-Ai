import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { listenForFetch } from "../test-support/http-server.js";

test("test server retries when Fetch rejects an assigned port", async (t) => {
  let attempts = 0;
  const server = createServer((_req, res) => res.end("ok"));
  const base = await listenForFetch(t, server, {
    fetchImpl(url, options) {
      attempts++;
      if (attempts === 1) {
        // Fetch rejects this known restricted port without making a request.
        return fetch("http://127.0.0.1:6000/health", options);
      }
      return fetch(url, options);
    }
  });
  assert.ok(attempts >= 2);
  assert.equal(await (await fetch(base + "/health")).text(), "ok");
});
