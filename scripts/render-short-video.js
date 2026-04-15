#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const ffmpeg = require("ffmpeg-static");

const DEFAULT_FONT_FILE = "/System/Library/Fonts/AppleSDGothicNeo.ttc";
const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextFile(filePath, text) {
  fs.writeFileSync(filePath, `${String(text || "").trim()}\n`, "utf8");
}

function escapeFilterPath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "\\'");
}

function runFfmpeg(args) {
  const result = spawnSync(ffmpeg, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "ffmpeg failed.");
  }
}

function findPreviewDir(defaultRunDir) {
  if (defaultRunDir && fs.existsSync(defaultRunDir)) {
    return defaultRunDir;
  }

  const runsRoot = path.resolve(__dirname, "..", "artifacts", "shorts-e2e");
  const runDirs = fs
    .readdirSync(runsRoot)
    .filter((name) => name.startsWith("run-"))
    .sort();

  if (!runDirs.length) {
    throw new Error(`No run-* directory found in ${runsRoot}`);
  }

  const latestRunDir = path.join(runsRoot, runDirs[runDirs.length - 1]);
  const previewDirs = fs
    .readdirSync(latestRunDir)
    .filter((name) => name.startsWith("preview-"))
    .sort();

  if (!previewDirs.length) {
    throw new Error(`No preview-* directory found in ${latestRunDir}`);
  }

  return path.join(latestRunDir, previewDirs[0]);
}

function getSceneDurationMs(scene, nextScene) {
  const segment = scene?.image?.segment || {};
  const startMs = Number(segment.startMs || 0);
  const endMs = Number(segment.endMs || 0);
  if (endMs > startMs) {
    return endMs - startMs;
  }

  const nextStartMs = Number(nextScene?.image?.segment?.startMs || 0);
  if (nextStartMs > startMs) {
    return nextStartMs - startMs;
  }

  return Math.max(6000, Math.round(Number(scene?.estimatedSec || 10) * 1000));
}

function buildSceneFilter() {
  return [
    `[0:v]scale=${DEFAULT_WIDTH}:${DEFAULT_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${DEFAULT_WIDTH}:${DEFAULT_HEIGHT},boxblur=36:8[bg]`,
    `[0:v]scale=${DEFAULT_WIDTH}:${DEFAULT_HEIGHT}:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${DEFAULT_FPS},format=yuv420p[v]`,
  ].join(";");
}

function main() {
  const requestedPreviewDir = process.argv[2] ? path.resolve(process.argv[2]) : "";
  const outputPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(requestedPreviewDir || process.cwd(), "short-video.mp4");

  const previewDir = findPreviewDir(requestedPreviewDir);
  const previewPackPath = path.join(previewDir, "preview-pack.json");
  if (!fs.existsSync(previewPackPath)) {
    throw new Error(`Preview pack not found: ${previewPackPath}`);
  }

  const previewPack = JSON.parse(fs.readFileSync(previewPackPath, "utf8"));
  const idea = Array.isArray(previewPack?.ideas) ? previewPack.ideas[0] : null;
  if (!idea) {
    throw new Error("Preview pack does not contain an idea.");
  }

  const scenes = Array.isArray(idea?.short?.scenes) ? idea.short.scenes : [];
  if (!scenes.length) {
    throw new Error("Preview idea does not contain scenes.");
  }

  const audioFileName = String(idea?.short?.tts?.localAudioFile || "").trim();
  const audioPath = path.join(previewDir, audioFileName);
  if (!audioFileName || !fs.existsSync(audioPath)) {
    throw new Error(`Local audio file not found: ${audioPath}`);
  }

  const workingDir = fs.mkdtempSync(path.join(os.tmpdir(), "clip-note-short-video-"));
  const sceneClipPaths = [];

  try {
    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      const nextScene = scenes[index + 1];
      const imageFileName = String(scene?.image?.localPreviewFile || "").trim();
      const imagePath = path.join(previewDir, imageFileName);

      if (!imageFileName || !fs.existsSync(imagePath)) {
        throw new Error(`Scene image not found: ${imagePath}`);
      }

      const durationMs = getSceneDurationMs(scene, nextScene);
      const durationSec = Math.max(1.6, durationMs / 1000);
      const clipPath = path.join(workingDir, `scene-${String(index + 1).padStart(2, "0")}.mp4`);

      runFfmpeg([
        "-y",
        "-loop",
        "1",
        "-i",
        imagePath,
        "-filter_complex",
        buildSceneFilter(),
        "-map",
        "[v]",
        "-t",
        durationSec.toFixed(3),
        "-r",
        String(DEFAULT_FPS),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        clipPath,
      ]);

      sceneClipPaths.push(clipPath);
    }

    const concatListPath = path.join(workingDir, "concat-list.txt");
    fs.writeFileSync(
      concatListPath,
      `${sceneClipPaths.map((clipPath) => `file '${clipPath.replace(/'/g, "'\\''")}'`).join("\n")}\n`,
      "utf8"
    );

    const silentVideoPath = path.join(workingDir, "silent-video.mp4");
    runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      silentVideoPath,
    ]);

    ensureDir(path.dirname(outputPath));
    runFfmpeg([
      "-y",
      "-i",
      silentVideoPath,
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    console.log(
      JSON.stringify(
        {
          ok: true,
          previewDir,
          outputPath,
          sceneCount: scenes.length,
          durationMs: Number(idea?.short?.tts?.durationMs || 0),
        },
        null,
        2
      )
    );
  } finally {
    fs.rmSync(workingDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
