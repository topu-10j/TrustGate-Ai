import assert from "node:assert/strict";
import { test } from "node:test";
import { chatWarnings } from "../src/utils/chatWarnings.js";

test("chat picks up scanner warnings from the backend response", () => {
  assert.deepEqual(chatWarnings({ warnings: [
    { stage: "input", code: "SCANNER_WARNING", threats: ["PASSWORD", "PASSWORD", null] },
    { stage: "output", code: "SCANNER_WARNING", threats: ["API_KEY"] }
  ] }), [{ stage: "input", threats: ["PASSWORD"] }, { stage: "output", threats: ["API_KEY"] }]);
});

test("ordinary chat responses do not invent warnings", () => {
  assert.deepEqual(chatWarnings({ answer: "Fixture" }), []);
  assert.deepEqual(chatWarnings({ warnings: [null, { code: "SCANNER_WARNING", stage: "unknown" }] }), []);
});
