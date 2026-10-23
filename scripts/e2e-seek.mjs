/**
 * Headless check that media actually seeks in the two transport shapes this
 * plugin has to survive:
 *
 * 1. a browser page on the Host origin (relative `/api/preview/media`),
 * 2. the desktop shell, where the page is `dsh-app://app` and only a loopback
 *    origin can seek. `--simulate-desktop` fakes the one thing the client
 *    branches on (`__DSH_TRANSPORT__.ownsHost`), so the loopback path is
 *    exercised without launching Electron.
 *
 * It also proves the capability handshake: no loopback origin, no seek.
 *
 * Usage:
 *   node e2e-seek.mjs --base http://127.0.0.1:PORT --token TOKEN \
 *     --video "D:\\path\\clip.mp4" [--out scripts/shots] [--simulate-desktop] [--skip-ui]
 *
 * The `--video` file must be reachable from the app's workspace tree for the
 * UI part; the direct-element part only needs an absolute path.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Resolve playwright from a local install, then from the npx cache. */
async function loadPlaywright() {
  const cacheRoot = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "npm-cache", "_npx");
  const candidates = [
    process.env.PLAYWRIGHT_MODULE_DIR,
    join(process.cwd(), "node_modules", "playwright"),
    join(homedir(), "node_modules", "playwright"),
  ].filter(Boolean);
  if (existsSync(cacheRoot)) {
    for (const entry of readdirSync(cacheRoot)) candidates.push(join(cacheRoot, entry, "node_modules", "playwright"));
  }
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return import(pathToFileURL(join(candidate, "index.mjs")).href);
  }
  throw new Error("playwright not found; set PLAYWRIGHT_MODULE_DIR to a directory containing playwright/");
}

const { chromium } = await loadPlaywright();

function argument(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const base = argument("base");
const token = argument("token");
const video = argument("video");
if (base === undefined || video === undefined) throw new Error("--base and --video are required");
const outDir = argument("out") ?? join(process.cwd(), "scripts", "shots");
mkdirSync(outDir, { recursive: true });
const fileName = video.split(/[\\/]/).pop();

const browser = await chromium.launch({ headless: true, channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge" });
const page = await browser.newContext({ viewport: { width: 1500, height: 1000 } }).then((context) => context.newPage());
const failures = [];
/** Harness noise unrelated to this plugin (it appears in every page load). */
const IGNORED = [/cannot get property "remote\.session" without inject/u];
page.on("pageerror", (error) => {
  if (!IGNORED.some((pattern) => pattern.test(error.message))) failures.push(`pageerror: ${error.message}`);
});
page.on("console", (message) => {
  if (message.type() === "error" && !IGNORED.some((pattern) => pattern.test(message.text()))) {
    failures.push(`console: ${message.text()}`);
  }
});

await page.goto(token === undefined ? base : `${base}/?token=${token}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6500);
for (const text of ["结束", "继续"]) {
  const button = page.getByText(text, { exact: true }).first();
  if (await button.count()) {
    await button.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
}
if (flag("simulate-desktop")) {
  await page.evaluate(() => {
    globalThis.__DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl: location.origin };
  });
  console.log("transport: simulated desktop shell (__DSH_TRANSPORT__.ownsHost = true)");
} else {
  console.log("transport: browser page on the Host origin");
}

// 1. Capability handshake on the authenticated route.
const discovery = await page.evaluate(async () => {
  const response = await fetch("/api/preview/media?discover=1", { cache: "no-store" });
  return { status: response.status, body: await response.json() };
});
console.log(`discover: ${JSON.stringify(discovery)}`);
const loopback = discovery.body?.loopback ?? null;
if (loopback === null) {
  console.log("no loopback origin: the desktop timeline cannot seek in this deployment");
} else {
  // 2. The loopback origin itself: whole-duration seekable range, then a drag.
  const src = `${loopback.origin}/media/${loopback.token}?path=${encodeURIComponent(video)}`;
  const direct = await page.evaluate(async (url) => {
    const element = document.createElement("video");
    element.src = url;
    element.controls = true;
    element.muted = true;
    element.preload = "metadata";
    element.style.cssText = "position:fixed;left:30px;top:30px;width:900px;height:520px;z-index:99999;background:#000";
    element.id = "seek-probe";
    document.body.appendChild(element);
    await new Promise((resolve) => {
      element.addEventListener("loadedmetadata", resolve, { once: true });
      element.addEventListener("error", resolve, { once: true });
      setTimeout(resolve, 8000);
    });
    const ranges = [];
    for (let i = 0; i < element.seekable.length; i += 1) ranges.push([element.seekable.start(i), element.seekable.end(i)]);
    const metadata = { duration: element.duration, seekable: ranges, error: element.error?.code ?? null };
    element.currentTime = 60;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return { metadata, afterSeek: element.currentTime, readyState: element.readyState };
  }, src);
  console.log(`loopback element: ${JSON.stringify(direct)}`);
  const box = await page.evaluate(() => {
    const rect = document.getElementById("seek-probe").getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  console.log(`loopback drag: ${JSON.stringify(await drag(page, box))}`);
}

// 3. The plugin's own player, opened from the Workspace files tree.
if (!flag("skip-ui") && loopback !== null) {
  const newChat = page.getByRole("button", { name: /新会话|New conversation/i }).first();
  if (await newChat.count()) {
    await newChat.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  const openRight = page.getByRole("button", { name: /打开右侧边栏|Open right sidebar/i }).first();
  if (await openRight.count()) {
    await openRight.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  const newTab = page.getByRole("button", { name: /新标签页|New tab/i }).first();
  if (await newTab.count()) {
    await newTab.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  const files = page.getByText("工作区文件", { exact: true }).first();
  if (await files.count()) {
    await files.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  for (const segment of video.replaceAll("\\", "/").split("/").slice(1, -1)) {
    if (!(await openRow(page, segment))) console.log(`tree segment not reached: ${segment}`);
  }
  await openRow(page, fileName);
  await page.waitForTimeout(3000);
  const ui = await page.evaluate(() => {
    const element = document.querySelector("[data-preview-media-player]");
    if (element === null) return null;
    const ranges = [];
    for (let i = 0; i < element.seekable.length; i += 1) ranges.push([element.seekable.start(i), element.seekable.end(i)]);
    return { currentSrc: element.currentSrc.slice(0, 80), duration: element.duration, seekable: ranges };
  });
  console.log(`plugin element: ${JSON.stringify(ui)}`);
  if (ui !== null) {
    const box = await page.evaluate(() => {
      const rect = document.querySelector("[data-preview-media-player]").getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    console.log(`plugin drag: ${JSON.stringify(await drag(page, box, "[data-preview-media-player]"))}`);
  }
}

await page.screenshot({ path: join(outDir, "seek.png") });
console.log(`errors: ${failures.length}`);
if (failures.length > 0) console.log(failures.slice(0, 6).join("\n"));
await browser.close();

/**
 * Press the native timeline near its bottom edge and drag to the right.
 * @param page - Playwright page.
 * @param box - player bounding box.
 * @param selector - which element to read back.
 * @returns the time after the drag.
 */
async function drag(page, box, selector = "#seek-probe") {
  const y = box.y + box.height - 16;
  const from = box.x + box.width * 0.2;
  const to = box.x + box.width * 0.8;
  await page.mouse.move(from, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(from + ((to - from) * step) / 10, y, { steps: 2 });
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(2000);
  return page.evaluate((target) => {
    const element = document.querySelector(target);
    return { currentTime: element.currentTime, paused: element.paused, error: element.error?.code ?? null };
  }, selector);
}

/**
 * Click one file-tree row, scrolling the pane until it materialises.
 * @param page - Playwright page.
 * @param label - exact row text.
 * @returns whether the row was clicked.
 */
async function openRow(page, label) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const row = page.getByText(label, { exact: true }).last();
    if ((await row.count()) > 0) {
      const box = await row.boundingBox().catch(() => null);
      if (box !== null && box.width > 0) {
        await row.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1200);
        return true;
      }
    }
    await page.mouse.move(1250, 650);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(250);
  }
  return false;
}
