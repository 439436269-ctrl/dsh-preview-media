import assert from "node:assert/strict";
import { test } from "node:test";
import { contentRange, resolveRange, splitWindow, windowLength } from "../lib/range.js";

test("no header means the whole file", () => {
  assert.deepEqual(resolveRange(undefined, 100), { kind: "absent" });
  assert.deepEqual(resolveRange("", 100), { kind: "absent" });
  assert.deepEqual(resolveRange("   ", 100), { kind: "absent" });
});

test("closed range is clamped to the file end", () => {
  assert.deepEqual(resolveRange("bytes=0-99", 100), { kind: "window", window: { start: 0, end: 99 } });
  assert.deepEqual(resolveRange("bytes=10-19", 100), { kind: "window", window: { start: 10, end: 19 } });
  assert.deepEqual(resolveRange("bytes=90-1000", 100), { kind: "window", window: { start: 90, end: 99 } });
});

test("open-ended range runs to the last byte", () => {
  assert.deepEqual(resolveRange("bytes=50-", 100), { kind: "window", window: { start: 50, end: 99 } });
});

test("suffix range asks for the final N bytes", () => {
  assert.deepEqual(resolveRange("bytes=-10", 100), { kind: "window", window: { start: 90, end: 99 } });
  assert.deepEqual(resolveRange("bytes=-500", 100), { kind: "window", window: { start: 0, end: 99 } });
});

test("malformed and unsatisfiable headers are refused", () => {
  for (const header of [
    "bytes=",
    "bytes=abc",
    "bytes=10-5",
    "bytes=0-10,20-30",
    "items=0-10",
    "bytes=-0",
    "bytes=100-",
    "bytes=100000-200000",
  ]) {
    assert.deepEqual(resolveRange(header, 100), { kind: "unsatisfiable" }, header);
  }
});

test("zero-sized files reject every range", () => {
  assert.deepEqual(resolveRange("bytes=0-0", 0), { kind: "unsatisfiable" });
  assert.deepEqual(resolveRange("bytes=-1", 0), { kind: "unsatisfiable" });
});

test("window length and content range read end-inclusive", () => {
  const window = { start: 10, end: 19 };
  assert.equal(windowLength(window), 10);
  assert.equal(contentRange(window, 100), "bytes 10-19/100");
});

test("splitting covers exactly the input window", () => {
  assert.deepEqual(splitWindow({ start: 0, end: 9 }, 4), [
    { start: 0, end: 3 },
    { start: 4, end: 7 },
    { start: 8, end: 9 },
  ]);
  assert.deepEqual(splitWindow({ start: 5, end: 5 }, 4), [{ start: 5, end: 5 }]);
  const chunks = splitWindow({ start: 3, end: 1000 }, 7);
  assert.equal(chunks[0].start, 3);
  assert.deepEqual(chunks.at(-1), { start: 997, end: 1000 });
  for (let index = 1; index < chunks.length; index += 1) {
    assert.equal(chunks[index].start, chunks[index - 1].end + 1);
  }
});
