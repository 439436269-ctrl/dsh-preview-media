import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoopbackServer } from "../lib/loopback.js";
import { resolveConfig } from "../lib/config.js";

/** A two-megabyte deterministic fixture: byte i is i % 251. */
const SIZE = 2 * 1024 * 1024;
const FIXTURE = Buffer.alloc(SIZE);
for (let index = 0; index < SIZE; index += 1) FIXTURE[index] = index % 251;

/**
 * Stand-in for the composed filesystem: only the members the server calls.
 * @param options - size override and error injection.
 * @returns the stub and its read log.
 */
function stubFs(options = {}) {
  const reads = [];
  const size = options.size ?? SIZE;
  return {
    reads,
    async resolve(path) {
      if (options.resolveError !== undefined) throw options.resolveError;
      return { key: path };
    },
    async stat() {
      if (options.absent === true) return undefined;
      return { version: "v1", type: options.type ?? "file", size };
    },
    async readByteRange(_target, range) {
      reads.push({ ...range });
      return FIXTURE.subarray(range.offset, Math.min(range.offset + range.length, SIZE));
    },
  };
}

/**
 * Start one server on an ephemeral port.
 * @param fs - stub filesystem.
 * @param overrides - config overrides.
 * @returns the running server plus a request helper.
 */
async function mount(fs, overrides = {}, token = "test-token-1") {
  const server = createLoopbackServer({
    fs,
    config: resolveConfig({ chunkBytes: 64 * 1024, ...overrides }),
    token,
  });
  const origin = await server.listen();
  const url = (path, query = "") => `${origin}/media/${server.token}?path=${encodeURIComponent(path)}${query}`;
  return { server, origin, url, fs };
}

test("an untokened request learns nothing", async () => {
  const { server, origin } = await mount(stubFs());
  try {
    assert.equal((await fetch(`${origin}/media`)).status, 404);
    assert.equal((await fetch(`${origin}/media/wrong-token?path=%2Ftmp%2Fa.mp4`)).status, 404);
    assert.equal((await fetch(`${origin}/`)).status, 404);
  } finally {
    await server.close();
  }
});

test("a plain GET streams the whole file with length and accept-ranges", async () => {
  const { server, url, fs } = await mount(stubFs());
  try {
    const response = await fetch(url("/tmp/a.mp4"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-range"), null);
    assert.equal(Number(response.headers.get("content-length")), SIZE);
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "cross-origin");
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(body.byteLength, SIZE);
    assert.deepEqual(body.subarray(0, 4), FIXTURE.subarray(0, 4));
    assert.deepEqual(body.subarray(SIZE - 4), FIXTURE.subarray(SIZE - 4));
    for (const read of fs.reads) assert.ok(read.length <= 64 * 1024, "one read never exceeds the chunk size");
  } finally {
    await server.close();
  }
});

test("a ranged GET answers 206 with exactly the requested window", async () => {
  const { server, url } = await mount(stubFs());
  try {
    const response = await fetch(url("/tmp/a.webm"), { headers: { range: "bytes=100-199" } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes 100-199/${SIZE}`);
    assert.equal(Number(response.headers.get("content-length")), 100);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), FIXTURE.subarray(100, 200));
  } finally {
    await server.close();
  }
});

test("an open-ended range streams to the end", async () => {
  const { server, url } = await mount(stubFs());
  try {
    const response = await fetch(url("/tmp/a.mp3"), { headers: { range: `bytes=${SIZE - 10}-` } });
    assert.equal(response.status, 206);
    assert.equal(Number(response.headers.get("content-length")), 10);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), FIXTURE.subarray(SIZE - 10));
  } finally {
    await server.close();
  }
});

test("HEAD answers headers without a body", async () => {
  const { server, url, fs } = await mount(stubFs());
  try {
    const response = await fetch(url("/tmp/a.mkv"), { method: "HEAD", headers: { range: "bytes=0-9" } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes 0-9/${SIZE}`);
    assert.equal(Number(response.headers.get("content-length")), 10);
    assert.equal(await response.text(), "");
    assert.equal(fs.reads.length, 0, "HEAD never reads bytes");
  } finally {
    await server.close();
  }
});

test("an unsatisfiable range answers 416 with the size", async () => {
  const { server, url } = await mount(stubFs());
  try {
    const response = await fetch(url("/tmp/a.mp4"), { headers: { range: `bytes=${SIZE}-` } });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), `bytes */${SIZE}`);
  } finally {
    await server.close();
  }
});

test("paths and methods outside the contract are refused", async () => {
  const { server, origin, url } = await mount(stubFs());
  try {
    assert.equal((await fetch(url("relative/clip.mp4"))).status, 400);
    assert.equal((await fetch(`${origin}/media/${server.token}`)).status, 400);
    assert.equal((await fetch(url("/tmp/a.mp4"), { method: "POST", body: "x" })).status, 405);
    assert.equal((await fetch(url("/tmp/a.mp4"), { method: "DELETE" })).status, 405);
  } finally {
    await server.close();
  }
});

test("missing, non-file and oversized targets are refused", async () => {
  const missing = await mount(stubFs({ absent: true }));
  try {
    assert.equal((await fetch(missing.url("/tmp/a.mp4"))).status, 404);
  } finally {
    await missing.server.close();
  }
  const directory = await mount(stubFs({ type: "directory" }));
  try {
    assert.equal((await fetch(directory.url("/tmp/a.mp4"))).status, 403);
  } finally {
    await directory.server.close();
  }
  const huge = await mount(stubFs(), { maxBytes: 1024 });
  try {
    assert.equal((await fetch(huge.url("/tmp/a.mp4"))).status, 413);
  } finally {
    await huge.server.close();
  }
});

test("each server gets its own capability token", async () => {
  const first = await mount(stubFs(), {}, null);
  const second = await mount(stubFs(), {}, null);
  try {
    assert.notEqual(first.server.token, second.server.token);
    assert.ok(first.server.token.length >= 16, "the token is long enough to be unguessable");
    assert.notEqual(first.origin, second.origin);
    assert.equal((await fetch(`${first.origin}/media/${second.server.token}?path=%2Ftmp%2Fa.mp4`)).status, 404);
  } finally {
    await first.server.close();
    await second.server.close();
  }
});
