# Verification record — dsh-preview-media 0.1.4

DSH Desktop 0.2.1-rc.2 (Electron 44.7.0), Windows 11, Node 24.21.0 / pnpm 11.28.5.

Published coordinates: npm `dsh-preview-media` (latest: 0.1.4), repository `github.com/439436269-ctrl/dsh-preview-media`.

## 0.1.4 — confirmed in the real desktop window

After 0.1.4 was loaded into the running Host, the same `EP12-狐假虎威-晚安故事.mp4` (22,831,103 bytes, 92.16 s) was opened in the desktop app and its timeline clicked. The `debug` log (`$DSH_HOME/preview-media-debug.log`) shows the player talking to the loopback origin and the seek arriving as a real byte window:

```
{"event":"loopback-request","method":"GET","range":"bytes=0-","path":"…EP12-狐假虎威-晚安故事.mp4"}
{"event":"loopback-response","status":206,"window":{"start":0,"end":22831102},"size":22831103}
{"event":"loopback-request","method":"GET","range":"bytes=6389760-","path":"…EP12-狐假虎威-晚安故事.mp4"}   ← the timeline click
{"event":"loopback-response","status":206,"window":{"start":6389760,"end":22831102},"size":22831103}
```

`bytes=6389760-` is the seek the click produced (6,389,760 / 76,103,676 ≈ 25 s once the moov index is accounted for); answering it `206` is what the custom-protocol path could never do. Reported by the user as working: "可以了".

**The trap that cost two rounds.** Copying `lib/` into the profile is not enough on its own: the Host half (route, loopback listener, `?discover=1`) is loaded into the Host process, so until that process re-reads the plugin the desktop still runs the previous build. A new client bundle against an old Host looks exactly like the original bug — the client asks `?discover=1`, the old route answers `400`, the client falls back to the non-seekable route. Check the Host, not just the files: the presence of `loopback-listening` in the debug log is the proof that the new Host half is live.

**No application restart is required.** The Host re-reads the plugin on its own (plugin/host reload), so quitting the desktop app is not part of the procedure — confirmed on the fixing run: the Electron main process kept the PID it had held for days and the loopback listener still came up. What must be current is the *Host half*, and that is what the reload touches; the client bundle follows the page it is served with.

## 0.1.3 — the fix itself (verified on a web host)

**The bug.** In the desktop app the player played but dragging the native timeline snapped back to the start of the file (`0:02 / 1:32` no matter where the thumb was released).

**Where it is not.** The route and the component are fine: in a browser page served over `http://127.0.0.1`, the same plugin opened the same 22,831,103-byte, 92.16 s MP4 in the right Sidebar and a real mouse drag moved `currentTime` from 4.45 s to 78.15 s with the element stable (`sameElement: true`, no remounts). Range traffic was one `bytes=0-` → `206 bytes 0-22831102/22831103`.

**Root cause.** The desktop shell loads the page from `dsh-app://app` and proxies every other path through `protocol.handle` (`lib/main.js` of the desktop build: `forwardWebRequest`), which also strips `content-length` from the forwarded response. Chromium's media stack cannot seek a response produced by a custom-protocol handler: `video.seekable` collapses to `[0, 0]`. This is an Electron limitation, not a header problem — reports [electron#38749](https://github.com/electron/electron/issues/38749) and [electron#51442](https://github.com/electron/electron/issues/51442) show the same result with a hand-built `206` + `Content-Range` + `Accept-Ranges` handler. The renderer cannot dodge it by calling the Host origin directly either: the shell keeps the Host cookie to itself and injects it only on forwarded requests.

**Fix.** `lib/loopback.js` — the Host also listens on an ephemeral `127.0.0.1` port, token-guarded in the path, Range-aware, reading through `ctx.fs`. `GET /api/preview/media?discover=1` returns `{ loopback: { origin, token } }`; the browser half uses that origin only when `globalThis.__DSH_TRANSPORT__.ownsHost === true` (i.e. inside the shell), and falls back to the authenticated route on any media error.

**What was verified here (web host, headless Edge):**

```
discover: {"status":200,"body":{"loopback":{"origin":"http://127.0.0.1:52198","token":"xq4e…"}}}
loopback element: {"duration":92.16,"seekable":[[0,92.16]],"error":null}  seek 60 → 60 (readyState 4)
loopback drag:   {"currentTime":79.994018,"paused":true,"error":null}
plugin element (browser mode): currentSrc=/api/preview/media?path=…&v=5725, seekable [[0,92.16]]
```

The desktop branch was exercised by setting `globalThis.__DSH_TRANSPORT__ = { ownsHost: true }` in the same page before opening the file — that is the only thing `desktopOwned()` looks at, so the plugin took the loopback path with its own player:

```
plugin element (desktop branch): currentSrc=http://127.0.0.1:52198/media/xq4e…?path=…, seekable [[0,92.16]]
plugin drag:                     {"currentTime":72.764472,"paused":false}
```

Unit tests: `node --test test/*.test.js` → **47 pass**, including the new `test/loopback.test.js` (whole file, `206` window, open-ended, `HEAD` without reads, `416`, token refusal, method/path refusals, per-server tokens) and two `?discover=1` cases.

**What was not verified at 0.1.3:** the desktop window itself cannot be launched from an agent session (Electron's browser process aborts in the tool sandbox), so at release time the `dsh-app://` → `http://127.0.0.1` cross-origin media load was verified by construction and by the fallback. It was confirmed in the real window afterwards — see the 0.1.4 section above.

## 0.1.2 — speed and loop

Two buttons were added below the player: a speed button cycling 1× → 1.25× → 1.5× → 1.75× → 2× → 0.5× → 0.75×, and a loop toggle with an active state. The choice is stored in `localStorage` under `dsh-preview-media:playback` and re-applied after a source change (a new `src` resets `playbackRate`). Verified in the same headless flow:

```
media info: {"tag":"VIDEO","kind":"video","duration":5,"readyState":4,"error":null}
fit: {"pane":{"width":719,"height":824},"player":{"width":695,"height":755},"contained":true,"fullyVisible":true}
controls: speed=1 loop=1
speed: label=1.25× playbackRate=1.25
loop: element=true data-active=true
seek: {"target":2,"currentTime":2,"readyState":4}
play: {"currentTime":3.88,"paused":false,"readyState":4}
errors: 0
```

Unit tests cover the cycle helpers (`nextSpeed`, `formatSpeed`); 34 tests pass in total.

## 0.1.1 — video fits the pane

A 720x1280 portrait clip used to render at the pane's full width and spill past the bottom edge. The body now wraps the player in a flexible `.dsh-mp-box` and the video uses `width/height: 100%` plus `object-fit: contain`, so the frame is fully visible at once with black letterboxing and the native controls reachable. Re-verified with the same headless flow:

```
fit: {"pane":{"width":719,"height":824},"player":{"width":695,"height":755},"contained":true,"fullyVisible":true}
seek: {"target":2,"currentTime":2,"readyState":4}   # window served by the Range route
play: {"currentTime":3.50,"paused":false,"readyState":4}
errors: 0
```

`contained: true` is the regression guard added to `scripts/e2e-browser.mjs`: it compares the player's bounding box with the preview root's.

## L1 — unit tests

```
node --test test/*.test.js
# tests 32   pass 32   fail 0
```

| file | what it proves |
|---|---|
| `test/range.test.js` | closed / open-ended / suffix windows, clamping at EOF, malformed and multi-range headers refused, zero-size refused, chunk split covers the window exactly |
| `test/config.test.js` | defaults, suffix normalization (dots, case, blanks, duplicates), chunk floor, route forced under `/api/`, empty suffix list falls back, suffix to media type for every shipped suffix |
| `test/route.test.js` | 200 whole file byte-for-byte, 206 window, open-ended to EOF, HEAD without body and without reads, 416 + `bytes */size`, 400 for missing/relative path, 404/403/413/500 mapping, 503 when disabled, one read never exceeds `chunkBytes` |
| `test/adapter.test.js` | real `lib/` copied into a temp tree with a stub `@deepseek-ai/schemastery`; `apply()` registers the route, publishes `__DSH_PREVIEW_MEDIA_CONFIG__` through `webserver/index-inject`, answers a request, and its disposer runs; a disabled plugin registers nothing; the manifest keeps `lib/**/*.js` and the client export |
| `test/client.test.js` | the bundle registers under the package name, requires only `react`, exports `apply`/`inject`, classifies audio vs video, encodes the stream URL, and `apply()` registers two renderers, two bodies and one dictionary using the injected route path |

## L2/L3 — real host mount

A temporary profile `_mpe2e` was composed from the desktop profile (junctioned `node_modules`) with the plugin installed as a dependency and listed in `dsh.profile.bundles`:

- `dsh --profile _mpe2e --dump-config` produced the `id: preview-media` row, exit 0.
- `dsh --profile _mpe2e --no-open --port 0` booted with no FAILED fiber; the served index referenced `dsh-preview-media/client.js` inside a `plugins/??...` combo and injected `globalThis["__DSH_PREVIEW_MEDIA_CONFIG__"] = {"routePath":"/api/preview/media"}`.
- The combo bundle request answered 200 and contained the `window.__ModuleLoader__.load({ id: "dsh-preview-media", ... })` registration.

## HTTP probe (`scripts/e2e-probe.ps1`)

Against the temp host, authenticated with the printed launch token (cookie `dsh-auth-*`), file `sample-video_zoompan.mp4` (1,305,133 bytes):

```
HEAD:  status=200 len=1305133 type=video/mp4
RANGE: status=206 bytes=1024 content-range=bytes 0-1023/1305133
MID:   status=206 bytes=2000 content-range=bytes 1000-2999/1305133
FULL:  status=200 bytes=1305133 match=True
TAIL:  status=206 bytes=512  content-range=bytes 1304621-1305132/1305133
BAD:   status=416 content-range=bytes */1305133
MISSING:  status=404
RELATIVE: status=400
RANGE CONTENT MATCHES FILE HEAD: True
```

An unauthenticated call to the same route answers `401`; that fence belongs to the connection service, not to this plugin.

## L4 — headless browser end-to-end (`scripts/e2e-browser.mjs`, Playwright + system Edge)

Flow: open the app with the launch token, dismiss the one-time notice, start a conversation, open the right Sidebar, pick New tab then Workspace files, walk the tree, open the file.

Video (`sample-video_i2v.mp4`):

```
media elements: 1
media info: {"tag":"VIDEO","kind":"video","duration":5.04,"readyState":4,"error":null}
seek: {"target":2,"currentTime":2,"readyState":4}      # arbitrary window served by the Range route
play: {"currentTime":3.50,"paused":false,"readyState":4}
media preview root mounted: 1
errors: 0
```

Audio (`scripts/fixtures/tone.wav`, 3 s PCM sine generated by the script):

```
media elements: 1
media info: {"tag":"AUDIO","kind":"audio","duration":3,"readyState":4,"error":null}
seek: {"target":1.5,"currentTime":1.5}
play: {"currentTime":2.94,"paused":false}
media preview root mounted: 1
errors: 0
```

Screenshots: `docs/video-preview.png` (theme-native controls plus full screen / picture in picture) and `docs/audio-preview.png` (card with name, size and player).

## Install shape (desktop profile)

Installed from the npm registry as `dsh-preview-media@^0.1.0`:

- `package.json` `dependencies` plus `dsh.profile.bundles`, and the `preview-media` plugin row appended to `cordis.patch.yml`.
- `dsh plugin --profile desktop ...` is refused by the CLI ("managed exclusively by the Electron application"), so the profile was composed with the runtime's own pnpm (`~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm`) and the YAML validated with `js-yaml` (9 entries, the `preview-media` row present).
- `pnpm install --frozen-lockfile --offline` passes.

> Pitfall found during verification: pnpm **copies** a `file:` directory dependency instead of linking it, so editing the source and restarting shows stale code. Re-running `pnpm add` (or installing the packed tarball or registry version) is required.

## Known gaps

- `.mkv` / `.avi` / `.wmv` / `.flv` are registered but Chromium cannot decode them; the player shows its unsupported-codec state. Verified by inspection of the error path, not with a real MKV.
- Multi-range `Range` headers are refused with 416 by design; media elements never send them.
