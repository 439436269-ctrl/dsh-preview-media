# dsh-preview-media

Video and audio preview for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): play `mp4`, `mov`, `mkv`, `webm` and `mp3`, `flac`, `wav` right inside the right-Sidebar document preview instead of the built-in “this format cannot be previewed” empty state.

**中文** | English (this file) · [中文说明](README.zh.md)

## Why

The built-in preview registers renderers for text, code, Markdown, images, PDF, HTML, Office and spreadsheets, and lists video/audio suffixes as *known binary containers with no renderer* — so opening a video shows an icon and one line of text. This plugin registers those suffixes and draws the browser's native player, fed by an authenticated streaming route that honours HTTP `Range`, so seeking works and a 2 GB file is never loaded into memory or into the conversation.

## Install

```sh
dsh plugin --profile <profile> add dsh-preview-media
```

Then restart the desktop app (a profile patch change is read at boot). No configuration is required; the defaults cover the common suffixes.

To check it loaded, open any `.mp4` from the Files tab: the preview pane shows the player rather than the unsupported-format notice.

![Video preview](docs/video-preview.png)
![Audio preview](docs/audio-preview.png)

## What it does

- **Renderer** — registers two document-previews implementations, `dsh-preview-media/video` (video suffixes) and `dsh-preview-media/audio` (audio suffixes), with priority `extension`, `loading: 'renderer'`, and their suffixes declared binary so the “plain text” fallback is not offered.
- **Player** — a native `<video>`/`<audio>` element with the browser's own controls. The video is fitted into the pane with `object-fit: contain` inside a flexible frame, so a portrait or landscape clip is fully visible at once, with black letterboxing instead of spilling past the preview edge. Below it sit **倍速 / Speed** (cycles 1× → 1.25× → 1.5× → 1.75× → 2× → 0.5× → 0.75×), **循环 / Loop**, and — for video — **全屏 / Full screen** and **画中画 / Picture in picture**. Speed and loop also apply to audio, and the choice is remembered per browser. Audio shows a card with the file name, its size and the player. The body reports `loaded` / `failed` back to the document preview owner so the tab's loading state settles.
- **Stream** — a Host route `GET|HEAD /api/preview/media?path=<absolute path>` that answers `200` with `Accept-Ranges: bytes`, `206` with `Content-Range` for one byte window, `416` with `Content-Range: bytes */size` for an unsatisfiable window, and `HEAD` with headers only. It reads the file a chunk at a time (`chunkBytes`, 1 MiB by default) through `ctx.fs.readByteRange`, so memory stays flat.
- **Desktop seeking** — the desktop app serves the page from `dsh-app://app` and proxies every request through `protocol.handle`. Chromium's media stack cannot seek a response produced by a custom-protocol handler (`video.seekable` collapses to `[0, 0]`), so in the desktop shell the player would play but a dragged timeline would snap back to the start. The Host therefore also listens on an ephemeral `127.0.0.1` port and hands the browser half a capability token (`GET /api/preview/media?discover=1`); in the shell the player streams from that loopback origin, where normal HTTP `Range` makes seeking work. In a plain browser the authenticated route is used as before.
- **Authentication** — the route lives under `/api/`, which means the composition's connection service applies its Host/Origin fence and browser-session cookie check before the handler runs. A cross-site page cannot read local files through it. The loopback listener binds `127.0.0.1` only and every request must carry the per-boot token in its path; without it the answer is a bare `404`. Bytes still flow through the composed `fs` provider, so the same filesystem policy applies.

## Configuration

Settings live on the `preview-media` entry (Settings → Plugins, or the profile patch). Every key has a code-side default, so a partial config is valid.

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Mount the route at all. _Off_ leaves the renderer registered but transfers no bytes (`503`). |
| `routePath` | `/api/preview/media` | Route pathname. Must start with `/api/`; anything else falls back to the default so the auth fence still applies. |
| `loopback` | `true` | Also serve bytes from the token-guarded `127.0.0.1` origin. This is what makes the desktop player seekable. _Off_ keeps only the authenticated route: the desktop shell can play but not seek. |
| `debug` | `false` | Append playback/loopback diagnostics to `$DSH_HOME/preview-media-debug.log`. Leave off unless you are diagnosing a problem. |
| `maxBytes` | `2147483648` (2 GiB) | Largest file served; larger files answer `413`. |
| `chunkBytes` | `1048576` | Bytes per ranged read. |
| `videoExtensions` | `mp4, m4v, mov, webm, ogv, ogg, mkv, avi, wmv, flv, 3gp, ts, m2ts, mts` | Suffixes the video player claims. |
| `audioExtensions` | `mp3, wav, flac, m4a, aac, oga, opus, weba, wma, aiff, aif` | Suffixes the audio player claims. |

The browser half mirrors the suffix lists in `lib/client.js`; keep them in sync when changing either side. The route path is published to the page as `__DSH_PREVIEW_MEDIA_CONFIG__` by the Host, so a configured path and the player's URL never drift apart.

## Playback support

Playback depends on the browser's own codecs, not on this plugin. Chromium/Electron plays MP4 (H.264/AAC), WebM (VP8/VP9/Opus), Ogg and most audio formats. **Matroska (`.mkv`) and AVI usually do not decode** in Chromium; the player then reports “浏览器不支持这个编码 / This codec is not supported by the browser” and the _Open in app_ control in the preview header still hands the file to the system player. Remuxing such files to MP4/WebM is the reliable fix.

## How it is built

```
lib/index.js    Host entry: name / inject / Config / apply (route, loopback origin, index injection)
lib/config.js   Defaults and normalization, no host imports (unit-testable)
lib/schema.js   schemastery Config for the loader/settings page
lib/range.js    HTTP Range interpretation, pure functions
lib/mime.js     Suffix → media type
lib/route.js    The authenticated streaming handler (fetch-shaped, chunked)
lib/loopback.js The token-guarded 127.0.0.1 media origin (node:http, Range-aware)
lib/client.js   Browser bundle: renderers, bodies, styles, copy
test/           node --test: range, config, route, loopback, adapter mount, client bundle
scripts/        Headless browser E2E + HTTP probe used for verification
```

The browser half is a hand-written module-loader bundle (`window.__ModuleLoader__.load({ id, factory })`) with `react` and `react/jsx-runtime` as its only module-table requests, so it needs no build step and cannot drift from the Host's React copy.

## Development

```sh
node --test test/*.test.js
```

For end-to-end checks, start a host with the plugin installed and run the probe:

```sh
node scripts/e2e-browser.mjs --base http://127.0.0.1:<port> --token <token> --video "<absolute path to a video>"
```

`E2E_BROWSER_CHANNEL=msedge` makes Playwright use the system Edge when the bundled Chromium is unavailable.

Seeking has its own check, including the desktop transport shape:

```sh
node scripts/e2e-seek.mjs --base http://127.0.0.1:<port> --token <token> --video "<absolute path to a video>" --simulate-desktop
```

## Known limitations

- One byte window per request; a multi-range `Range` header is answered `416`. Browsers only ever ask a media element for one window.
- `.mkv`, `.avi`, `.wmv`, `.flv` are claimed and listed, but Chromium cannot decode them; the plugin shows the player's error state rather than pretending they play.
- No playlist, subtitle-track or speed controls of its own — the native controls own those.
- If a deployment blocks the loopback origin (firewall, policy), the player falls back to the authenticated route automatically: the file still plays, but the desktop timeline is not seekable again. That is an Electron limitation ([electron#38749](https://github.com/electron/electron/issues/38749), [electron#51442](https://github.com/electron/electron/issues/51442)), not something the route can fix.

## License

MIT
