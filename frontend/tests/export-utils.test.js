import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, printable, canAccessRoute } from "../src/utils/exportUtils.js";

test("CSV fields are quoted and embedded quotes escaped", () => {
  assert.equal(csvCell('say "hello"'), '"say ""hello"""');
  assert.equal(csvCell("plain"), '"plain"');
});

test("CSV formula injection is prefixed, including leading whitespace", () => {
  assert.equal(csvCell("=1+1"), "\"'=1+1\"");
  assert.equal(csvCell("  +SUM(A1:A2)"), "\"'  +SUM(A1:A2)\"");
  assert.equal(csvCell("\t@malicious"), "\"'\t@malicious\"");
});

test("print HTML escaping blocks markup injection", () => {
  assert.equal(printable(`<script a=\"x\">&'`), "&lt;script a=&quot;x&quot;&gt;&amp;&#39;");
});

test("route access is restricted to Admin for privileged pages", () => {
  for (const role of ["intern", "employee"]) {
    assert.equal(canAccessRoute(role, "/logs"), false);
    assert.equal(canAccessRoute(role, "/analytics"), false);
    assert.equal(canAccessRoute(role, "/vault"), false);
    assert.equal(canAccessRoute(role, "/chat"), true);
  }
  assert.equal(canAccessRoute("admin", "/vault"), true);
  assert.equal(canAccessRoute("unknown", "/chat"), false);
});
