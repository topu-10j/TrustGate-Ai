import assert from "node:assert/strict";
import { test } from "node:test";
import { createScannerQueue } from "../src/scanner-queue.js";

function gate() {
  let open;
  const waiting = new Promise(resolve => { open = resolve; });
  return { open, waiting };
}

test("scanner queue serves jobs in order, bounds active work, and releases failed worker slots", async () => {
  const releaseFirst = gate();
  const started = [];
  const scan = createScannerQueue(async input => {
    started.push(input);
    if (input === 1) await releaseFirst.waiting;
    if (input === 2) throw new Error("fixture exception");
    return input;
  }, { concurrency: 1, maxPending: 2, waitMs: 2000 });
  const first = scan(1);
  const failed = assert.rejects(scan(2), /fixture exception/);
  const third = scan(3);
  await assert.rejects(scan(4), /queue is full/);
  assert.deepEqual(started, [1]);
  releaseFirst.open();
  assert.deepEqual(await Promise.all([first, third]), [1, 3]);
  await failed;
  assert.deepEqual(started, [1, 2, 3]);
});

test("expired scanner work does not start later or retain a queue slot", async () => {
  const hold = gate();
  const started = [];
  const scan = createScannerQueue(async input => {
    started.push(input);
    if (input === "active") await hold.waiting;
    return input;
  }, { concurrency: 1, maxPending: 1, waitMs: 30 });
  const active = scan("active");
  await assert.rejects(scan("expired"), /queue wait timed out/);
  const fresh = scan("fresh");
  hold.open();
  assert.deepEqual(await Promise.all([active, fresh]), ["active", "fresh"]);
  assert.deepEqual(started, ["active", "fresh"]);
});
