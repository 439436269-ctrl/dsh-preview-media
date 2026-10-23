/**
 * Headless end-to-end check for dsh-preview-media against a locally started
 * web host: open the app, open a session, open a video file in the right
 * Sidebar, and prove the media player mounted and its element is playing.
 *
 * Usage:
 *   node e2e-browser.mjs --base http://127.0.0.1:64485 --token <token> --video "<abs path>"
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

/** Resolve playwright from a local install, then from the npx cache. */
async function loadPlaywright() {
  const cacheRoot = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "npm-cache", "_npx");
  const candidates = [
    process.env.PLAYWRIGHT_MODULE_DIR,
    join(process.cwd(), "node_modules", "playwright"),
    join(homedir(), "node_modules", "playwright"),
  ].filter(Boolean);
  if (existsSync(cacheRoot)) {
    const { readdirSync } = await import("node:fs");
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

const base = argument("base") ?? "http://127.0.0.1:19387";
const token = argument("token");
const outDir = argument("out") ?? join(process.cwd(), "scripts", "shots");
let video = argument("video");
if (video === undefined) {
  // No fixture supplied: write a 3 s 440 Hz PCM wave file to exercise the audio card.
  await mkdir(join(process.cwd(), "scripts", "fixtures"), { recursive: true });
  video = join(process.cwd(), "scripts", "fixtures", "tone.wav");
  await writeFile(video, sineWave({ rate: 8000, seconds: 3, frequency: 440 }));
}

/**
 * Build a minimal 16-bit mono PCM WAV.
 * @param options - sample rate, duration and tone frequency.
 * @returns the complete file bytes.
 */
function sineWave({ rate, seconds, frequency }) {
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * index) / rate) * 12000), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: process.env.E2E_BROWSER_CHANNEL });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

await page.goto(token === undefined ? base : `${base}/?token=${token}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
// A fresh profile shows a one-time preview notice; the primary button sits in a
// native dialog, so click by text rather than by role.
const dismiss = page.getByText("结束", { exact: true }).first();
if (await dismiss.count()) {
  await dismiss.click({ timeout: 3000 }).catch((error) => console.log(`dismiss failed: ${error.message}`));
  await page.waitForTimeout(800);
}
const proceed = page.getByText("继续", { exact: true }).first();
if (await proceed.count()) {
  await proceed.click({ timeout: 3000 }).catch((error) => console.log(`continue failed: ${error.message}`));
  await page.waitForTimeout(800);
}
const allButtons = page.locator("button");
const buttonCount = await allButtons.count();
const catalog = [];
for (let index = 0; index < buttonCount; index += 1) {
  const button = allButtons.nth(index);
  const label = (await button.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const aria = (await button.getAttribute("aria-label").catch(() => "")) ?? "";
  const title = (await button.getAttribute("title").catch(() => "")) ?? "";
  const box = await button.boundingBox().catch(() => null);
  catalog.push({ index, label, aria, title, box });
}
await writeFile(`${outDir}/buttons.json`, JSON.stringify(catalog, null, 2), "utf8");
console.log(`buttons: ${catalog.map((entry) => `${entry.index}:${entry.label || entry.aria || entry.title}`).join(" | ")}`);
await page.screenshot({ path: `${outDir}/01-home.png` });

// New conversation, then reveal the right-hand tab strip.
const newChat = page.getByRole("button", { name: /新会话|New conversation/i }).first();
if (await newChat.count()) {
  await newChat.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: `${outDir}/02-session.png` });

const openRight = page.getByRole("button", { name: /打开右侧边栏|Open right sidebar/i }).first();
if (await openRight.count()) {
  await openRight.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
}
const tabStrip = page.getByRole("button", { name: /新标签页|New tab/i }).first();
if (await tabStrip.count()) {
  await tabStrip.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
}
const filesEntry = page.getByText("工作区文件", { exact: true }).first();
if (await filesEntry.count()) {
  await filesEntry.click({ timeout: 5000 }).catch((error) => console.log(`files entry failed: ${error.message}`));
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: `${outDir}/03-tabs.png` });
const afterTabs = await page.locator("body").innerText();
await writeFile(`${outDir}/after-tabs.txt`, afterTabs, "utf8");
console.log(`after tabs: ${afterTabs.replace(/\s+/g, " ").slice(0, 900)}`);

// Walk the file tree to the video and open it.
const videoName = video.split(/[\\/]/).pop();
const directory = video.slice(0, video.length - videoName.length).replace(/[\\/]+$/, "");
const segments = directory.split(/[\\/]/).filter(Boolean).slice(1); // drop the drive root ("D:")
for (const segment of segments) {
  let opened = false;
  for (let attempt = 1; attempt <= 4 && !opened; attempt += 1) {
    const row = page.getByText(segment, { exact: true }).first();
    if ((await row.count()) === 0) {
      await page.waitForTimeout(900);
      continue;
    }
    await row.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    opened = true;
  }
  if (!opened) console.log(`tree segment not found: ${segment}`);
}
await page.screenshot({ path: `${outDir}/04-video-tree.png` });
let videoRow = page.getByText(videoName, { exact: true }).first();
// The tree is virtualized: scroll the pane until the row materializes.
await page.mouse.move(1200, 700);
for (let attempt = 0; attempt < 12 && (await videoRow.count()) === 0; attempt += 1) {
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(320);
}
if (await videoRow.count()) {
  await videoRow.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const pathText = await page.locator("body").innerText();
  await writeFile(`${outDir}/tree.txt`, pathText, "utf8");
} else {
  console.log(`video row not found: ${videoName}`);
  const treeText = await page.locator("body").innerText();
  await writeFile(`${outDir}/tree.txt`, treeText, "utf8");
}
await page.screenshot({ path: `${outDir}/05-video-preview.png` });

const media = page.locator("[data-preview-media-player]");
const mediaCount = await media.count();
console.log(`media elements: ${mediaCount} previewRoots: ${await page.locator("[data-preview-media]").count()}`);
if (mediaCount === 0) {
  const postText = await page.locator("body").innerText();
  console.log(`post body tail: ${postText.replace(/\s+/g, " ").slice(-420)}`);
}
if (mediaCount > 0) {
  const info = await media.first().evaluate((element) => ({
    tag: element.tagName,
    kind: element.dataset.kind,
    src: element.currentSrc,
    duration: Number.isFinite(element.duration) ? element.duration : null,
    readyState: element.readyState,
    networkState: element.networkState,
    paused: element.paused,
    currentTime: element.currentTime,
    error: element.error ? { code: element.error.code, message: element.error.message } : null,
  }));
  console.log(`media info: ${JSON.stringify(info)}`);
  // The whole frame must sit inside the preview pane: a portrait clip used to
  // overflow the bottom edge before the flexible frame was introduced.
  const fit = await media.first().evaluate((element) => {
    const pane = element.closest("[data-preview-media]");
    if (pane === null) return null;
    const paneBox = pane.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return {
      pane: { width: Math.round(paneBox.width), height: Math.round(paneBox.height) },
      player: { width: Math.round(box.width), height: Math.round(box.height) },
      contained:
        box.top >= paneBox.top - 1 &&
        box.bottom <= paneBox.bottom + 1 &&
        box.left >= paneBox.left - 1 &&
        box.right <= paneBox.right + 1,
      fullyVisible: document.elementFromPoint(box.left + box.width / 2, box.top + 1) !== null,
    };
  });
  console.log(`fit: ${JSON.stringify(fit)}`);
  // Speed and loop controls: click each and read the media element back.
  const speedButton = page.locator('[data-media-action="speed"]').first();
  const loopButton = page.locator('[data-media-action="loop"]').first();
  console.log(`controls: speed=${await speedButton.count()} loop=${await loopButton.count()}`);
  if ((await speedButton.count()) > 0) {
    await speedButton.click();
    await page.waitForTimeout(300);
    const speed = await media.first().evaluate((element) => element.playbackRate);
    console.log(`speed: label=${(await speedButton.innerText()).trim()} playbackRate=${speed}`);
  }
  if ((await loopButton.count()) > 0) {
    await loopButton.click();
    await page.waitForTimeout(200);
    const loopy = await media.first().evaluate((element) => element.loop);
    console.log(`loop: element=${loopy} data-active=${await loopButton.getAttribute("data-active")}`);
  }
  // Seek proves the range route serves arbitrary windows.
  const seek = await media.first().evaluate(async (element) => {
    const target = Number.isFinite(element.duration) ? Math.min(2, element.duration / 2) : 0;
    element.currentTime = target;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return { target, currentTime: element.currentTime, readyState: element.readyState, paused: element.paused };
  });
  console.log(`seek: ${JSON.stringify(seek)}`);
  const play = await media.first().evaluate(async (element) => {
    await element.play().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return { currentTime: element.currentTime, paused: element.paused, readyState: element.readyState };
  });
  console.log(`play: ${JSON.stringify(play)}`);
  await page.screenshot({ path: `${outDir}/06-video-playing.png` });
}
const panel = await page.locator("[data-preview-media]").count();
console.log(`media preview root mounted: ${panel}`);

const summary = [];
summary.push(`title: ${await page.title()}`);

// The workspace root can be switched through the reference picker, but a
// fresh session normally inherits the last workspace. Open the Files tab in
// the right Sidebar so the video can be reached by path.
const openFiles = page.getByRole("tab", { name: /files|文件/i }).first();
if (await openFiles.count()) {
  await openFiles.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: `${outDir}/02-sidebar.png` });

const body = await page.locator("body").innerText();
summary.push(`body chars: ${body.length}`);
summary.push(`has Files label: ${/Files|文件/.test(body)}`);

// Dismiss any first-run overlay by pressing Escape.
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

await writeFile(`${outDir}/body.txt`, body, "utf8");
await writeFile(`${outDir}/errors.txt`, errors.join("\n"), "utf8");
console.log(summary.join("\n"));
console.log(`errors: ${errors.length}`);
if (errors.length > 0) console.log(errors.slice(0, 10).join("\n"));
await browser.close();
