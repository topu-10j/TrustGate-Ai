import test from "node:test";
import assert from "node:assert/strict";
import { canAccessRoute } from "../src/utils/authUtils.js";

test("only Admin can reach privileged frontend routes", () => {
  for (const path of ["/logs", "/analytics", "/vault"]) {
    assert.equal(canAccessRoute("admin", path), true);
    assert.equal(canAccessRoute("intern", path), false);
    assert.equal(canAccessRoute("employee", path), false);
    assert.equal(canAccessRoute("unknown", path), false);
  }
});
test("authenticated roles can access ordinary workspace routes", () => {
  for (const role of ["admin", "employee", "intern"]) for (const path of ["/", "/monitor", "/analysis", "/chat", "/documents", "/settings"]) assert.equal(canAccessRoute(role, path), true);
  assert.equal(canAccessRoute(null, "/chat"), false);
});
