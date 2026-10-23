/**
 * Opt-in diagnostics for the player and the loopback origin.
 *
 * When `debug` is on, the Host appends one JSON line per event to
 * `$DSH_HOME/preview-media-debug.log`: every request the loopback origin
 * answered (method, Range, status, bytes) and every report the browser half
 * sends through `GET <routePath>?diag=1&data=<base64url>`. That is the only way
 * to see what happens inside the desktop shell, whose renderer console is not
 * reachable from outside.
 *
 * Off by default; a no-op logger when disabled.
 *
 * @module dsh-preview-media/debug
 */
import { appendFileSync, mkdirSync, statSync, truncateSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Rotate once the log passes this size; diagnostics must never grow forever. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Largest client report accepted, in characters. */
const MAX_REPORT_CHARS = 4_000;

/**
 * Build the logger the Host hands to the route and the loopback server.
 * @param enabled - whether `debug` is on.
 * @param file - override for tests.
 * @returns `{ file, log }`; `log` does nothing when disabled.
 */
export function createDebugLog(enabled, file = defaultLogFile()) {
  if (enabled !== true) return { file, log: () => {} };
  return {
    file,
    log(event, data) {
      try {
        mkdirSync(join(file, ".."), { recursive: true });
        const size = statSync(file, { throwIfNoEntry: false })?.size ?? 0;
        if (size > MAX_BYTES) truncateSync(file, 0);
        appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), event, ...data }) + "\n");
      } catch {
        /* diagnostics must never break playback */
      }
    }
  };
}

/** Where reports land when the deployment does not override it. */
export function defaultLogFile() {
  return join(homedir(), ".dsh", "preview-media-debug.log");
}

/**
 * Decode the browser half's report from the query string.
 * @param raw - `data` parameter value.
 * @returns the parsed object, or undefined when it is not a usable report.
 */
export function decodeReport(raw) {
  if (typeof raw !== "string" || raw === "" || raw.length > MAX_REPORT_CHARS) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return parsed !== null && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}
