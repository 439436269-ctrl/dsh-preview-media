# Maintenance notes — dsh-preview-media

Durable notes for whoever (or whichever session) touches this package next. Verification evidence lives in [VERIFY.md](VERIFY.md); user-facing docs live in the READMEs.

## Decisions

- **A second, token-guarded loopback origin for the desktop shell.** The desktop app loads the page from `dsh-app://app` and forwards every other path through `protocol.handle`; Chromium's media stack cannot seek a response produced by a custom-protocol handler (`video.seekable` becomes `[0, 0]`, see [electron#38749](https://github.com/electron/electron/issues/38749) and [electron#51442](https://github.com/electron/electron/issues/51442)), and that forwarder additionally strips `content-length`. The same plugin route over a real `http://127.0.0.1` origin seeks fine, so the Host keeps a listener there and the browser half asks for it through `GET <routePath>?discover=1`. Do not "simplify" this back to one route: the shell owns the Host cookie, so the renderer cannot call `/api` on the Host origin directly, and `file://` is blocked by `webSecurity: true`.
- **The loopback is a capability URL, not an open port.** Random 24-byte token per boot, token as a path segment, `404` for anything else, `127.0.0.1` bind only, and every byte still read through `ctx.fs` so the deployment's filesystem policy applies. Keep those four properties if you touch `lib/loopback.js`.
- **Loopback failure degrades, never breaks.** The client falls back to the authenticated route on `error`; the desktop then plays but cannot seek, which is the pre-0.1.3 behaviour.
- **Renderer-owned loading (`loading: "renderer"`) instead of `bytes-complete`.** The shared byte reader loads a whole file and has a byte cap (the deployment's `maxFileBytes` / image limit). Video wants neither: the browser seeks, so the route must serve ranges. The body therefore never sees the bytes — it only gets `resourceAddress` and calls `loaded` / `failed` back.
- **A plugin route under `/api`, not a bare webServer prefix.** The connection service fences and authenticates every `/api` request (Host/Origin + `dsh-auth-*` cookie) before the handler runs; a top-level route would be an unauthenticated local-file reader. The route name is configurable but normalized back under `/api/` if someone sets otherwise.
- **Two renderer ids, one body component.** `dsh-preview-media/video` (video suffixes) and `dsh-preview-media/audio` (audio suffixes) exist so the toolbar label says "视频" / "音频" while both key to the same body. The body derives `kind` from the address suffix, so a mis-keyed tab still renders something sensible.
- **Hand-written client bundle, no build step.** `lib/client.js` is the `window.__ModuleLoader__.load({ id, factory })` CJS factory; only `react` / `react/jsx-runtime` are required. This keeps the package buildless and impossible to desync from the host's React copy. Do not "modernize" it into an ESM file — the loader would reject it.
- **Suffix lists exist twice on purpose** (`lib/config.js` for the Host, `lib/client.js` for the browser). The Host list decides what the route accepts; the client list decides what the UI claims. Keep them in sync by hand — a shared module cannot cross the module-table boundary.

## Pitfalls (each cost a cycle)

| Symptom | Root cause | Fix |
|---|---|---|
| Desktop player plays but a dragged timeline snaps back to the start | the shell serves the page over `dsh-app://`; Chromium will not seek media produced by `protocol.handle`, and the shell's forwarder drops `content-length` too | serve the bytes from the loopback origin (`loopback: true`, `lib/loopback.js`); the web app is unaffected |
| `video.seekable` is `[0, 0]` in a custom-protocol app | Electron limitation, not a header problem — adding `Content-Range`/`Accept-Ranges`/`206` does not help | move media to an `http://127.0.0.1` origin |
| Edited `lib/client.js`, restarted, still old layout | pnpm **copies** a `file:` directory dependency instead of linking it | re-run `pnpm add`, or install the packed tarball / registry version |
| `plugins/dsh-preview-media/client.js` returns 404, looks unloaded | bundles are served as `plugins/??<a>/client.js,<b>/client.js&rev=…` combos | check `__DSH_BOOT__` for the row instead |
| Portrait video spills past the pane | `width: 100%` + aspect-derived height with no definite parent height | flexible `.dsh-mp-box` + `width/height:100%; object-fit: contain` |
| `dsh plugin --profile desktop …` refuses | the desktop profile is owned by the Electron app | compose with the runtime's pnpm, then add the row to `cordis.patch.yml` (or use the plugin manager UI) |
| `pnpm add file:` fails with `ERR_PNPM_UNEXPECTED_VIRTUAL_STORE` on a temp profile | junctioned `node_modules` carries the desktop virtual-store path | copy the whole profile, or install the tarball into a fresh tree |

## Releasing

1. Bump `package.json` version and add a `CHANGELOG.md` entry.
2. `node --test test/*.test.js` — must stay green.
3. `pnpm pack` and inspect `tar -tzf`; then `npm publish --access public`.
4. `npm view <name> dist-tags` (allow a minute for propagation; a brand-new package shows a placeholder `0.0.0-stage` first).
5. Reinstall into the desktop profile, confirm `dependencies` + `dsh.profile.bundles` + the `preview-media` patch row, then restart the app.
6. Commit and push, and confirm the GitHub Actions `test` workflow on the new HEAD.

## Re-verifying without touching the user's app

- Build a throwaway profile: copy `package.json` / `cordis.patch.yml` / `pnpm-workspace.yaml` / `cordis.yml` from `desktop`, junction `node_modules`, then `dsh --profile <tmp> --no-open --port 0`; the log prints an authenticated URL.
- HTTP: `scripts/e2e-probe.ps1 -Base <url> -Token <token> -File <media>`.
- Browser: `scripts/e2e-browser.mjs --base <url> --token <token> --video <media>` with `E2E_BROWSER_CHANNEL=msedge` when the bundled Chromium is unavailable. The script asserts the player's bounding box stays inside the preview pane, seeks, and plays.
- Seeking: `scripts/e2e-seek.mjs --base <url> --token <token> --video <media> --simulate-desktop`. It proves the capability handshake (`?discover=1`), that the loopback URL reports a whole-duration `seekable` range and survives a real mouse drag, and — with `--simulate-desktop` — that the plugin's own player takes the loopback branch and drags. Drop `--simulate-desktop` to check the browser route instead. The desktop window itself cannot be launched from an agent session (Electron's browser process aborts), so this is the closest available guard.
- Delete the temp profile afterwards (`node_modules` is a junction — remove the link, not the target).
