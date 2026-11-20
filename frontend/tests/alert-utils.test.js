import test from "node:test";
import assert from "node:assert/strict";
import { alertDestination, alertIdentity, loadAlertReadKeys, saveAlertReadKeys } from "../src/utils/alertUtils.js";

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

test("security incidents route by incident ID while permission alerts still open audit logs", () => {
  const incident = { id: "42", type: "FILE_REJECTED", severity: "high", timestamp: "2026-01-01T00:00:00Z" };
  const audit = { id: "42", decision: "denied", reasonCode: "ACCESS_DENIED", timestamp: incident.timestamp };
  assert.equal(alertDestination(incident), "/?incident=42#security-incidents");
  assert.notEqual(alertIdentity(incident), alertIdentity(audit));
  const auditUrl = new URL(alertDestination(audit), "http://example.invalid");
  assert.equal(auditUrl.pathname, "/logs");
  assert.equal(auditUrl.searchParams.get("event"), audit.timestamp);
  assert.equal(auditUrl.searchParams.get("reason"), "ACCESS_DENIED");
});
