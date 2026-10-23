/**
 * Host configuration defaults and normalization.
 *
 * The schemastery schema lives in `./schema.js` so this module stays importable
 * without the host-supplied `@deepseek-ai/schemastery` package (unit tests and
 * the route run against these helpers directly).
 *
 * @module dsh-preview-media/config
 */

/** Suffixes handed to the browser's native video element. */
export const DEFAULT_VIDEO_EXTENSIONS = [
  "mp4",
  "m4v",
  "mov",
  "webm",
  "ogv",
  "ogg",
  "mkv",
  "avi",
  "wmv",
  "flv",
  "3gp",
  "ts",
  "m2ts",
  "mts",
];

/** Suffixes handed to the browser's native audio element. */
export const DEFAULT_AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "flac",
  "m4a",
  "aac",
  "oga",
  "opus",
  "weba",
  "wma",
  "aiff",
  "aif",
];

/** Largest file the route agrees to stream, in bytes (2 GiB). */
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Bytes per ranged read; one HTTP response is produced from a sequence of these. */
export const DEFAULT_CHUNK_BYTES = 1024 * 1024;

/** Fallback when the loader supplies no config object at all. */
export const DEFAULTS = Object.freeze({
  enabled: true,
  routePath: "/api/preview/media",
  loopback: true,
  debug: false,
  maxBytes: DEFAULT_MAX_BYTES,
  chunkBytes: DEFAULT_CHUNK_BYTES,
  videoExtensions: DEFAULT_VIDEO_EXTENSIONS,
  audioExtensions: DEFAULT_AUDIO_EXTENSIONS,
});

/**
 * Merge a loader-supplied config over the defaults, normalizing the parts the
 * route depends on. Hand-written rather than schema-driven because the loader
 * may call `apply()` with a raw object while the settings page goes through
 * `Config`.
 * @param config - whatever the loader supplied.
 * @returns a complete, validated-enough config.
 */
export function resolveConfig(config) {
  const input = config !== null && typeof config === "object" ? config : {};
  const video = normalizeExtensions(input.videoExtensions, DEFAULT_VIDEO_EXTENSIONS);
  const audio = normalizeExtensions(input.audioExtensions, DEFAULT_AUDIO_EXTENSIONS);
  const chunkBytes = Math.min(
    Math.max(toPositiveInteger(input.chunkBytes, DEFAULT_CHUNK_BYTES), 64 * 1024),
    16 * 1024 * 1024
  );
  return {
    enabled: input.enabled === undefined ? DEFAULTS.enabled : input.enabled === true,
    routePath: normalizeRoutePath(input.routePath),
    // The desktop shell proxies the page through `dsh-app://`, and Chromium
    // cannot seek media that a custom-protocol handler produced; the loopback
    // origin is what makes the timeline draggable there.
    loopback: input.loopback === undefined ? DEFAULTS.loopback : input.loopback === true,
    debug: input.debug === undefined ? DEFAULTS.debug : input.debug === true,
    maxBytes: toPositiveInteger(input.maxBytes, DEFAULT_MAX_BYTES),
    chunkBytes,
    videoExtensions: video,
    audioExtensions: audio,
  };
}

/** Normalize one suffix list, falling back to the defaults for an empty answer. */
function normalizeExtensions(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const cleaned = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const suffix = entry.trim().replace(/^\.+/, "").toLowerCase();
    if (suffix === "" || cleaned.includes(suffix)) continue;
    cleaned.push(suffix);
  }
  return cleaned.length > 0 ? cleaned : [...fallback];
}

/** Keep the route under /api; anything else would skip the authenticated fence. */
function normalizeRoutePath(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  const candidate = raw === "" ? DEFAULTS.routePath : raw;
  const withSlash = candidate.startsWith("/") ? candidate : `/${candidate}`;
  if (!withSlash.startsWith("/api/")) return DEFAULTS.routePath;
  return withSlash.replace(/\/+$/, "");
}

/** A positive integer from an untrusted value, or the fallback. */
function toPositiveInteger(value, fallback) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : fallback;
}
