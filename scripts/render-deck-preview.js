#!/usr/bin/env node
// Render a SnapMind deck pack into a blueprint-style HTML slide deck.
// Usage: node scripts/render-deck-preview.js [deckJsonPath] [outDir]

const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value, fallback = "deck") {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return slug || fallback;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clampArray(value, max = 999) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, max) : [];
}

function textBlocks(slide, role) {
  return clampArray(slide?.textBlocks).filter((block) => block?.role === role && block?.text);
}

function nonHeadlineBlocks(slide) {
  return clampArray(slide?.textBlocks, 6).filter(
    (block) => block?.text && !["headline", "kicker"].includes(block.role)
  );
}

function getSlideVisualSrc(slide) {
  const visual = slide?.visual && typeof slide.visual === "object" ? slide.visual : {};
  return String(
    visual.localImageFile ||
      visual.imageFile ||
      visual.signedUrl ||
      visual.dataUrl ||
      ""
  ).trim();
}

function adaptPackToDeck(pack) {
  if (pack?.format === "deck" && Array.isArray(pack.slides)) {
    return pack;
  }

  const slides = [];
  for (const idea of pack?.ideas || []) {
    const clips = Array.isArray(idea?.clips) && idea.clips.length > 0
      ? idea.clips
      : idea?.short
        ? [idea.short]
        : [];

    for (const clip of clips) {
      for (const scene of clip?.scenes || []) {
        slides.push({
          id: scene.id || `slide-${slides.length + 1}`,
          order: slides.length + 1,
          section: idea.section || idea.title || "",
          title: scene.headline || clip.title || idea.title || `Slide ${slides.length + 1}`,
          thesis: scene.body || scene.narration || clip.teaser || idea.teaser || "",
          layout: slides.length === 0 ? "hero_blueprint" : slides.length % 3 === 0 ? "process_pipeline" : "concept_map",
          visualMetaphor: scene.visualStyle || scene.layoutHint || "",
          textBlocks: [
            { role: "headline", text: scene.headline || clip.title || idea.title || "" },
            ...(scene.captionLines || []).map((line) => ({ role: "callout", text: line })),
            { role: "body", text: scene.body || scene.narration || "" },
          ].filter((block) => block.text),
          diagram: {
            nodes: (scene.callouts || []).map((callout, index) => ({
              id: `node-${index + 1}`,
              label: callout,
              role: index === 0 ? "핵심 개념" : "연결 요소",
            })),
            edges: [],
            steps: (scene.captionLines || []).map((line) => ({ label: line, detail: scene.body || "" })),
            rows: [],
          },
          imagePrompt: scene.imagePrompt || "",
          speakerNotes: scene.narration || "",
        });
      }
    }
  }

  return {
    ...pack,
    format: "deck",
    theme: "blueprint",
    slides,
  };
}

function pointFor(index, count, layout) {
  if (layout === "architecture_blueprint") {
    const positions = [
      [50, 18],
      [22, 42],
      [50, 42],
      [78, 42],
      [32, 68],
      [68, 68],
      [50, 82],
      [16, 72],
      [84, 72],
      [50, 58],
    ];
    return positions[index % positions.length];
  }

  if (layout === "layered_model") {
    return [50, 22 + index * Math.max(9, 54 / Math.max(1, count - 1))];
  }

  const radiusX = 34;
  const radiusY = 28;
  const angle = count <= 1 ? -Math.PI / 2 : -Math.PI / 2 + (index * Math.PI * 2) / count;
  return [50 + Math.cos(angle) * radiusX, 52 + Math.sin(angle) * radiusY];
}

function renderNodeDiagram(slide) {
  const layout = slide?.layout || "concept_map";
  const nodes = clampArray(slide?.diagram?.nodes, 10);
  const edges = clampArray(slide?.diagram?.edges, 12);

  if (!nodes.length) {
    return renderCardGrid(slide);
  }

  const positions = new Map(nodes.map((node, index) => [node.id, pointFor(index, nodes.length, layout)]));
  const lines = edges.length > 0
    ? edges.map((edge) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return "";
        return `<line x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}" />`;
      }).join("")
    : nodes.slice(1).map((node) => {
        const center = positions.get(nodes[0].id);
        const target = positions.get(node.id);
        return `<line x1="${center[0]}" y1="${center[1]}" x2="${target[0]}" y2="${target[1]}" />`;
      }).join("");

  return `
    <div class="diagram node-diagram ${escapeHtml(layout)}">
      <svg class="connection-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>
      ${nodes.map((node, index) => {
        const [left, top] = positions.get(node.id);
        return `
          <div class="diagram-node ${index === 0 ? "primary" : ""}" style="left:${left}%; top:${top}%;">
            <strong>${escapeHtml(node.label)}</strong>
            ${node.role ? `<span>${escapeHtml(node.role)}</span>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderPipeline(slide) {
  const steps = clampArray(slide?.diagram?.steps, 7);
  if (!steps.length) return renderNodeDiagram(slide);

  return `
    <div class="diagram pipeline">
      ${steps.map((step, index) => `
        <div class="pipeline-step">
          <span class="step-index">${String(index + 1).padStart(2, "0")}</span>
          <strong>${escapeHtml(step.label)}</strong>
          <p>${escapeHtml(step.detail)}</p>
        </div>
        ${index < steps.length - 1 ? '<div class="pipeline-arrow">→</div>' : ""}
      `).join("")}
    </div>
  `;
}

function renderComparison(slide) {
  const rows = clampArray(slide?.diagram?.rows, 6);
  if (!rows.length) return renderCardGrid(slide);

  return `
    <div class="diagram comparison-table">
      <div class="table-head"><span></span><span>01</span><span>02</span></div>
      ${rows.map((row) => `
        <div class="table-row">
          <strong>${escapeHtml(row.label)}</strong>
          <p>${escapeHtml(row.left)}</p>
          <p>${escapeHtml(row.right)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCardGrid(slide) {
  const blocks = nonHeadlineBlocks(slide).slice(0, 4);
  const cards = blocks.length ? blocks : clampArray(slide?.diagram?.nodes, 4).map((node) => ({
    emphasis: node.label,
    text: node.role,
  }));

  return `
    <div class="diagram card-grid">
      ${cards.map((block, index) => `
        <article class="info-card">
          <span>${escapeHtml(block.emphasis || `0${index + 1}`)}</span>
          <p>${escapeHtml(block.text || block.label || "")}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderDataStory(slide) {
  const stat = textBlocks(slide, "stat")[0] || nonHeadlineBlocks(slide)[0];
  const steps = clampArray(slide?.diagram?.steps, 5);

  return `
    <div class="diagram data-story">
      <div class="big-stat">${escapeHtml(stat?.text || slide.thesis || slide.title)}</div>
      ${steps.length ? `
        <div class="mini-bars">
          ${steps.map((step, index) => `
            <div class="mini-bar" style="height:${34 + index * 11}%"><span>${escapeHtml(step.label)}</span></div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderDiagram(slide) {
  switch (slide?.layout) {
    case "comparison_matrix":
      return renderComparison(slide);
    case "process_pipeline":
      return renderPipeline(slide);
    case "three_cards":
      return renderCardGrid(slide);
    case "data_story":
      return renderDataStory(slide);
    case "layered_model":
    case "architecture_blueprint":
    case "concept_map":
    case "hero_blueprint":
    default:
      return renderNodeDiagram(slide);
  }
}

function renderSlide(slide, pack, index) {
  const kicker = textBlocks(slide, "kicker")[0]?.text || slide.section || pack.category || "SNAPMIND";
  const blocks = nonHeadlineBlocks(slide).slice(0, 4);

  return `
    <section class="slide ${escapeHtml(slide.layout || "concept_map")}">
      <div class="slide-grid"></div>
      <header class="slide-header">
        <span>${escapeHtml(kicker)}</span>
        <span>${String(index + 1).padStart(2, "0")} / ${String(pack.slides.length).padStart(2, "0")}</span>
      </header>
      <main class="slide-main">
        <div class="copy-zone">
          <h1>${escapeHtml(slide.title || pack.title)}</h1>
          <p class="thesis">${escapeHtml(slide.thesis || "")}</p>
          ${blocks.length ? `
            <div class="copy-blocks">
              ${blocks.map((block) => `
                <div class="copy-block ${escapeHtml(block.role || "body")}">
                  ${block.emphasis ? `<span>${escapeHtml(block.emphasis)}</span>` : ""}
                  <p>${escapeHtml(block.text)}</p>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
        <div class="visual-zone">
          <div class="blueprint-frame">
            ${getSlideVisualSrc(slide) ? `<img class="visual-image" src="${escapeHtml(getSlideVisualSrc(slide))}" alt="" />` : ""}
            ${getSlideVisualSrc(slide) ? '<div class="visual-wash"></div>' : ""}
            ${renderDiagram(slide)}
          </div>
        </div>
      </main>
      ${slide.speakerNotes ? `<aside class="speaker-notes">${escapeHtml(slide.speakerNotes)}</aside>` : ""}
      <footer>SnapMind Deck · ${escapeHtml(pack.theme || "blueprint")}</footer>
    </section>
  `;
}

function buildHtml(pack) {
  const slides = clampArray(pack.slides);
  const title = escapeHtml(pack.title || "SnapMind Deck");

  return `<!doctype html>
<html lang="${escapeHtml(pack.languageCode || "ko")}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        --paper: #fffdf4;
        --paper-2: #f6f1e7;
        --ink: #153a5b;
        --muted: #596d76;
        --line: #9acbd0;
        --line-soft: rgba(64, 125, 146, 0.18);
        --accent: #d4a400;
        --accent-2: #c86f52;
        --green: #7aa08d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #ebe7dc;
        color: var(--ink);
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif;
        word-break: keep-all;
      }
      .deck {
        width: min(100%, 1440px);
        margin: 0 auto;
        padding: 20px;
      }
      .slide {
        width: 100%;
        aspect-ratio: 16 / 9;
        background:
          linear-gradient(var(--line-soft) 1px, transparent 1px),
          linear-gradient(90deg, var(--line-soft) 1px, transparent 1px),
          radial-gradient(circle at 78% 18%, rgba(212, 164, 0, 0.12), transparent 22%),
          var(--paper);
        background-size: 38px 38px, 38px 38px, auto, auto;
        border: 1px solid rgba(21, 58, 91, 0.18);
        box-shadow: 0 24px 50px rgba(21, 58, 91, 0.12);
        margin: 0 0 24px;
        overflow: hidden;
        padding: 46px 52px 34px;
        position: relative;
      }
      .slide::before,
      .slide::after {
        border: 1px solid var(--line);
        content: "";
        height: 16px;
        position: absolute;
        width: 16px;
      }
      .slide::before { left: 16px; top: 16px; border-right: 0; border-bottom: 0; }
      .slide::after { right: 16px; bottom: 16px; border-left: 0; border-top: 0; }
      .slide-header,
      footer {
        display: flex;
        justify-content: space-between;
        color: var(--muted);
        font-size: 13px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .slide-main {
        display: grid;
        grid-template-columns: minmax(340px, 0.92fr) minmax(420px, 1.08fr);
        gap: 34px;
        height: calc(100% - 76px);
        padding-top: 22px;
      }
      h1 {
        color: var(--ink);
        font-size: clamp(36px, 4.6vw, 74px);
        line-height: 0.98;
        margin: 0 0 20px;
        max-width: 780px;
      }
      .thesis {
        border-left: 5px solid var(--accent);
        color: #263f4e;
        font-size: clamp(17px, 1.7vw, 25px);
        font-weight: 800;
        line-height: 1.45;
        margin: 0;
        max-width: 620px;
        padding-left: 18px;
      }
      .copy-blocks {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 28px;
      }
      .copy-block {
        background: rgba(255, 253, 244, 0.88);
        border: 2px solid rgba(21, 58, 91, 0.18);
        box-shadow: 6px 6px 0 rgba(21, 58, 91, 0.12);
        min-height: 96px;
        padding: 16px;
      }
      .copy-block span {
        color: var(--accent-2);
        display: block;
        font-size: 13px;
        font-weight: 950;
        margin-bottom: 8px;
      }
      .copy-block p {
        color: #203848;
        font-size: clamp(14px, 1.2vw, 18px);
        font-weight: 800;
        line-height: 1.45;
        margin: 0;
      }
      .blueprint-frame {
        border: 2px solid rgba(21, 58, 91, 0.35);
        height: 100%;
        position: relative;
        background:
          linear-gradient(rgba(154, 203, 208, 0.20) 1px, transparent 1px),
          linear-gradient(90deg, rgba(154, 203, 208, 0.20) 1px, transparent 1px),
          rgba(255,255,255,0.36);
        background-size: 24px 24px;
      }
      .visual-image {
        height: 100%;
        inset: 0;
        object-fit: cover;
        opacity: 0.58;
        position: absolute;
        width: 100%;
      }
      .visual-wash {
        background: rgba(255, 253, 244, 0.60);
        inset: 0;
        position: absolute;
      }
      .diagram { height: 100%; position: relative; width: 100%; }
      .connection-svg {
        inset: 0;
        position: absolute;
        height: 100%;
        width: 100%;
      }
      .connection-svg line {
        stroke: var(--ink);
        stroke-width: 0.55;
        vector-effect: non-scaling-stroke;
      }
      .diagram-node {
        background: rgba(255, 253, 244, 0.96);
        border: 2px solid var(--ink);
        box-shadow: 7px 7px 0 rgba(21, 58, 91, 0.14);
        min-width: 142px;
        max-width: 230px;
        padding: 12px 14px;
        position: absolute;
        transform: translate(-50%, -50%);
      }
      .diagram-node.primary {
        background: #f6dcc6;
        border-color: var(--accent-2);
        min-width: 178px;
      }
      .diagram-node strong {
        display: block;
        font-size: clamp(15px, 1.25vw, 21px);
        line-height: 1.16;
      }
      .diagram-node span {
        color: var(--muted);
        display: block;
        font-size: clamp(11px, 0.9vw, 14px);
        font-weight: 800;
        line-height: 1.35;
        margin-top: 6px;
      }
      .layered_model .diagram-node {
        left: 50% !important;
        width: min(76%, 520px);
      }
      .pipeline {
        align-items: center;
        display: flex;
        gap: 12px;
        justify-content: center;
        padding: 36px 28px;
      }
      .pipeline-step {
        background: rgba(255, 253, 244, 0.94);
        border: 2px solid var(--ink);
        box-shadow: 6px 6px 0 rgba(21, 58, 91, 0.14);
        flex: 1;
        min-height: 210px;
        padding: 18px;
      }
      .step-index {
        color: var(--accent);
        display: block;
        font-size: 15px;
        font-weight: 950;
        margin-bottom: 18px;
      }
      .pipeline-step strong {
        display: block;
        font-size: clamp(18px, 1.5vw, 27px);
        line-height: 1.15;
      }
      .pipeline-step p {
        color: var(--muted);
        font-size: clamp(13px, 1vw, 16px);
        font-weight: 800;
        line-height: 1.45;
      }
      .pipeline-arrow {
        color: var(--ink);
        font-size: 34px;
        font-weight: 950;
      }
      .comparison-table {
        display: grid;
        grid-template-rows: auto 1fr;
        padding: 28px;
      }
      .table-head,
      .table-row {
        display: grid;
        grid-template-columns: 0.8fr 1.2fr 1.2fr;
      }
      .table-head span,
      .table-row strong,
      .table-row p {
        border: 1px solid rgba(21, 58, 91, 0.38);
        margin: 0;
        padding: 13px;
      }
      .table-head span {
        background: #e6edf0;
        font-weight: 950;
        text-align: center;
      }
      .table-row strong {
        background: #f1f0ea;
        font-size: clamp(13px, 1vw, 17px);
      }
      .table-row p {
        background: rgba(255, 253, 244, 0.86);
        font-size: clamp(12px, 1vw, 16px);
        font-weight: 800;
        line-height: 1.42;
      }
      .card-grid {
        display: grid;
        gap: 18px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        padding: 42px;
      }
      .info-card {
        background: rgba(255, 253, 244, 0.95);
        border: 2px solid rgba(21, 58, 91, 0.42);
        box-shadow: 8px 8px 0 rgba(21, 58, 91, 0.12);
        margin: 0;
        padding: 22px;
      }
      .info-card span {
        color: var(--accent-2);
        font-size: 16px;
        font-weight: 950;
      }
      .info-card p {
        color: var(--ink);
        font-size: clamp(16px, 1.4vw, 24px);
        font-weight: 900;
        line-height: 1.25;
      }
      .data-story {
        align-items: center;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 30px;
        padding: 42px;
      }
      .big-stat {
        color: var(--ink);
        font-size: clamp(34px, 4vw, 70px);
        font-weight: 950;
        line-height: 1.02;
      }
      .mini-bars {
        align-items: end;
        display: flex;
        gap: 16px;
        height: 72%;
      }
      .mini-bar {
        background: linear-gradient(180deg, #f0c23a, #7aa08d);
        border: 2px solid var(--ink);
        flex: 1;
        min-height: 20%;
        position: relative;
      }
      .mini-bar span {
        bottom: -28px;
        color: var(--ink);
        font-size: 12px;
        font-weight: 900;
        left: 0;
        position: absolute;
        right: 0;
        text-align: center;
      }
      .speaker-notes {
        background: rgba(255, 253, 244, 0.92);
        border: 1px solid rgba(21, 58, 91, 0.18);
        bottom: 24px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 800;
        left: 52px;
        max-width: 58%;
        padding: 8px 12px;
        position: absolute;
      }
      footer {
        bottom: 14px;
        position: absolute;
        right: 24px;
      }
      @media (max-width: 860px) {
        .deck { padding: 0; }
        .slide {
          aspect-ratio: auto;
          min-height: 100vh;
          margin-bottom: 0;
          padding: 32px 22px 56px;
        }
        .slide-main {
          grid-template-columns: 1fr;
          height: auto;
        }
        .blueprint-frame { min-height: 430px; }
        .speaker-notes {
          bottom: 28px;
          left: 22px;
          max-width: calc(100% - 44px);
        }
      }
      @media print {
        body { background: white; }
        .deck { padding: 0; width: 100%; }
        .slide {
          box-shadow: none;
          margin: 0;
          page-break-after: always;
        }
      }
    </style>
  </head>
  <body>
    <div class="deck">
      ${slides.map((slide, index) => renderSlide(slide, { ...pack, slides }, index)).join("\n")}
    </div>
  </body>
</html>`;
}

function main() {
  const inputPath = path.resolve(process.argv[2] || "/tmp/snapmind_deck.json");
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Deck JSON not found: ${inputPath}`);
  }

  const rawPack = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const pack = adaptPackToDeck(rawPack);
  if (!Array.isArray(pack.slides) || pack.slides.length === 0) {
    throw new Error("The pack does not contain deck slides and could not be adapted.");
  }

  const outDir = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(__dirname, "..", "artifacts", "decks", slugify(pack.id || pack.title || "deck"));
  ensureDir(outDir);
  const htmlPath = path.join(outDir, "index.html");
  fs.writeFileSync(htmlPath, buildHtml(pack));
  fs.writeFileSync(path.join(outDir, "deck.json"), JSON.stringify(pack, null, 2));
  console.log(`Deck preview written: ${htmlPath}`);
}

main();
