# Changelog

## 0.1.5 — 2026-10-24

- When the desktop loopback origin reports `MEDIA_ERR_SRC_NOT_SUPPORTED` (code 4), retry the authenticated route once even if metadata already arrived. The loopback is the desktop-only transport; a code-4 failure there is not proof that the file's codec is unsupported. The retry may lose loopback seeking, but it prioritizes playback and avoids a misleading "codec unsupported" message when the authenticated route can play the file.

## 0.1.4 — 2026-10-21

Diagnostics for playback problems, and a stricter fallback.

- New **`debug`** setting (off by default). When on, the Host appends one JSON line per event to `$DSH_HOME/preview-media-debug.log`: every request the loopback origin answered (method, `Range`, status, window, size) and every report the player posts to `GET <routePath>?diag=1` (which origin it chose, `seekable` ranges, `seeking` / `seeked` / `error` / `stalled` / `playing` events, and a one-shot reachability probe of the loopback origin). The renderer console of the desktop shell is unreachable from outside, so this is the only way to see what a player inside it actually does.
- The loopback fallback is now **stricter**: an error after metadata has arrived no longer switches to the non-seekable authenticated route, because that switch silently traded a seekable player for a non-seekable one. Only a loopback origin that never produced metadata falls back.

## 0.1.3 — 2026-10-20

Seeking in the desktop app, via a loopback media origin.

- **Desktop timeline seeking.** The desktop shell serves the page from `dsh-app://app` and proxies every request through `protocol.handle`; Chromium cannot seek a media response produced by a custom-protocol handler (it reports `video.seekable` as `[0, 0]`), so dragging the native timeline snapped back to the start of the file. The Host now also listens on an ephemeral `127.0.0.1` port (the new `loopback` setting, on by default) and publishes the capability token through `GET /api/preview/media?discover=1`; inside the shell the player streams from that origin over real HTTP `Range`.
- The loopback listener binds `127.0.0.1` only, every request must carry the per-boot token in its path (otherwise a bare `404`), and bytes still come from the composed `fs` provider, so the deployment's filesystem policy is unchanged.
- A blocked or refused loopback origin falls back to the authenticated route automatically: playback degrades to the old (non-seekable) behaviour instead of failing.
- Browsers are untouched: `dsh web` keeps using `/api/preview/media`, with the same `206` windows as before.

## 0.1.2 — 2026-10-17

Playback speed and looping.

- A **倍速 / Speed** button cycles 1× → 1.25× → 1.5× → 1.75× → 2× → 0.5× → 0.75× and shows the rate in force. The rate is re-applied after a source change (a new `src` resets `playbackRate`).
- A **循环 / Loop** button toggles `loop`, with an active state on the button.
- Both controls appear for audio as well as video, and the choice is remembered per browser in `localStorage` (`dsh-preview-media:playback`); a blocked store silently falls back to in-memory state.

## 0.1.1 — 2026-10-16

Fit the video to the pane instead of letting it overflow.

- A portrait clip used to render at the pane's full width and spill past the bottom edge (`width: 100%` plus an aspect-derived height). The player now sits in a flexible frame that fills the pane and the video uses `object-fit: contain`, so the whole frame is visible at once with the native controls reachable.
- The frame keeps a black letterbox and a rounded border; the loading/error hint sits under it instead of over the picture.

## 0.1.0 — 2026-10-16

First release.

- Document preview renderers for video (`mp4`, `m4v`, `mov`, `webm`, `ogv`, `ogg`, `mkv`, `avi`, `wmv`, `flv`, `3gp`, `ts`, `m2ts`, `mts`) and audio (`mp3`, `wav`, `flac`, `m4a`, `aac`, `oga`, `opus`, `weba`, `wma`, `aiff`, `aif`), registered at the `extension` band with `loading: 'renderer'`.
- Authenticated `GET|HEAD /api/preview/media?path=<absolute>` route with `Accept-Ranges`, single-window `206` responses, `416` on an unsatisfiable window, and `HEAD` without a body.
- Chunked reads through `ctx.fs.readByteRange`, so memory stays flat regardless of file size.
- Native player body with full-screen and picture-in-picture actions for video, and a name/size card for audio.
- Config: `enabled`, `routePath`, `maxBytes`, `chunkBytes`, `videoExtensions`, `audioExtensions`.
- Tests: 32 `node --test` cases over range parsing, config normalization, HTTP status mapping, adapter mounting and the browser bundle.
