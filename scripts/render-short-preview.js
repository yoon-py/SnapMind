#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const {
  buildShortSceneImagePrompt,
  generateShortSceneImage,
  resolveGeminiImageConfig,
} = require("../shared/backend-core/dist/cjs/geminiImage");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeFileSegment(value, fallback = "item") {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findLatestRunDir(rootDir) {
  if (!fs.existsSync(rootDir)) {
    throw new Error(`Run directory does not exist: ${rootDir}`);
  }

  const runDirs = fs
    .readdirSync(rootDir)
    .filter((name) => name.startsWith("run-"))
    .sort();

  if (!runDirs.length) {
    throw new Error(`No run-* directories found in ${rootDir}`);
  }

  return path.join(rootDir, runDirs[runDirs.length - 1]);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildPreviewHtml({
  pack,
  idea,
  audioFileName,
  scenes,
}) {
  const slidesJson = JSON.stringify(
    scenes.map((scene, index) => ({
      id: scene.id || `scene-${index + 1}`,
      order: Number(scene.order || index + 1) || index + 1,
      headline: scene.headline || "",
      body: scene.body || "",
      callouts: Array.isArray(scene.callouts) ? scene.callouts : [],
      narration: scene.narration || "",
      estimatedSec: Number(scene.estimatedSec || 12) || 12,
      imageFile: scene.image?.localPreviewFile || "",
      startMs: Number(scene.image?.segment?.startMs || 0) || 0,
      endMs: Number(scene.image?.segment?.endMs || 0) || 0,
    })),
    null,
    2
  );

  const defaultBody = escapeHtml(idea?.teaser || "");
  const packTitle = escapeHtml(pack?.title || "Short preview");
  const ideaTitle = escapeHtml(idea?.title || "Idea");
  const audioSrc = escapeHtml(audioFileName || "");

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${packTitle} - ${ideaTitle}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f6f2;
        --paper: #fffdf7;
        --ink: #10273a;
        --muted: #66798a;
        --line: #d5dfdf;
        --accent: #e0aa00;
        --accent-2: #5cc0de;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(92,192,222,0.12), transparent 35%),
          radial-gradient(circle at top right, rgba(224,170,0,0.10), transparent 30%),
          linear-gradient(180deg, #fbfcf9 0%, var(--bg) 100%);
        color: var(--ink);
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
        display: flex;
        justify-content: center;
        padding: 24px;
      }
      .app {
        width: min(100%, 1280px);
        display: grid;
        gap: 24px;
        grid-template-columns: minmax(320px, 430px) minmax(280px, 1fr);
        align-items: start;
      }
      .phone {
        background: var(--paper);
        border: 1px solid rgba(16,39,58,0.08);
        border-radius: 36px;
        box-shadow: 0 20px 60px rgba(16,39,58,0.12);
        overflow: hidden;
        position: sticky;
        top: 24px;
      }
      .phone-top {
        padding: 18px 20px 10px;
        border-bottom: 1px solid rgba(16,39,58,0.06);
        background: rgba(255,255,255,0.88);
        backdrop-filter: blur(16px);
      }
      .pack-label {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 6px;
        font-weight: 700;
      }
      .pack-title {
        font-size: 24px;
        line-height: 1.15;
        margin: 0;
        font-weight: 900;
      }
      .scene-stage {
        padding: 18px;
      }
      .scene-image {
        width: 100%;
        aspect-ratio: 9 / 12;
        object-fit: cover;
        border-radius: 26px;
        display: block;
        background: linear-gradient(135deg, rgba(92,192,222,0.18), rgba(224,170,0,0.10));
        border: 1px solid rgba(16,39,58,0.08);
      }
      .scene-card {
        margin-top: 16px;
        padding: 18px;
        border-radius: 24px;
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(249,247,240,0.96));
        border: 1px solid rgba(16,39,58,0.08);
      }
      .scene-meta {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 8px;
      }
      .scene-headline {
        font-size: 28px;
        line-height: 1.15;
        margin: 0;
        font-weight: 900;
      }
      .scene-body {
        margin: 14px 0 0;
        font-size: 17px;
        line-height: 1.7;
      }
      .callouts {
        margin-top: 16px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .callout {
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 800;
        background: rgba(224,170,0,0.12);
        color: #9a6d00;
        border: 1px solid rgba(224,170,0,0.28);
      }
      .controls {
        margin-top: 18px;
        padding: 18px;
        border-top: 1px solid rgba(16,39,58,0.06);
      }
      .progress-row {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        color: var(--muted);
        margin-bottom: 10px;
        font-weight: 700;
      }
      .progress-track {
        width: 100%;
        height: 8px;
        border-radius: 999px;
        background: rgba(16,39,58,0.08);
        overflow: hidden;
      }
      .progress-fill {
        width: 0%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--accent-2), var(--accent));
      }
      audio {
        width: 100%;
        margin-top: 16px;
      }
      .buttons {
        display: flex;
        gap: 10px;
        margin-top: 14px;
      }
      button {
        flex: 1;
        border: 0;
        border-radius: 16px;
        padding: 14px 16px;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        color: #fffdf7;
        background: linear-gradient(135deg, #294d66, #173146);
      }
      button.secondary {
        background: rgba(16,39,58,0.08);
        color: var(--ink);
      }
      .panel {
        background: rgba(255,255,255,0.66);
        border: 1px solid rgba(16,39,58,0.08);
        border-radius: 28px;
        padding: 24px;
        box-shadow: 0 20px 60px rgba(16,39,58,0.08);
      }
      .panel h2 {
        margin: 0 0 12px;
        font-size: 26px;
      }
      .panel p {
        margin: 0;
        color: var(--muted);
        line-height: 1.7;
      }
      .timeline {
        margin-top: 20px;
        display: grid;
        gap: 12px;
      }
      .timeline-item {
        border: 1px solid rgba(16,39,58,0.08);
        border-radius: 20px;
        padding: 16px;
        background: rgba(255,253,247,0.86);
      }
      .timeline-item.active {
        border-color: rgba(92,192,222,0.45);
        box-shadow: 0 0 0 3px rgba(92,192,222,0.12);
      }
      .timeline-item h3 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      .timeline-item small {
        color: var(--muted);
        font-weight: 700;
      }
      .timeline-item p {
        margin-top: 8px;
        font-size: 14px;
      }
      @media (max-width: 980px) {
        body { padding: 16px; }
        .app { grid-template-columns: 1fr; }
        .phone { position: static; }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <section class="phone">
        <header class="phone-top">
          <div class="pack-label">${packTitle}</div>
          <h1 class="pack-title">${ideaTitle}</h1>
        </header>
        <div class="scene-stage">
          <img id="scene-image" class="scene-image" alt="" />
          <article class="scene-card">
            <div id="scene-meta" class="scene-meta">Scene 1</div>
            <h2 id="scene-headline" class="scene-headline">${ideaTitle}</h2>
            <p id="scene-body" class="scene-body">${defaultBody}</p>
            <div id="scene-callouts" class="callouts"></div>
          </article>
        </div>
        <footer class="controls">
          <div class="progress-row">
            <span id="progress-label">Scene 1</span>
            <span id="time-label">0:00 / 0:00</span>
          </div>
          <div class="progress-track"><div id="progress-fill" class="progress-fill"></div></div>
          <audio id="audio" src="${audioSrc}" controls preload="metadata"></audio>
          <div class="buttons">
            <button id="prev" class="secondary" type="button">Prev</button>
            <button id="play" type="button">Play / Pause</button>
            <button id="next" class="secondary" type="button">Next</button>
          </div>
        </footer>
      </section>
      <aside class="panel">
        <h2>Storyboard Preview</h2>
        <p>이 preview는 이미지, 장면 텍스트, 그리고 오디오 세그먼트를 합쳐서 영상처럼 자동 진행되도록 만든 파일입니다. 브라우저에서 열고 재생하면 scene 전환이 오디오 시간에 맞춰 동기화됩니다.</p>
        <div id="timeline" class="timeline"></div>
      </aside>
    </div>
    <script>
      const slides = ${slidesJson};
      const audio = document.getElementById("audio");
      const imageEl = document.getElementById("scene-image");
      const metaEl = document.getElementById("scene-meta");
      const headlineEl = document.getElementById("scene-headline");
      const bodyEl = document.getElementById("scene-body");
      const calloutsEl = document.getElementById("scene-callouts");
      const progressLabelEl = document.getElementById("progress-label");
      const timeLabelEl = document.getElementById("time-label");
      const progressFillEl = document.getElementById("progress-fill");
      const timelineEl = document.getElementById("timeline");
      let activeIndex = 0;

      function formatTime(seconds) {
        const total = Math.max(0, Math.floor(seconds || 0));
        const mins = Math.floor(total / 60);
        const secs = total % 60;
        return mins + ":" + String(secs).padStart(2, "0");
      }

      function renderTimeline() {
        timelineEl.innerHTML = "";
        slides.forEach((slide, index) => {
          const item = document.createElement("div");
          item.className = "timeline-item" + (index === activeIndex ? " active" : "");
          item.innerHTML = \`
            <small>Scene \${index + 1}</small>
            <h3>\${slide.headline}</h3>
            <p>\${slide.body}</p>
          \`;
          item.addEventListener("click", () => seekToSlide(index));
          timelineEl.appendChild(item);
        });
      }

      function renderSlide(index) {
        activeIndex = Math.max(0, Math.min(slides.length - 1, index));
        const slide = slides[activeIndex];
        imageEl.src = slide.imageFile || "";
        metaEl.textContent = "Scene " + (activeIndex + 1);
        headlineEl.textContent = slide.headline || "";
        bodyEl.textContent = slide.body || "";
        calloutsEl.innerHTML = "";
        (slide.callouts || []).forEach((callout) => {
          const chip = document.createElement("span");
          chip.className = "callout";
          chip.textContent = callout;
          calloutsEl.appendChild(chip);
        });
        progressLabelEl.textContent = "Scene " + (activeIndex + 1) + " / " + slides.length;
        renderTimeline();
      }

      function seekToSlide(index) {
        const slide = slides[index];
        if (!slide) return;
        if (Number.isFinite(slide.startMs)) {
          audio.currentTime = slide.startMs / 1000;
        }
        renderSlide(index);
      }

      function syncSlideToAudio() {
        const currentMs = (audio.currentTime || 0) * 1000;
        const index = slides.findIndex((slide, slideIndex) => {
          const next = slides[slideIndex + 1];
          const ownEndMs = Math.max(slide.startMs || 0, slide.endMs || 0);
          const nextStartMs = next ? Math.max(ownEndMs, next.startMs || 0) : 0;
          const endMs = nextStartMs || ownEndMs || Number.MAX_SAFE_INTEGER;
          return currentMs >= slide.startMs && currentMs < endMs;
        });
        if (index >= 0 && index !== activeIndex) {
          renderSlide(index);
        }
        const duration = audio.duration || 0;
        timeLabelEl.textContent = formatTime(audio.currentTime) + " / " + formatTime(duration);
        progressFillEl.style.width = duration > 0 ? ((audio.currentTime / duration) * 100).toFixed(2) + "%" : "0%";
      }

      document.getElementById("play").addEventListener("click", () => {
        if (audio.paused) {
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      });
      document.getElementById("prev").addEventListener("click", () => seekToSlide(Math.max(0, activeIndex - 1)));
      document.getElementById("next").addEventListener("click", () => seekToSlide(Math.min(slides.length - 1, activeIndex + 1)));
      audio.addEventListener("timeupdate", syncSlideToAudio);
      audio.addEventListener("loadedmetadata", syncSlideToAudio);
      renderSlide(0);
    </script>
  </body>
</html>`;
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const runsRoot = path.join(projectRoot, "artifacts", "shorts-e2e");
  const runDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : findLatestRunDir(runsRoot);
  const ideaIndex = Math.max(0, Number(process.argv[3] || 0) || 0);

  const packPath = path.join(runDir, "sample-shorts-pack.json");
  if (!fs.existsSync(packPath)) {
    throw new Error(`Pack file not found: ${packPath}`);
  }

  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  const idea = Array.isArray(pack?.ideas) ? pack.ideas[ideaIndex] : null;

  if (!idea) {
    throw new Error(`Idea index ${ideaIndex} does not exist in ${packPath}`);
  }

  const tts = idea?.short?.tts || {};
  const audioFileName = String(tts.localAudioFile || "").trim();
  if (!audioFileName) {
    throw new Error("This pack does not contain a localAudioFile for the selected idea.");
  }

  const audioFilePath = path.join(runDir, audioFileName);
  if (!fs.existsSync(audioFilePath)) {
    throw new Error(`Audio file not found: ${audioFilePath}`);
  }

  const previewDir = path.join(
    runDir,
    `preview-${String(ideaIndex + 1).padStart(2, "0")}-${sanitizeFileSegment(idea.title, "idea")}`
  );
  ensureDir(previewDir);

  const imageConfig = resolveGeminiImageConfig({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_IMAGE_MODEL,
  });

  if (!imageConfig) {
    throw new Error("Gemini image generation is not configured.");
  }

  const scenes = Array.isArray(idea?.short?.scenes) ? idea.short.scenes : [];
  const segments = Array.isArray(tts?.segments) ? tts.segments : [];
  const startedAt = performance.now();
  const imageMetrics = [];
  const previewScenes = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const prompt = buildShortSceneImagePrompt({
      packTitle: pack?.title || "Short pack",
      ideaTitle: idea?.title || `Idea ${ideaIndex + 1}`,
      languageCode: pack?.languageCode || "en",
      scene,
    });
    const segment =
      segments.find((item) => item.sceneId === scene.id) ||
      segments[index] || {
        startMs: index * 12000,
        endMs: (index + 1) * 12000,
      };

    const sceneStartedAt = performance.now();
    let image = null;
    let lastError = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        image = await generateShortSceneImage({
          config: imageConfig,
          prompt,
        });
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await sleep(2000);
        }
      }
    }

    if (!image) {
      throw lastError || new Error(`Failed to generate image for scene ${index + 1}`);
    }

    const imageFileName = `scene-${String(index + 1).padStart(2, "0")}.${image.fileExtension || "png"}`;
    const imageFilePath = path.join(previewDir, imageFileName);
    fs.writeFileSync(imageFilePath, Buffer.from(image.imageBytes));

    imageMetrics.push({
      sceneId: scene.id,
      headline: scene.headline,
      model: image.model,
      elapsedMs: Math.round(performance.now() - sceneStartedAt),
      imageFileName,
    });

    previewScenes.push({
      ...scene,
      image: {
        ...(scene.image || {}),
        provider: "gemini-image",
        model: image.model,
        imageStatus: "ready",
        localPreviewFile: imageFileName,
        segment,
      },
    });
  }

  const previewPack = {
    ...pack,
    ideas: pack.ideas.map((currentIdea, index) =>
      index === ideaIndex
        ? {
            ...currentIdea,
            short: {
              ...(currentIdea.short || {}),
              scenes: previewScenes,
            },
          }
        : currentIdea
    ),
  };

  const previewPackPath = path.join(previewDir, "preview-pack.json");
  const previewMetricsPath = path.join(previewDir, "preview-metrics.json");
  const previewHtmlPath = path.join(previewDir, "preview.html");
  const copiedAudioPath = path.join(previewDir, path.basename(audioFilePath));

  fs.copyFileSync(audioFilePath, copiedAudioPath);
  writeJson(previewPackPath, previewPack);
  writeJson(previewMetricsPath, {
    generatedAt: new Date().toISOString(),
    model: imageConfig.model,
    ideaIndex,
    ideaTitle: idea.title,
    elapsedMs: Math.round(performance.now() - startedAt),
    sceneCount: scenes.length,
    imageMetrics,
    files: {
      audioFile: path.basename(copiedAudioPath),
      previewPack: path.basename(previewPackPath),
      previewHtml: path.basename(previewHtmlPath),
      sceneImages: imageMetrics.map((item) => item.imageFileName),
    },
  });
  fs.writeFileSync(
    previewHtmlPath,
    buildPreviewHtml({
      pack,
      idea: {
        ...idea,
        short: {
          ...(idea.short || {}),
          scenes: previewScenes,
        },
      },
      audioFileName: path.basename(copiedAudioPath),
      scenes: previewScenes.map((scene, index) => ({
        ...scene,
        image: {
          ...(scene.image || {}),
          localPreviewFile: scene.image?.localPreviewFile || `scene-${String(index + 1).padStart(2, "0")}.png`,
          segment: scene.image?.segment || {},
        },
      })),
    }),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        runDir: path.relative(projectRoot, runDir),
        previewDir: path.relative(projectRoot, previewDir),
        previewHtml: path.relative(projectRoot, previewHtmlPath),
        previewPack: path.relative(projectRoot, previewPackPath),
        previewMetrics: path.relative(projectRoot, previewMetricsPath),
        generatedImages: imageMetrics.map((item) => item.imageFileName),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
