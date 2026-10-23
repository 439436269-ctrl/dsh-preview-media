import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createDebugLog, decodeReport } from "../lib/debug.js";

test("the logger is a no-op when debug is off", async () => {
  const root = await mkdtemp(join(tmpdir(), "preview-media-debug-"));
  try {
    const file = join(root, "nested", "debug.log");
    const { log } = createDebugLog(false, file);
    log("client", { phase: "seeked" });
    await assert.rejects(readFile(file), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("each event appends one JSON line", async () => {
  const root = await mkdtemp(join(tmpdir(), "preview-media-debug-"));
  try {
    const file = join(root, "nested", "debug.log");
    const { log } = createDebugLog(true, file);
    log("loopback-request", { range: "bytes=0-", method: "GET" });
    log("client", { phase: "loadedmetadata", seekable: [[0, 92.16]] });
    const lines = (await readFile(file, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(lines.length, 2);
    assert.equal(lines[0].event, "loopback-request");
    assert.equal(lines[0].range, "bytes=0-");
    assert.equal(typeof lines[0].at, "string");
    assert.equal(lines[1].event, "client");
    assert.deepEqual(lines[1].seekable, [[0, 92.16]]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an oversized log is truncated instead of growing forever", async () => {
  const root = await mkdtemp(join(tmpdir(), "preview-media-debug-"));
  try {
    const file = join(root, "debug.log");
    await writeFile(file, "x".repeat(3 * 1024 * 1024));
    const { log } = createDebugLog(true, file);
    log("client", { phase: "seeked" });
    const content = await readFile(file, "utf8");
    assert.ok(content.length < 1024, `expected a truncated file, got ${content.length} bytes`);
    assert.equal(JSON.parse(content).event, "client");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("decodeReport accepts one round trip and refuses junk or oversized input", () => {
  const payload = { phase: "seeked", currentTime: 12.5 };
  assert.deepEqual(decodeReport(Buffer.from(JSON.stringify(payload)).toString("base64url")), payload);
  assert.equal(decodeReport(undefined), undefined);
  assert.equal(decodeReport(""), undefined);
  assert.equal(decodeReport("%7Bbad"), undefined);
  assert.equal(decodeReport("x".repeat(5000)), undefined, "oversized reports are dropped");
});
