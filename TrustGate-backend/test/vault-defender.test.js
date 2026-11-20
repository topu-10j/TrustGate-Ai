import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { scanAndExtract } from "../src/vault-worker.js";

const document = { filename: "smoke.pdf", mime_type: "application/pdf", content: Buffer.from("harmless fixture") };

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "trustgate-defender-fixture-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const environment = { TRUSTGATE_VAULT_SCANNER: "defender", ProgramData: root, ProgramFiles: root, PGPASSWORD: "not forwarded" };
  const paths = {};
  for (const version of ["4.18.9.0-0", "4.18.10.0-0", "4.18.11.0-0"]) {
    const folder = join(root, "Microsoft", "Windows Defender", "Platform", version);
    await mkdir(folder, { recursive: true });
    paths[version] = join(folder, "MpCmdRun.exe");
    if (version !== "4.18.11.0-0") await writeFile(paths[version], "fixture only, not executed");
  }
  const fallback = join(root, "Windows Defender");
  await mkdir(fallback);
  await writeFile(join(fallback, "MpCmdRun.exe"), "fixture only, not executed");
  return { env: environment, platform: "win32", expected: paths["4.18.10.0-0"], fallback: join(fallback, "MpCmdRun.exe") };
}

test("Defender scans the exact private copy and permits extraction on an explicit clean result", async (t) => {
  const input = await fixture(t);
  let path;
  const result = await scanAndExtract(document, { ...input, async execute(command, args, options) {
    assert.equal(Object.hasOwn(options.env, "PGPASSWORD"), false);
    if (!path) {
      path = args[4];
      assert.equal(command, input.expected);
      assert.deepEqual(args, ["-Scan", "-ScanType", "3", "-File", path, "-DisableRemediation"]);
      assert.deepEqual(await readFile(path), document.content);
      return { stdout: `Scan starting...\r\nScan finished.\r\nScanning "${path}" found no threats.\r\n` };
    }
    assert.equal(command, "python");
    assert.equal(args[2], path);
    return { stdout: JSON.stringify({ text: "The museum opens at noon." }) };
  } });
  assert.deepEqual(result, { text: "The museum opens at noon.", rejected: false });
  await assert.rejects(access(path), { code: "ENOENT" });
});

test("Defender cannot release a file on ambiguous, mismatched, failed or timed-out results", async (t) => {
  const input = await fixture(t);
  for (const behavior of [
    () => ({ stdout: "Scan finished.\r\n" }),
    (path) => ({ stdout: `Scanning ${path}.other found no threats.\r\n` }),
    () => { throw Object.assign(new Error("could be detection or scanner error"), { code: 2 }); },
    () => { throw Object.assign(new Error("deadline exceeded"), { killed: true }); }
  ]) {
    let path;
    let calls = 0;
    await assert.rejects(scanAndExtract(document, { ...input, async execute(_command, args) {
      calls++;
      path = args[4];
      return behavior(path);
    } }), /remains pending and was not indexed/);
    assert.equal(calls, 1);
    await assert.rejects(access(path), { code: "ENOENT" });
  }
});

test("Defender searches the Windows installation fallback when no platform folder exists", async (t) => {
  const input = await fixture(t);
  input.env.ProgramData = join(input.env.ProgramData, "missing");
  let seen;
  await assert.rejects(scanAndExtract(document, { ...input, async execute(command) {
    seen = command;
    return { stdout: "" };
  } }), /remains pending/);
  assert.equal(seen, input.fallback);
});

test("unavailable Defender or unsupported platform cannot silently switch away from the requested scanner", async () => {
  for (const platform of ["win32", "linux"]) {
    let calls = 0;
    await assert.rejects(scanAndExtract(document, {
      platform, env: { TRUSTGATE_VAULT_SCANNER: "defender" }, async execute() { calls++; }
    }), /File scanner/);
    assert.equal(calls, 0);
  }
});
