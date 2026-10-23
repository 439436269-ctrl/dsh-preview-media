import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConfig } from "../lib/config.js";
import { registerMediaRoute } from "../lib/route.js";

/** A two-megabyte deterministic fixture: byte i is i % 251. */
const SIZE = 2 * 1024 * 1024;
const FIXTURE = Buffer.alloc(SIZE);
for (let index = 0; index < SIZE; index += 1) FIXTURE[index] = index % 251;

/**
 * Stand-in for the composed filesystem: only the members the route calls.
 * @param options - size override and error injection.
 * @returns the stub and the read log.
 */
function stubFs(options = {}) {
  const reads = [];
  const size = options.size ?? SIZE;
  return {
    reads,
    async resolve(path) {
      if (options.resolveError !== undefined) throw options.resolveError;
      return { key: path, displayPath: path };
    },
    async stat() {
      if (options.statError !== undefined) throw options.statError;
      if (options.absent === true) return undefined;
      return { version: "v1", type: options.type ?? "file", size };
    },
    async readByteRange(_target, range) {
      reads.push({ ...range });
      if (options.readError !== undefined) throw options.readError;
      return FIXTURE.subarray(range.offset, Math.min(range.offset + range.length, SIZE));
    },
  };
}

/**
 * Register the route against a stub host and return the fetch face.
 * @param fs - stub filesystem.
 * @param overrides - config overrides.
 * @param hooks - route hooks (`describeLoopback`).
 * @returns the fetch function the guest would call.
 */
function mount(fs, overrides = {}, hooks = {}) {
  let route;
  const ctx = {
    fs,
    connection: {
      fetch: {
        register: (entry) => {
          route = entry;
          return () => {};
        },
      },
    },
  };
  const config = resolveConfig({ chunkBytes: 64 * 1024, ...overrides });
  registerMediaRoute(ctx, config, hooks);
  assert.ok(route, "the route was registered");
  assert.deepEqual(route.methods, ["GET", "HEAD"]);
  assert.equal(route.path, "/api/preview/media");
  return route.fetch;
}

/**
 * Read a fetch response body into one buffer.
 * @param response - the response under test.
 * @returns its bytes.
 */
async function bodyOf(response) {
  return Buffer.from(await response.arrayBuffer());
}

test("a plain GET streams the whole file with length and accept-ranges", async () => {
  const fs = stubFs();
  const fetch = mount(fs);
  const response = await fetch(new Request("http://x/api/preview/media?path=D%3A%5Ccodes%5Cclip.mp4"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-range"), null);
  assert.equal(Number(response.headers.get("content-length")), SIZE);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  const body = await bodyOf(response);
  assert.equal(body.byteLength, SIZE);
  assert.deepEqual(body.subarray(0, 4), FIXTURE.subarray(0, 4));
  assert.deepEqual(body.subarray(SIZE - 4), FIXTURE.subarray(SIZE - 4));
  assert.ok(fs.reads.length >= 1);
  for (const read of fs.reads) assert.ok(read.length <= 64 * 1024, "one read never exceeds the chunk size");
});

test("a ranged GET answers 206 with the requested window only", async () => {
  const fs = stubFs();
  const fetch = mount(fs);
  const response = await fetch(
    new Request("http://x/api/preview/media?path=/tmp/a.webm", { headers: { range: "bytes=100-199" } })
  );
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), `bytes 100-199/${SIZE}`);
  assert.equal(Number(response.headers.get("content-length")), 100);
  const body = await bodyOf(response);
  assert.equal(body.byteLength, 100);
  assert.deepEqual(body, FIXTURE.subarray(100, 200));
});

test("an open-ended range streams to the end", async () => {
  const fetch = mount(stubFs());
  const response = await fetch(
    new Request("http://x/api/preview/media?path=/tmp/a.mp3", { headers: { range: `bytes=${SIZE - 10}-` } })
  );
  assert.equal(response.status, 206);
  assert.equal(Number(response.headers.get("content-length")), 10);
  assert.deepEqual(await bodyOf(response), FIXTURE.subarray(SIZE - 10));
});

test("HEAD answers headers without a body", async () => {
  const fs = stubFs();
  const fetch = mount(fs);
  const response = await fetch(
    new Request("http://x/api/preview/media?path=/tmp/a.mkv", { method: "HEAD", headers: { range: "bytes=0-9" } })
  );
  assert.equal(response.status, 206);
  assert.equal(Number(response.headers.get("content-length")), 10);
  assert.equal(response.headers.get("content-range"), `bytes 0-9/${SIZE}`);
  assert.equal(response.body, null);
  assert.equal(fs.reads.length, 0, "HEAD never reads bytes");
});

test("an unsatisfiable range answers 416 with the size", async () => {
  const fetch = mount(stubFs());
  const response = await fetch(
    new Request("http://x/api/preview/media?path=/tmp/a.mp4", { headers: { range: `bytes=${SIZE}-` } })
  );
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("content-range"), `bytes */${SIZE}`);
});

test("missing and relative paths are refused", async () => {
  const fetch = mount(stubFs());
  assert.equal((await fetch(new Request("http://x/api/preview/media"))).status, 400);
  assert.equal((await fetch(new Request("http://x/api/preview/media?path="))).status, 400);
  assert.equal((await fetch(new Request("http://x/api/preview/media?path=relative%2Fclip.mp4"))).status, 400);
});

test("filesystem failures map onto HTTP statuses", async () => {
  assert.equal((await fetchFrom({ absent: true })(request())).status, 404);
  assert.equal((await fetchFrom({ type: "directory" })(request())).status, 403);
  assert.equal(
    (await fetchFrom({ resolveError: Object.assign(new Error("nope"), { code: "FS_NOT_FOUND" }) })(request())).status,
    404
  );
  assert.equal(
    (await fetchFrom({ resolveError: Object.assign(new Error("denied"), { code: "FS_SANDBOX_DENIED" }) })(request()))
      .status,
    403
  );
  assert.equal(
    (await fetchFrom({ statError: Object.assign(new Error("large"), { code: "FS_TOO_LARGE" }) })(request())).status,
    413
  );
  assert.equal((await fetchFrom({ statError: new Error("boom") })(request())).status, 500);
});

test("files above the configured cap are refused", async () => {
  const fetch = mount(stubFs({ size: SIZE }), { maxBytes: 1024 });
  const response = await fetch(request());
  assert.equal(response.status, 413);
});

test("a disabled plugin answers 503", async () => {
  const fetch = mount(stubFs(), { enabled: false });
  assert.equal((await fetch(request())).status, 503);
});

test("discovery reports the loopback capability without touching the filesystem", async () => {
  const fs = stubFs();
  const fetch = mount(fs, {}, { describeLoopback: () => ({ origin: "http://127.0.0.1:51234", token: "cap" }) });
  const response = await fetch(new Request("http://x/api/preview/media?discover=1"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await response.json(), {
    loopback: { origin: "http://127.0.0.1:51234", token: "cap" },
  });
  assert.equal(fs.reads.length, 0);
});

test("discovery answers null when no loopback origin is running", async () => {
  const fetch = mount(stubFs());
  const response = await fetch(new Request("http://x/api/preview/media?discover=1"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { loopback: null });
});

test("diagnostic reports are decoded, logged and acknowledged", async () => {
  const logged = [];
  const fetch = mount(stubFs(), {}, { log: (event, data) => logged.push({ event, data }) });
  const payload = { phase: "seeked", base: "loopback", currentTime: 12.5 };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const response = await fetch(new Request(`http://x/api/preview/media?diag=1&data=${data}`));
  assert.equal(response.status, 204);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].event, "client");
  assert.deepEqual(logged[0].data, payload);
});

test("an unreadable diagnostic report is refused", async () => {
  const fetch = mount(stubFs(), {}, { log: () => assert.fail("nothing to log") });
  assert.equal((await fetch(new Request("http://x/api/preview/media?diag=1&data=%7Bbad"))).status, 400);
  assert.equal((await fetch(new Request("http://x/api/preview/media?diag=1"))).status, 400);
});

/** Convenience for the failure cases. */
function request() {
  return new Request("http://x/api/preview/media?path=/tmp/a.mp4");
}

/** Mount one stub filesystem and return its fetch face. */
function fetchFrom(options) {
  return mount(stubFs(options));
}
