import assert from "node:assert/strict";
import { test } from "node:test";
import { appendAccountScope } from "../src/utils/accountScopes.js";

test("adding an account scope preserves all existing memberships", () => {
  const original = [{ kind: "department", value: "sales" }, { kind: "project", value: "atlas" }];
  assert.deepEqual(appendAccountScope(original, "department", " engineering "), [
    ...original, { kind: "department", value: "engineering" }
  ]);
  assert.equal(original.length, 2);
  assert.equal(appendAccountScope(original, "project", "atlas"), original);
});

test("account scope addition validates codes and the server limit", () => {
  assert.throws(() => appendAccountScope([], "department", "Upper Case"), /lowercase scope code/);
  const current = Array.from({ length: 20 }, (_, i) => ({ kind: "project", value: "team-"+i }));
  assert.throws(() => appendAccountScope(current, "project", "new-team"), /maximum of 20 scopes/);
});
