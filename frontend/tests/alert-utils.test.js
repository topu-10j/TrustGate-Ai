import test from "node:test";
import assert from "node:assert/strict";
import { alertIdentity, loadAlertReadKeys, saveAlertReadKeys } from "../src/utils/alertUtils.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("alert identity is stable across list position changes", () => {
  const event = { timestamp: "2026-01-01T12:00:00Z", role: "admin", decision: "denied", reasonCode: "POLICY" };
  assert.equal(alertIdentity(event), alertIdentity({ ...event }));
  assert.notEqual(alertIdentity(event), alertIdentity({ ...event, decision: "allowed" }));
  assert.equal(alertIdentity({ id: "evt-1", timestamp: 1 }), "evt-1");
});

test("alert read state round-trips per role and handles invalid storage", () => {
  const storage = memoryStorage();
  assert.deepEqual(loadAlertReadKeys(storage, "admin"), []);
  assert.equal(saveAlertReadKeys(storage, "admin", ["a", "a", "b"]), true);
  assert.deepEqual(loadAlertReadKeys(storage, "admin"), ["a", "b"]);
  assert.deepEqual(loadAlertReadKeys(storage, "intern"), []);
  const broken = { getItem() { throw new Error("storage blocked"); }, setItem() { throw new Error("storage blocked"); } };
  assert.deepEqual(loadAlertReadKeys(broken, "admin"), []);
  assert.equal(saveAlertReadKeys(broken, "admin", ["a"]), false);
});
