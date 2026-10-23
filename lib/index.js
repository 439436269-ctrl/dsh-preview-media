/**
 * dsh-preview-media — play video and audio files inside the DSH right-Sidebar
 * document preview instead of the built-in "this format cannot be previewed"
 * empty state.
 *
 * Two halves, one package:
 * - this file is the Host half: it registers an authenticated
 *   `GET|HEAD /api/preview/media?path=<absolute>` route that streams file bytes
 *   with HTTP Range support, so a player can seek without downloading the whole
 *   file, and publishes the route path to the browser through the index
 *   injection table. It also runs a token-guarded loopback origin for the
 *   desktop shell, whose `dsh-app://` protocol cannot seek media.
 * - `./client` is the browser half: it registers a document-preview renderer
 *   for video and audio suffixes and draws the native player in the preview
 *   body.
 *
 * @module dsh-preview-media
 */
import { resolveConfig } from "./config.js";
import { createDebugLog } from "./debug.js";
import { createLoopbackServer } from "./loopback.js";
import { Config } from "./schema.js";
import { registerMediaRoute } from "./route.js";

/** Plugin name, also the settings-page namespace through the bundle patch. */
export const name = "preview-media";

/** Host services the route needs: the filesystem it streams from, and the auth fence. */
export const inject = ["fs", "connection"];

export { Config };

/**
 * Mount the streaming route, the loopback origin, and expose the route path to
 * the browser half.
 * @param ctx - host context carrying `fs`, `connection`, and the web server.
 * @param config - loader-supplied configuration.
 */
export function apply(ctx, config) {
  const settings = resolveConfig(config);
  if (!settings.enabled) return;

  /** Where the loopback origin currently lives, once its listener is up. */
  const loopback = { current: undefined };
  const { log } = createDebugLog(settings.debug);

  if (settings.loopback) {
    ctx.effect(() => {
      let closed = false;
      const server = createLoopbackServer({ fs: ctx.fs, config: settings, log });
      server.listen().then(
        (origin) => {
          if (closed) return;
          loopback.current = { origin, token: server.token };
          log("loopback-listening", { origin });
        },
        (error) => {
          // A missing loopback is not fatal: the authenticated route still
          // plays, it just cannot seek inside the desktop shell.
          if (typeof ctx.logger?.warn === "function") ctx.logger.warn("preview-media: loopback origin unavailable", error);
          log("loopback-failed", { message: error instanceof Error ? error.message : String(error) });
        }
      );
      return () => {
        closed = true;
        loopback.current = undefined;
        void server.close();
      };
    }, "preview-media: loopback stream");
  }

  ctx.effect(
    () => registerMediaRoute(ctx, settings, { describeLoopback: () => loopback.current ?? null, log }),
    "preview-media: stream route"
  );

  // The client reads its route from the served page, so a configured path and
  // the client's URL can never drift apart. `loopback` only advertises that the
  // Host half runs the extra origin; its port arrives through `?discover=1`.
  ctx.on("webserver/index-inject", (table) => {
    table.push({
      kind: "global",
      name: "__DSH_PREVIEW_MEDIA_CONFIG__",
      value: { routePath: settings.routePath, loopback: settings.loopback, debug: settings.debug },
    });
  });
}
