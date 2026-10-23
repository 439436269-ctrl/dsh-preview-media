window.__ModuleLoader__.load({
  id: "dsh-preview-media",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");

    /** This package's copy namespace. */
    const NS = "previewMedia";
    /** Renderer identity: the registry definition id and the body slot key. */
    const MEDIA_BODY_ID = "dsh-preview-media/video";
    /** Audio renderer identity; the same body serves both. */
    const MEDIA_AUDIO_BODY_ID = "dsh-preview-media/audio";
    /** Route that streams the bytes; the Host half owns the same default. */
    const DEFAULT_ROUTE_PATH = "/api/preview/media";
    /** Video suffixes mirrored from the Host defaults. */
    const MEDIA_VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm", "ogv", "ogg", "mkv", "avi", "wmv", "flv", "3gp", "ts", "m2ts", "mts"];
    /** Audio suffixes mirrored from the Host defaults. */
    const MEDIA_AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "m4a", "aac", "oga", "opus", "weba", "wma", "aiff", "aif"];
    /** Playback speeds the button cycles through. */
    const SPEED_STEPS = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    /** Where the per-browser speed/loop preference lives. */
    const PLAYBACK_KEY = "dsh-preview-media:playback";

    const zh = {
      video: "视频",
      audio: "音频",
      loading: "加载媒体中…",
      failed: "无法播放这个文件",
      unsupported: "浏览器不支持这个编码",
      retry: "重试",
      speed: "倍速",
      loop: "循环",
      fullscreen: "全屏",
      pip: "画中画",
      audioOnly: "音频文件",
      streamError: "播放失败：{reason}",
    };

    const en = {
      video: "Video",
      audio: "Audio",
      loading: "Loading media...",
      failed: "This file could not be played.",
      unsupported: "This codec is not supported by the browser.",
      retry: "Retry",
      speed: "Speed",
      loop: "Loop",
      fullscreen: "Full screen",
      pip: "Picture in picture",
      audioOnly: "Audio file",
      streamError: "Playback failed: {reason}",
    };

    /** Scoped styles; every selector starts at the root attribute. */
    const STYLE = [
      '[data-preview-media]{display:flex;flex-direction:column;flex:auto;height:100%;min-height:0;box-sizing:border-box;color:var(--dsw-alias-label-primary,#1f2329)}',
      '[data-preview-media] .dsh-mp-viewport{display:flex;flex:1 1 auto;min-height:0;min-width:0;align-items:stretch;justify-content:center;padding:12px;box-sizing:border-box;background:var(--dsw-alias-bg-document-preview,#0f1115);overflow:hidden}',
      '[data-preview-media] .dsh-mp-stage{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;min-width:0;align-items:center;justify-content:center;gap:8px;width:100%}',
      '[data-preview-media] .dsh-mp-box{display:flex;flex:1 1 auto;min-height:0;min-width:0;width:100%;align-items:center;justify-content:center;border-radius:10px;overflow:hidden;background:#000;box-shadow:0 2px 16px rgba(0,0,0,.28)}',
      '[data-preview-media] .dsh-mp-player{display:block;border-radius:10px;background:#000;object-fit:contain;box-shadow:0 2px 16px rgba(0,0,0,.28)}',
      '[data-preview-media] .dsh-mp-player[data-kind="video"]{width:100%;height:100%;max-width:none;max-height:none;border-radius:0;background:transparent;box-shadow:none}',
      '[data-preview-media] .dsh-mp-player[data-kind="audio"]{position:static;width:100%;max-width:340px;height:40px;background:transparent;box-shadow:none;border-radius:0}',
      '[data-preview-media] .dsh-mp-audio{display:flex;flex-direction:column;align-items:center;gap:12px;padding:28px 20px;width:min(420px,100%);border-radius:14px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06));box-sizing:border-box;text-align:center}',
      '[data-preview-media] .dsh-mp-audio-name{font-size:14px;font-weight:600;overflow-wrap:anywhere;margin:0}',
      '[data-preview-media] .dsh-mp-audio-meta{font-size:12px;opacity:.66;margin:0}',
      '[data-preview-media] .dsh-mp-glyph{width:52px;height:52px;opacity:.7}',
      '[data-preview-media] .dsh-mp-status{display:flex;flex-direction:column;align-items:center;gap:12px;padding:32px 20px;font-size:13px;opacity:.82;text-align:center}',
      '[data-preview-media] .dsh-mp-status[data-state="failed"]{opacity:1;color:var(--dsw-alias-state-error-label,#d32029)}',
      '[data-preview-media] .dsh-mp-hint{font-size:12px;opacity:.7;margin:0}',
      '[data-preview-media] .dsh-mp-actions{display:flex;gap:8px;flex:none;align-items:center;justify-content:center;padding:2px 4px 12px}',
      '[data-preview-media] .dsh-mp-button{appearance:none;border:0;border-radius:8px;padding:6px 12px;font:inherit;font-size:12px;cursor:pointer;color:var(--dsw-alias-label-primary,#1f2329);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08))}',
      '[data-preview-media] .dsh-mp-button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.14))}',
      '[data-preview-media] .dsh-mp-button[data-active="true"]{background:var(--dsw-alias-interactive-bg-selected,rgba(64,128,255,.18));color:var(--dsw-alias-label-accent,#2c6ef2)}',
      '[data-preview-media] .dsh-mp-button[data-media-action="speed"]{font-variant-numeric:tabular-nums;min-width:52px}',
    ].join("\n");

    function installStyle() {
      if (typeof document === "undefined") return;
      const tagId = "dsh-preview-media/video.css";
      if (document.querySelector('style[data-plugin-css="' + tagId + '"]') !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-preview-media";
      tag.dataset.pluginCss = tagId;
      tag.textContent = STYLE;
      document.head.appendChild(tag);
    }

    /** Decoded final path segment. */
    function basenameOf(path) {
      if (typeof path !== "string") return "";
      const normalized = path.replaceAll("\\", "/");
      return normalized.slice(normalized.lastIndexOf("/") + 1);
    }

    /** Human byte size, or the empty string when unknown. */
    function formatBytes(bytes) {
      if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
      const units = ["B", "KB", "MB", "GB", "TB"];
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      const rounded = unit === 0 ? String(Math.round(value)) : value.toFixed(value >= 100 ? 0 : 1);
      return rounded + " " + units[unit];
    }

    /** The stream URL for one absolute path. */
    function streamUrl(routePath, absolutePath) {
      const base = typeof routePath === "string" && routePath !== "" ? routePath : DEFAULT_ROUTE_PATH;
      return base + "?path=" + encodeURIComponent(absolutePath);
    }

    /**
     * The desktop shell proxy URL for one absolute path.
     *
     * The shell serves the page from `dsh-app://app` and answers every other
     * path through `protocol.handle`; Chromium cannot seek media produced by a
     * custom-protocol handler, so the player must talk to the loopback origin
     * instead. The token is the capability the Host handed out for this boot.
     * @param origin - `http://127.0.0.1:<port>` as reported by the Host.
     * @param token - the capability token from the same report.
     * @param absolutePath - the file to stream.
     * @returns an absolute URL carrying one query.
     */
    function loopbackStreamUrl(origin, token, absolutePath) {
      return origin + "/media/" + encodeURIComponent(token) + "?path=" + encodeURIComponent(absolutePath);
    }

    /** Whether the page is hosted by the desktop shell rather than a browser. */
    function desktopOwned() {
      const transport = globalThis.__DSH_TRANSPORT__;
      return typeof transport === "object" && transport !== null && transport.ownsHost === true;
    }

    /**
     * Base64url of a small JSON payload, for the `?diag=1` query parameter.
     * @param value - report object.
     * @returns the encoded string.
     */
    function encodeReport(value) {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    /** One discovery request per page and route; a failure is remembered too. */
    const loopbackLookups = new Map();

    /**
     * Ask the Host where its loopback media origin lives.
     * @param routePath - the authenticated route that answers `?discover=1`.
     * @returns `{ origin, token }`, or `null` when this deployment has none.
     */
    function discoverLoopback(routePath) {
      const key = typeof routePath === "string" && routePath !== "" ? routePath : DEFAULT_ROUTE_PATH;
      const cached = loopbackLookups.get(key);
      if (cached !== undefined) return cached;
      const pending = fetch(key + "?discover=1", {
        headers: { accept: "application/json" },
        cache: "no-store",
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          const loopback = body && typeof body === "object" ? body.loopback : null;
          return loopback !== null &&
            typeof loopback.origin === "string" &&
            loopback.origin !== "" &&
            typeof loopback.token === "string" &&
            loopback.token !== ""
            ? { origin: loopback.origin, token: loopback.token }
            : null;
        })
        .catch(() => null);
      loopbackLookups.set(key, pending);
      return pending;
    }

    /** Video, or audio, from the suffix the address carries. */
    function mediaKindOf(path) {
      const base = basenameOf(path).toLowerCase();
      const dot = base.lastIndexOf(".");
      const suffix = dot === -1 ? "" : base.slice(dot + 1);
      return MEDIA_AUDIO_EXTENSIONS.includes(suffix) ? "audio" : "video";
    }

    /**
     * Fill `{key}` placeholders.
     * @param template - localized template.
     * @param values - substitution table.
     * @returns the rendered string.
     */
    function fill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (whole, key) =>
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole
      );
    }

    /**
     * The next speed in the cycle.
     * @param current - the speed in force.
     * @returns the following step (wraps to the first).
     */
    function nextSpeed(current) {
      const at = SPEED_STEPS.indexOf(current);
      return SPEED_STEPS[(at + 1) % SPEED_STEPS.length];
    }

    /**
     * Button label for a speed.
     * @param rate - playback rate.
     * @returns e.g. `1.25×`.
     */
    function formatSpeed(rate) {
      return String(rate) + "×";
    }

    /**
     * Read the stored speed/loop preference, tolerating a broken store.
     * @returns the preference, defaulted to 1× and no loop.
     */
    function loadPlayback() {
      const fallback = { rate: 1, loop: false };
      try {
        const raw = globalThis.localStorage.getItem(PLAYBACK_KEY);
        if (raw === null) return fallback;
        const parsed = JSON.parse(raw);
        return {
          rate: SPEED_STEPS.includes(parsed.rate) ? parsed.rate : 1,
          loop: parsed.loop === true,
        };
      } catch {
        return fallback;
      }
    }

    /**
     * Persist the speed/loop preference; a blocked store is not an error.
     * @param preference - rate and loop flag.
     */
    function savePlayback(preference) {
      try {
        globalThis.localStorage.setItem(PLAYBACK_KEY, JSON.stringify(preference));
      } catch {
        /* private mode / quota: keep the in-memory choice only */
      }
    }

    /** A musical-note glyph for the audio card. */
    function audioGlyph() {
      return React.createElement(
        "svg",
        { className: "dsh-mp-glyph", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" },
        React.createElement("path", { d: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" })
      );
    }

    /**
     * The media body: one native element fed by the authenticated stream route.
     * @param props - document body props plus the injected route and copy.
     * @returns the player, or why it is not showing.
     */
    function MediaBody(props) {
      const { content, resourceAddress, useResource, t, routePath, loopback, debug } = props;
      const kind = mediaKindOf(resourceAddress);
      const meta = useResource(resourceAddress);
      const absolutePath = meta.value && meta.value.absolutePath ? meta.value.absolutePath : undefined;
      const name = basenameOf(absolutePath === undefined ? resourceAddress : absolutePath);
      const version = meta.value && meta.value.version ? meta.value.version : "0";
      const revision = content !== undefined && content.kind === "renderer" ? content.revision : 0;
      const [attempt, setAttempt] = React.useState(0);
      const [state, setState] = React.useState("loading");
      const [reason, setReason] = React.useState("");
      const preference = React.useRef(loadPlayback());
      const [speed, setSpeed] = React.useState(preference.current.rate);
      const [loop, setLoop] = React.useState(preference.current.loop);
      const reported = React.useRef(-1);
      const elementRef = React.useRef(null);
      const loadedOnce = React.useRef(false);
      // The desktop shell cannot seek media served over `dsh-app://`; ask the
      // Host for its loopback origin instead. `undefined` means "still asking",
      // `null` means "none, use the authenticated route".
      const wantsLoopback = loopback !== false && desktopOwned();
      const [loopbackBase, setLoopbackBase] = React.useState(wantsLoopback ? undefined : null);
      const [downgraded, setDowngraded] = React.useState(false);

      /**
       * Send one diagnostic line to the Host when `debug` is on.
       * @param phase - what just happened.
       * @param base - which origin the element is currently using.
       * @param extra - additional fields.
       */
      const report = React.useCallback(
        (phase, base, extra) => {
          if (debug !== true) return;
          const element = elementRef.current;
          const ranges = [];
          if (element !== null) {
            for (let index = 0; index < element.seekable.length && index < 3; index += 1) {
              ranges.push([element.seekable.start(index), element.seekable.end(index)]);
            }
          }
          const payload = {
            phase,
            base,
            src: element !== null && element.currentSrc !== "" ? element.currentSrc.slice(0, 200) : null,
            duration: element !== null && Number.isFinite(element.duration) ? element.duration : null,
            currentTime: element !== null ? Math.round(element.currentTime * 1000) / 1000 : null,
            readyState: element !== null ? element.readyState : null,
            networkState: element !== null ? element.networkState : null,
            paused: element !== null ? element.paused : null,
            error: element !== null && element.error !== null ? element.error.code : null,
            seekable: ranges,
            ownsHost: desktopOwned(),
            ...extra,
          };
          globalThis
            .fetch(routePath + "?diag=1&data=" + encodeReport(payload), { cache: "no-store" })
            .catch(() => {});
        },
        [debug, routePath]
      );

      React.useEffect(() => {
        if (!wantsLoopback) {
          setLoopbackBase(null);
          return undefined;
        }
        let live = true;
        discoverLoopback(routePath).then(
          (value) => {
            if (!live) return;
            setLoopbackBase(value);
            report("base", value === null ? "route" : "loopback", {
              origin: value === null ? null : value.origin,
              userAgent: typeof navigator === "object" && navigator !== null ? String(navigator.userAgent).slice(0, 160) : null,
            });
          },
          () => {
            if (!live) return;
            setLoopbackBase(null);
            report("base", "route", { origin: null, discovery: "failed" });
          }
        );
        return () => {
          live = false;
        };
      }, [routePath, wantsLoopback, report]);

      // Can this page reach the loopback origin at all? An opaque HEAD is
      // enough: a rejection here means the origin (not the media stack) is what
      // fails, and no amount of header work will help.
      React.useEffect(() => {
        if (debug !== true || loopbackBase === null || loopbackBase === undefined || absolutePath === undefined) return;
        const probe = loopbackStreamUrl(loopbackBase.origin, loopbackBase.token, absolutePath) + "&probe=1";
        globalThis
          .fetch(probe, { method: "HEAD", mode: "no-cors", cache: "no-store" })
          .then(() => report("probe", "loopback", { ok: true }))
          .catch((error) =>
            report("probe", "loopback", {
              ok: false,
              name: error && error.name ? String(error.name) : "Error",
              message: error && error.message ? String(error.message).slice(0, 160) : "",
            })
          );
      }, [debug, loopbackBase, absolutePath, report]);

      const settle = React.useCallback(
        (next) => {
          if (reported.current === revision) return;
          reported.current = revision;
          if (content === undefined || content.kind !== "renderer") return;
          if (next === "ready") content.loaded(version);
          if (next === "failed") content.failed();
        },
        [content, revision, version]
      );

      React.useEffect(() => {
        setState("loading");
        setReason("");
      }, [absolutePath, version, attempt]);

      // A new source resets the element's rate, so re-apply after every mount
      // and every preference change.
      React.useEffect(() => {
        const element = elementRef.current;
        if (element === null) return;
        element.playbackRate = speed;
        element.loop = loop;
      }, [speed, loop, absolutePath, version, attempt]);

      const onRetry = React.useCallback(() => setAttempt((value) => value + 1), []);

      const onSpeed = React.useCallback(() => {
        setSpeed((current) => {
          const next = nextSpeed(current);
          savePlayback({ rate: next, loop: preference.current.loop });
          preference.current = { rate: next, loop: preference.current.loop };
          return next;
        });
      }, []);

      const onLoop = React.useCallback(() => {
        setLoop((current) => {
          const next = !current;
          savePlayback({ rate: preference.current.rate, loop: next });
          preference.current = { rate: preference.current.rate, loop: next };
          return next;
        });
      }, []);

      const onFullscreen = React.useCallback(() => {
        const element = elementRef.current;
        if (element === null || typeof element.requestFullscreen !== "function") return;
        element.requestFullscreen().catch(() => {});
      }, []);

      const onPictureInPicture = React.useCallback(() => {
        const element = elementRef.current;
        if (element === null || typeof element.requestPictureInPicture !== "function") return;
        if (document.pictureInPictureElement === element) {
          document.exitPictureInPicture().catch(() => {});
          return;
        }
        element.requestPictureInPicture().catch(() => {});
      }, []);

      if (absolutePath === undefined || loopbackBase === undefined) {
        const failed = meta.status === "failed";
        return React.createElement(
          "div",
          {
            className: "dsh-mp-status",
            "data-state": failed ? "failed" : "loading",
            "data-preview-media-state": failed ? "failed" : "waiting",
          },
          React.createElement("p", { className: "dsh-mp-hint" }, failed ? t("failed") : t("loading")),
          failed
            ? React.createElement("button", { type: "button", className: "dsh-mp-button", onClick: onRetry }, t("retry"))
            : null
        );
      }

      const usingLoopback = loopbackBase !== null && !downgraded;
      const url =
        (usingLoopback
          ? loopbackStreamUrl(loopbackBase.origin, loopbackBase.token, absolutePath)
          : streamUrl(routePath, absolutePath)) +
        "&v=" +
        encodeURIComponent(version) +
        "&a=" +
        String(attempt);
      const isVideo = kind === "video";

      const element = React.createElement(isVideo ? "video" : "audio", {
        key: url,
        ref: elementRef,
        className: "dsh-mp-player",
        "data-kind": isVideo ? "video" : "audio",
        "data-preview-media-player": true,
        src: url,
        controls: true,
        autoPlay: isVideo,
        playsInline: true,
        preload: "metadata",
        onLoadedMetadata: () => {
          const current = elementRef.current;
          if (current !== null) {
            current.playbackRate = speed;
            current.loop = loop;
          }
          loadedOnce.current = true;
          setState("ready");
          settle("ready");
          report("loadedmetadata", base, null);
        },
        onCanPlay: () => setState("ready"),
        onSeeking: () => report("seeking", base),
        onSeeked: () => report("seeked", base),
        onPlaying: () => report("playing", base),
        onPause: () => report("pause", base),
        onWaiting: () => report("waiting", base),
        onStalled: () => report("stalled", base),
        onEmptied: () => report("emptied", base),
        onError: () => {
          const current = elementRef.current;
          const code = current !== null && current.error !== null ? current.error.code : 0;
          report("error", base, { code });
          // A loopback origin that never produced metadata is unusable here:
          // fall back to the authenticated route so the file still plays. Once
          // metadata arrived, keep the loopback — switching would silently
          // trade a seekable player for a non-seekable one.
          if (usingLoopback && !loadedOnce.current) {
            setDowngraded(true);
            report("downgrade", "route", { code });
            return;
          }
          setReason(code === 4 ? t("unsupported") : "");
          setState("failed");
          settle("failed");
        },
      });

      const status =
        state === "loading"
          ? React.createElement("p", { className: "dsh-mp-hint" }, t("loading"))
          : state === "failed"
            ? React.createElement(
                "p",
                { className: "dsh-mp-hint" },
                reason === "" ? t("failed") : fill(t("streamError"), { reason })
              )
            : null;
      const speedButton = React.createElement(
        "button",
        {
          type: "button",
          className: "dsh-mp-button",
          "data-media-action": "speed",
          title: t("speed"),
          "aria-label": t("speed") + " " + formatSpeed(speed),
          onClick: onSpeed,
        },
        formatSpeed(speed)
      );
      const loopButton = React.createElement(
        "button",
        {
          type: "button",
          className: "dsh-mp-button",
          "data-media-action": "loop",
          "data-active": loop ? "true" : "false",
          "aria-pressed": loop ? "true" : "false",
          title: t("loop"),
          onClick: onLoop,
        },
        t("loop")
      );
      const actions = React.createElement(
        "div",
        { className: "dsh-mp-actions" },
        speedButton,
        loopButton,
        isVideo
          ? React.createElement("button", { type: "button", className: "dsh-mp-button", onClick: onFullscreen }, t("fullscreen"))
          : null,
        isVideo
          ? React.createElement("button", { type: "button", className: "dsh-mp-button", onClick: onPictureInPicture }, t("pip"))
          : null
      );

      const audioCard = isVideo
        ? null
        : React.createElement(
            "div",
            { className: "dsh-mp-audio" },
            audioGlyph(),
            React.createElement("p", { className: "dsh-mp-audio-name" }, name),
            React.createElement(
              "p",
              { className: "dsh-mp-audio-meta" },
              formatBytes(meta.value && meta.value.bytes) === "" ? t("audioOnly") : formatBytes(meta.value.bytes)
            ),
            element
          );

      return React.createElement(
        "div",
        { "data-preview-media": true, "data-preview-media-state": state, "data-media-kind": kind },
        React.createElement(
          "div",
          { className: "dsh-mp-viewport" },
          React.createElement(
            "div",
            { className: "dsh-mp-stage" },
            isVideo ? React.createElement("div", { className: "dsh-mp-box" }, element) : audioCard,
            status
          )
        ),
        actions
      );
    }

    const inject = ["slots", "locale", "resources", "documentPreviews"];

    /** What the Host half published at boot: route path and loopback support. */
    function configuredConfig() {
      const config = globalThis.__DSH_PREVIEW_MEDIA_CONFIG__;
      const routePath =
        typeof config === "object" && config !== null && typeof config.routePath === "string"
          ? config.routePath
          : DEFAULT_ROUTE_PATH;
      // Absent means "the Host is older than this client": no loopback probe.
      const loopback = typeof config === "object" && config !== null ? config.loopback !== false : false;
      const debug = typeof config === "object" && config !== null ? config.debug === true : false;
      return { routePath, loopback, debug };
    }

    /**
     * Register the media renderer and its body for the plugin's lifetime.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      installStyle();
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "preview-media: dictionaries");
      const settings = configuredConfig();
      const bodyInject = () => ({ routePath: settings.routePath, loopback: settings.loopback, debug: settings.debug, t });
      ctx.effect(
        () =>
          ctx.documentPreviews.register({
            id: MEDIA_BODY_ID,
            extensions: MEDIA_VIDEO_EXTENSIONS,
            binaryExtensions: MEDIA_VIDEO_EXTENSIONS,
            priority: "extension",
            title: () => t("video"),
            loading: "renderer",
            wrap: false,
          }),
        "preview-media: metadata"
      );
      ctx.effect(
        () =>
          ctx.documentPreviews.register({
            id: MEDIA_AUDIO_BODY_ID,
            extensions: MEDIA_AUDIO_EXTENSIONS,
            binaryExtensions: MEDIA_AUDIO_EXTENSIONS,
            priority: "extension",
            title: () => t("audio"),
            loading: "renderer",
            wrap: false,
          }),
        "preview-media: audio metadata"
      );
      for (const key of [MEDIA_BODY_ID, MEDIA_AUDIO_BODY_ID]) {
        ctx.effect(
          () =>
            ctx.slots.inject("sidebar.right.tab.document", () =>
              ctx.slots.register(
                {
                  name: "sidebar.right.tab.document",
                  key,
                  locale: NS,
                  inject: bodyInject,
                },
                MediaBody
              )
            ),
          `preview-media: body ${key}`
        );
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.mediaKindOf = mediaKindOf;
    exports.streamUrl = streamUrl;
    exports.loopbackStreamUrl = loopbackStreamUrl;
    exports.desktopOwned = desktopOwned;
    exports.nextSpeed = nextSpeed;
    exports.formatSpeed = formatSpeed;
    return module.exports;
  },
});
