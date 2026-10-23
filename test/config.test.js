import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AUDIO_EXTENSIONS, DEFAULT_VIDEO_EXTENSIONS, resolveConfig } from "../lib/config.js";
import { isAudioPath, isVideoPath, mediaTypeOf, suffixOf } from "../lib/mime.js";

test("suffix reads the final segment in either separator spelling", () => {
  assert.equal(suffixOf("D:\\codes\\a\\clip.MP4"), "mp4");
  assert.equal(suffixOf("/home/me/clip.webm"), "webm");
  assert.equal(suffixOf("C:\\no-extension"), "");
  assert.equal(suffixOf(""), "");
  assert.equal(suffixOf(undefined), "");
});

test("media types cover the shipped video and audio suffixes", () => {
  for (const suffix of DEFAULT_VIDEO_EXTENSIONS) {
    assert.match(mediaTypeOf(`file.${suffix}`), /^(video|audio)\//, suffix);
  }
  for (const suffix of DEFAULT_AUDIO_EXTENSIONS) {
    assert.match(mediaTypeOf(`file.${suffix}`), /^(audio|video)\//, suffix);
  }
  assert.equal(mediaTypeOf("clip.mp4"), "video/mp4");
  assert.equal(mediaTypeOf("song.flac"), "audio/flac");
  assert.equal(mediaTypeOf("notes.txt"), "application/octet-stream");
  assert.equal(mediaTypeOf("noext"), "application/octet-stream");
});

test("kind matching follows the configured lists", () => {
  assert.equal(isVideoPath("a.MP4", DEFAULT_VIDEO_EXTENSIONS), true);
  assert.equal(isAudioPath("a.MP4", DEFAULT_AUDIO_EXTENSIONS), false);
  assert.equal(isAudioPath("a.FLAC", DEFAULT_AUDIO_EXTENSIONS), true);
});

test("config falls back to the shipped defaults", () => {
  const config = resolveConfig(undefined);
  assert.equal(config.enabled, true);
  assert.equal(config.routePath, "/api/preview/media");
  assert.equal(config.maxBytes, 2 * 1024 * 1024 * 1024);
  assert.equal(config.chunkBytes, 1024 * 1024);
  assert.deepEqual(config.videoExtensions, DEFAULT_VIDEO_EXTENSIONS);
  assert.deepEqual(config.audioExtensions, DEFAULT_AUDIO_EXTENSIONS);
});

test("config normalizes suffixes, chunk size, and the route path", () => {
  const config = resolveConfig({
    enabled: false,
    routePath: "media",
    chunkBytes: 1,
    maxBytes: 10,
    videoExtensions: [".MP4", " mp4 ", "", 7, "webm"],
    audioExtensions: [],
  });
  assert.equal(config.enabled, false);
  assert.equal(config.routePath, "/api/preview/media", "a route outside /api would skip the auth fence");
  assert.equal(config.chunkBytes, 64 * 1024, "chunk size is floored");
  assert.equal(config.maxBytes, 10);
  assert.deepEqual(config.videoExtensions, ["mp4", "webm"]);
  assert.deepEqual(config.audioExtensions, DEFAULT_AUDIO_EXTENSIONS, "an empty list keeps the defaults");
});

test("a route under /api is kept", () => {
  assert.equal(resolveConfig({ routePath: "/api/my-media/" }).routePath, "/api/my-media");
  assert.equal(resolveConfig({ routePath: "api/x" }).routePath, "/api/x");
  assert.equal(resolveConfig({ routePath: "/elsewhere" }).routePath, "/api/preview/media");
});
