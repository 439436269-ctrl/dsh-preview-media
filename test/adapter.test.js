import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const PACKAGE_ROOT = new URL("..", import.meta.url);

/**
 * Copy the real `lib/` into a temporary tree with a stub schemastery, so the
 * host entry can be imported without the DSH runtime present. This is the
 * adapter layer: it proves `apply()` wires the route and the index injection,
 * which the pure unit tests cannot.
 * @returns the module namespace and the temp root.
 */
async function mountHostEntry() {
  const root = await mkdtemp(join(tmpdir(), "preview-media-adapter-"));
  await cp(new URL("lib", PACKAGE_ROOT), join(root, "lib"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "dsh-preview-media", type: "module" }));
  const schemasteryDir = join(root, "node_modules", "@deepseek-ai", "schemastery");
  await mkdir(schemasteryDir, { recursive: true });
  await writeFile(
    join(schemasteryDir, "package.json"),
    JSON.stringify({ name: "@deepseek-ai/schemastery", version: "0.0.0", type: "module", main: "index.js" })
  );
  // A chainable no-op schema: every builder returns itself, so `Config` exists
  // and the schema file imports cleanly.
  await writeFile(
    join(schemasteryDir, "index.js"),
    [
      "const chain = () => {",
      "  const node = new Proxy(function () {}, {",
      "    get: (_target, key) => (key === 'then' ? undefined : chain()),",
      "    apply: () => chain(),",
      "  });",
      "  return node;",
      "};",
      "const z = new Proxy({}, { get: () => () => chain() });",
      "export default z;",
    ].join("\n")
  );
  const module = await import(pathToFileURL(join(root, "lib", "index.js")).href);
  return { module, root };
}

test("the host entry exposes name, inject and Config", async () => {
  const { module, root } = await mountHostEntry();
  try {
    assert.equal(module.name, "preview-media");
    assert.deepEqual(module.inject, ["fs", "connection"]);
    assert.ok(module.Config !== undefined, "the schema is exported for the loader");
    assert.equal(typeof module.apply, "function");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("apply registers the route and publishes the configured path to the page", async () => {
  const { module, root } = await mountHostEntry();
  try {
    let route;
    const injected = [];
    const effects = [];
    const handlers = [];
    let disposed = 0;
    const ctx = {
      fs: {
        resolve: async (path) => ({ key: path }),
        stat: async () => ({ type: "file", size: 4 }),
        readByteRange: async () => new Uint8Array([1, 2, 3, 4]),
      },
      connection: {
        fetch: {
          register: (entry) => {
            route = entry;
            return () => {
              disposed += 1;
            };
          },
        },
      },
      effect: (factory, label) => {
        const cleanup = factory();
        effects.push({ label, cleanup: typeof cleanup === "function" ? cleanup : undefined });
      },
      on: (event, listener) => {
        assert.equal(event, "webserver/index-inject");
        handlers.push(listener);
      },
    };
    module.apply(ctx, { routePath: "/api/custom-media", chunkBytes: 64 * 1024 });
    assert.equal(route.path, "/api/custom-media");
    assert.equal(route.requestBody, "buffered");
    assert.deepEqual(route.methods, ["GET", "HEAD"]);
    assert.ok(effects.some((entry) => entry.label === "preview-media: stream route"));
    assert.ok(effects.some((entry) => entry.label === "preview-media: loopback stream"));

    for (const handler of handlers) handler(injected);
    assert.equal(injected.length, 1);
    assert.equal(injected[0].kind, "global");
    assert.equal(injected[0].name, "__DSH_PREVIEW_MEDIA_CONFIG__");
    assert.deepEqual(injected[0].value, { routePath: "/api/custom-media", loopback: true, debug: false });

    // The mounted route still answers.
    const response = await route.fetch(new Request("http://x/api/custom-media?path=/tmp/a.mp4"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "video/mp4");

    // Discovery reports nothing until the loopback listener is up; either
    // answer is valid JSON with a null-or-object `loopback`.
    const discovered = await route.fetch(new Request("http://x/api/custom-media?discover=1"));
    assert.equal(discovered.status, 200);
    const body = await discovered.json();
    assert.ok(body.loopback === null || typeof body.loopback === "object");

    for (const entry of effects) await entry.cleanup?.();
    assert.equal(disposed, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a disabled plugin mounts no route", async () => {
  const { module, root } = await mountHostEntry();
  try {
    const injected = [];
    const ctx = {
      fs: {},
      connection: { fetch: { register: () => assert.fail("route must not be registered") } },
      effect: () => {},
      on: () => injected.push("on"),
    };
    module.apply(ctx, { enabled: false });
    assert.deepEqual(injected, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the package declares the client half and ships only lib/**/*.js", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", PACKAGE_ROOT), "utf8"));
  assert.equal(manifest.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(manifest.dsh.client.platform, "web");
  assert.ok(manifest.dsh.client.inject.includes("@deepseek-ai/dsh-client-ui-sidebar-documentpreview"));
  assert.ok(manifest.files.includes("lib/**/*.js"));
  assert.ok(manifest.files.includes("cordis.patch.yml"));
  assert.equal(manifest.exports["./client"], "./lib/client.js");
  assert.deepEqual(manifest.peerDependencies, { "@deepseek-ai/cordis": "^4.0.1" });
  assert.ok(existsSync(new URL("cordis.patch.yml", PACKAGE_ROOT)));
});
