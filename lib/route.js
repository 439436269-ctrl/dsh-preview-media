/**
 * The authenticated streaming route: `GET|HEAD <routePath>?path=<absolute>`.
 *
 * The route lives under `/api/`, so the composition's connection service has
 * already fenced and authenticated the request before this handler runs.
 * Answers are fetch-shaped: the shared bridge writes them to the node response
 * and pipes the body through, so a video is read and forwarded a chunk at a
 * time instead of being buffered whole.
 *
 * @module dsh-preview-media/route
 */
import { Readable } from "node:stream";
import { decodeReport } from "./debug.js";
import { mediaTypeOf } from "./mime.js";
import { contentRange, resolveRange, splitWindow, windowLength } from "./range.js";

/** Headers shared by every answer; media content is user data, never cached. */
const BASE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'"
};

/**
 * Register the media route for the plugin's lifetime.
 * @param ctx - host context carrying `fs` and `connection`.
 * @param config - resolved configuration.
 * @param hooks - optional `describeLoopback` (for `?discover=1`) and `log` (for `?diag=1`).
 * @returns the disposer removing the route.
 */
export function registerMediaRoute(ctx, config, hooks = {}) {
  return ctx.connection.fetch.register({
    path: config.routePath,
    methods: ["GET", "HEAD"],
    requestBody: "buffered",
    fetch: (request) => serve(request, ctx.fs, config, hooks)
  });
}

/**
 * Answer one request.
 * @param request - fetch request built by the bridge.
 * @param fs - composed filesystem provider.
 * @param config - resolved configuration.
 * @param hooks - optional `describeLoopback` and `log`.
 * @returns the response, possibly streaming.
 */
async function serve(request, fs, config, hooks = {}) {
  if (!config.enabled) return fail(503, "media preview is disabled");
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  const url = new URL(request.url);
  // Capability discovery: the desktop shell cannot seek media served over its
  // custom protocol, so the browser half asks where the loopback origin is.
  if (url.searchParams.get("discover") === "1") {
    const loopback = typeof hooks.describeLoopback === "function" ? hooks.describeLoopback() : undefined;
    return new Response(JSON.stringify({ loopback: loopback ?? null }), {
      status: 200,
      headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8" }
    });
  }
  // Opt-in diagnostics: the desktop renderer console is unreachable, so the
  // browser half posts its state here and the Host appends it to a log file.
  if (url.searchParams.get("diag") === "1") {
    const report = decodeReport(url.searchParams.get("data"));
    if (report === undefined) return fail(400, "invalid report");
    if (typeof hooks.log === "function") hooks.log("client", report);
    return new Response(null, { status: 204, headers: BASE_HEADERS });
  }
  const path = url.searchParams.get("path");
  if (path === null || path === "") return fail(400, "missing path");
  if (path.includes("\0") || !isAbsolutePath(path)) return fail(400, "absolute path required");

  const signal = request.signal;
  try {
    const target = await fs.resolve(path, { signal });
    const info = await fs.stat(target, signal);
    if (info === undefined) return fail(404, "not found");
    if (info.type !== "file") return fail(403, "not a regular file");
    const size = typeof info.size === "number" ? info.size : 0;
    if (size > config.maxBytes) return fail(413, "file exceeds the configured byte limit");
    if (size === 0) return fail(416, "empty file", { "Content-Range": "bytes */0" });

    const range = resolveRange(request.headers.get("range"), size);
    if (range.kind === "unsatisfiable") {
      return fail(416, "range not satisfiable", { "Content-Range": `bytes */${size}` });
    }

    const window = range.kind === "window" ? range.window : { start: 0, end: size - 1 };
    const headers = {
      ...BASE_HEADERS,
      "Accept-Ranges": "bytes",
      "Content-Type": mediaTypeOf(path),
      "Content-Length": String(windowLength(window))
    };
    if (range.kind === "window") headers["Content-Range"] = contentRange(window, size);
    const status = range.kind === "window" ? 206 : 200;
    if (method === "HEAD") return new Response(null, { status, headers });

    return new Response(streamWindow(fs, target, window, config.chunkBytes, signal), {
      status,
      headers
    });
  } catch (error) {
    return fail(fsStatusOf(error), fsCodeOf(error));
  }
}

/**
 * Yield the window's bytes chunk by chunk.
 * @param fs - composed filesystem provider.
 * @param target - resolved file target.
 * @param window - inclusive byte window.
 * @param chunkBytes - largest single read.
 * @param signal - aborts on a closed connection.
 * @returns the byte stream handed to the response.
 */
function streamWindow(fs, target, window, chunkBytes, signal) {
  const chunks = splitWindow(window, chunkBytes);
  const source = (async function* readChunks() {
    for (const chunk of chunks) {
      if (signal.aborted) return;
      const bytes = await fs.readByteRange(target, { offset: chunk.start, length: windowLength(chunk) }, signal);
      if (signal.aborted) return;
      if (bytes.byteLength > 0) yield bytes;
    }
  })();
  return Readable.toWeb(Readable.from(source));
}

/** One small text answer with the shared headers. */
function fail(status, message, extra) {
  return new Response(message, {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra }
  });
}

/** Absolute in either spelling the Host accepts. */
function isAbsolutePath(path) {
  return path.startsWith("/") || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith("\\\\");
}

/** Map a filesystem failure onto an HTTP status. */
function fsStatusOf(error) {
  const code = fsCodeOf(error);
  switch (code) {
    case "FS_NOT_FOUND":
      return 404;
    case "FS_NOT_REGULAR_FILE":
    case "FS_PERMISSION_DENIED":
    case "FS_SANDBOX_DENIED":
      return 403;
    case "FS_TOO_LARGE":
      return 413;
    case "FS_ABORTED":
      return 499;
    default:
      return 500;
  }
}

/** The typed filesystem error code, when this is one. */
function fsCodeOf(error) {
  if (error !== null && typeof error === "object" && typeof error.code === "string") return error.code;
  return "FS_UNKNOWN";
}
