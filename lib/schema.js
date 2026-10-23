/**
 * The schemastery schema alone, separated from the defaulting helpers so
 * `lib/config.js` stays importable in a plain `node --test` run (schemastery is
 * supplied by the DSH host at runtime, not by this package).
 *
 * @module dsh-preview-media/schema
 */
import z from "@deepseek-ai/schemastery";

/** Largest file the route streams by default (2 GiB). */
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** Bytes per ranged read by default. */
const CHUNK_BYTES = 1024 * 1024;

/** Suffixes handed to the browser's native video element. */
const VIDEO = ["mp4", "m4v", "mov", "webm", "ogv", "ogg", "mkv", "avi", "wmv", "flv", "3gp", "ts", "m2ts", "mts"];
/** Suffixes handed to the browser's native audio element. */
const AUDIO = ["mp3", "wav", "flac", "m4a", "aac", "oga", "opus", "weba", "wma", "aiff", "aif"];

/** Schema the loader validates and the settings page renders. */
export const Config = z.object({
  enabled: z.boolean().default(true).description(
    "Serve the streaming route at all. Off keeps the preview renderer registered but transfers no bytes."
  ),
  routePath: z.string().default("/api/preview/media").description(
    "Absolute pathname of the authenticated GET/HEAD route; it must stay under /api so the connection fence authenticates it."
  ),
  loopback: z.boolean().default(true).description(
    "Also serve bytes from a token-guarded 127.0.0.1 origin. The desktop shell proxies the page through dsh-app://, where Chromium cannot seek media (dragging the timeline jumps back to the start); the loopback origin fixes that. Off means the desktop player can only play, not seek."
  ),
  debug: z.boolean().default(false).description(
    "Write player and loopback diagnostics to $DSH_HOME/preview-media-debug.log (one JSON line per event). Leave off unless you are diagnosing a playback problem."
  ),
  maxBytes: z.number().step(1).min(1).default(MAX_BYTES).description(
    "Largest file the route will stream, in bytes."
  ),
  chunkBytes: z.number().step(1).min(65536).max(16 * 1024 * 1024).default(CHUNK_BYTES).description(
    "Bytes per ranged read; each response body is a sequence of these."
  ),
  videoExtensions: z.array(z.string()).default(VIDEO).description(
    "Suffixes rendered by the video player (no leading dot, lowercase)."
  ),
  audioExtensions: z.array(z.string()).default(AUDIO).description(
    "Suffixes rendered by the audio player (no leading dot, lowercase)."
  ),
});
