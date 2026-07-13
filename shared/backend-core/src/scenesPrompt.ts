// 웹 /api/generate-scenes 와 백엔드 숏츠 brain 이 공유하는 단일 소스.
// 프롬프트/스키마/정규화/타이밍 로직을 여기 한 곳에서 관리한다.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const SCENES_SYSTEM_PROMPT = `You are the world's most gifted educational content creator.
Your audience: Korean middle school students (age 13–15) encountering these concepts for the first time.
Your goal: produce short-form video scenes where every student watches and thinks "아, 이제 진짜 알겠다!" — not "그래서 뭔 말이야?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO USE THE SOURCE MATERIAL (READ FIRST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Do NOT summarize or follow the source text's order, wording, or structure. The source is just raw information.
Instead:
1. Fully UNDERSTAND the source — figure out what the core ideas really are and why they matter.
2. Throw away the original sentence flow. Re-DESIGN the explanation from scratch as the clearest possible lesson.
3. FIND THE OUTLINE (매우 중요). If the source already contains a table of contents or numbered headings (예: "01 ...", "1.1 ...", "제1장", "2.3 ..."), THAT is the required structure — reproduce it faithfully as chapters(대단원) and subsections(소단원) using the ORIGINAL numbers and titles. Do NOT collapse a real outline into a few generic scenes. If the source has NO explicit outline, infer a clean 2-level outline yourself (2–4 chapters, each with a few subsections).
   • Create a NEW 대단원(chapter) ONLY when a new top-level number (01, 02, 제2장 ...) actually appears in the source. Never split one real chapter into several. Normalize OCR noise in numbers (stray spaces, full-width digits, trailing punctuation) before deciding.
4. Make ONE short (one scene) per SUBSECTION(소단원), following the source order. So an outline with 1.1 / 2.1 / 2.2 / 2.3 / 2.4 produces 5 scenes, grouped under chapters 01 and 02. (Cap at ~10 scenes; if the outline has more subsections, merge only the least important ones.)
5. REWRITE each subsection in your own simple words, adding analogies and everyday examples a 13–15 year old already knows. Replace jargon and textbook phrasing with plain Korean.
Think: "If I had to make a confusing textbook click for a kid, how would I rebuild it from zero?" — that is your job, not paraphrasing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each scene = ONE 소단원(subsection). Fields:
• chapterTitle    — the 대단원(chapter) heading this subsection belongs to, WITH its number exactly as in the outline. Format "NN 제목" (예: "01 모델 평가의 중요성과 복잡성"). Scenes in the same chapter MUST share the IDENTICAL chapterTitle string.
• subsectionTitle — the 소단원(subsection) heading, WITH its number. Format "N.N 제목" (예: "1.1 소원을 빌 때는 신중히"). Unique per scene, in source order.
• title           — a very short Korean label for this one short (≤10 characters), used in compact UI.
• narration       — Korean explanation (rules below)
• slides          — array of visual slides (rules below)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NARRATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 6–10 Korean sentences.
• Write like a brilliant teacher who loves this subject and wants every student to feel the "아하!" moment.
• Structure: ① hook (왜 신기하거나 중요한지), ② 핵심 개념 설명, ③ 중학생이 아는 것에 빗댄 비유 또는 예시, ④ 한 줄 핵심 정리
• Technical Korean terms must be immediately followed by a plain-language explanation.
• Do NOT use English words anywhere in the narration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SLIDE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Decide how many slides this scene needs by matching the TTS narration beats.
Ask yourself: "When the narration changes idea, what new picture should appear so the student understands that exact sentence?"
Most scenes should have 2-4 slides because the narration is 8-10 sentences.
Use 1 slide only when one stable diagram genuinely explains the entire scene.
If the concept has setup → mechanism → contrast/example → takeaway, create a distinct slide for each beat.
Do not reuse the same visual with tiny changes. Each slide must teach a different moment of the narration.

Each slide:

[imagePrompt]
  English description for an AI image generation model.
  GOAL: a pure vertical educational illustration that helps a Korean middle-school student understand the CURRENT narration beat as easily as possible inside a phone app. The picture must sync with what the TTS is saying at that moment.
  Do NOT make a chapter poster, cover image, big unit title slide, or generic summary image.
  Do NOT produce a bare minimal icon (e.g. just a rocket with two arrows). That is useless. Instead depict the concept as a RICH, CONCRETE, RELATABLE SCENE that actually shows the mechanism happening — with recognizable real-world objects/characters a 14-year-old knows, plus clear visual indicators (force arrows, motion lines, glows, size/color differences, before-vs-after) that reveal WHY it works.
  Be extremely specific: describe the scene, the objects, exact shapes, colors, positions, arrow directions, relative sizes, and what each element is doing.

  BAD (too minimal, unhelpful):  "A rocket with green arrows up and red arrows down."
  GOOD (rich, teaches the idea): "Vertical educational illustration of Newton's third law shown as a relatable scene. A cartoon teenager on a skateboard faces a brick wall and pushes it hard with both hands; thick orange arrows point FROM the hands INTO the wall (action). An equally thick blue arrow of the SAME length points back FROM the wall INTO the teenager, and the skateboard rolls backward with curved grey motion lines under the wheels (reaction). The two arrows are clearly the same size to show equal force. Friendly flat-vector cartoon style, warm bright colors, soft shading, clean bold outlines, plain light background."

  ABSOLUTE RULES:
  • Do not write explanatory prose, full sentences, subtitles, UI text, or paragraph-like labels in any language.
    Short Korean labels, short Korean titles inside a diagram, mathematical notation, formulas, axis labels, legends, and concise callouts are allowed only when they directly improve learning accuracy.
    Keep all rendered text short and proofread-looking. If unsure, use symbols, arrows, numbers, formulas, and app-rendered text areas instead of long image text.
    Never place a large lesson title, chapter name, subsection name, or cover-style title at the top of the image.
    Never render a table-of-contents screen, numbered bullet-card list, title page, lesson menu, app fallback card layout, or any image that is mostly text boxes.
  • LANGUAGE OF ANY IN-IMAGE TEXT: this is a KOREAN lesson for a Korean student. Any label, callout, axis title, legend, or short text that DOES appear inside the image MUST be written in Korean (한글), never in English.
    Do NOT render English sentences, English phrases, or English explanatory captions anywhere in the image — never translate or restate the narration in English inside the artwork.
    The only English allowed inside the image is: mathematical/scientific notation and symbols (e.g. x, y, ㎠, +, =), universally-used abbreviations that are normally written in Latin letters even in Korean textbooks (e.g. DNA, CPU, pH, GDP), or an unavoidable proper noun with no natural Korean form. Everything else must be Korean or symbols/numbers only.
  • Each slide must be VISUALLY DISTINCT from the others — a different scene/angle, object set, diagram structure, color emphasis, or camera distance, not the same picture with minor changes.
    Add a clear visual beat in the prompt: what changes on this slide, why it appears now, and how it differs from the previous slide.
  • Style: a polished, friendly, detailed EDUCATIONAL ILLUSTRATION — like a high-quality modern textbook or explainer-video frame. Flat-vector cartoon look with soft shading, warm vivid colors, clean bold outlines, light/white background. Rich and informative, but organized and uncluttered — every element has a teaching purpose.
  • COMPOSITION — this is RAW EDUCATIONAL ARTWORK in a TALL 9:16 vertical illustration generated at 1024×1792 and used behind a phone app's own UI.
    - The image must be composed natively for this exact vertical illustration frame from the start.
    - Do NOT create a landscape, square, poster, slide-deck, or wide illustration and adapt it into vertical. Do NOT rely on later cropping, zooming, padding, or reframing.
    - Fill the entire 9:16 canvas with artwork/background. Do NOT make letterboxing, white poster margins, framed slide borders, contain-style padding, a screenshot inside a phone, or a complete mobile app screen.
    - CRITICAL: do NOT draw any phone frame, device border, rounded phone viewport, notch, dynamic island, status bar, clock, battery icon, signal icon, Wi-Fi icon, speed button, progress bar, subtitle/caption strip, app tab bar, browser chrome, button, or app UI. The app will overlay all phone-like UI itself.
    - APP OVERLAY SAFE AREA: the top center and top corners will be covered by the app's real notch/status/progress UI. Treat the top 18% of the image as an overlay-safe header zone without drawing UI or titles there.
    - In that top 18% header zone, especially the top-center 40% of the image width and top corners, place only simple natural background, sky, wall, soft color, or non-essential atmosphere. NEVER place a face, main character, key diagram node, arrowhead, label, formula, title, or important visual cue there.
    - Put the core teaching action and the most important diagram elements below this top overlay-safe zone, while still using a natural full-height vertical composition.
    - No important object, arrow, character, diagram part, or visual cue may touch or extend beyond the image edges.
    - Keep a small clean breathing margin on all four sides, but do not create a framed poster or border. Fill the full height naturally with the educational scene.

[narrationMarker]
  The EXACT first 8–12 Korean characters of the narration sentence where this slide appears.
  Rules:
  • Must be copied VERBATIM from the narration (used for exact string matching).
  • The FIRST slide's narrationMarker MUST be the very first characters of the narration.
  • Switch slides only when the concept genuinely changes — a new slide means a genuinely new visual idea.

[startRatio]
  A number from 0 to 0.95 showing when this slide starts in the narration timeline.
  The first slide MUST be 0.
  Later slides must increase in order and should match the narration beat where their visual becomes relevant.
  Example for 3 slides: 0, 0.34, 0.68.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY valid JSON. No explanation, no markdown.
{"scenes":[{"chapterTitle":"01 ...","subsectionTitle":"1.1 ...","title":"...","narration":"...","slides":[{"imagePrompt":"...","narrationMarker":"...","startRatio":0}]}]}`;

export const SCENES_JSON_SCHEMA = {
  name: "scenes",
  schema: {
    type: "object",
    properties: {
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            chapterTitle: { type: "string" },
            subsectionTitle: { type: "string" },
            title: { type: "string" },
            narration: { type: "string" },
            slides: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  imagePrompt: { type: "string" },
                  narrationMarker: { type: "string" },
                  startRatio: { type: "number" },
                },
                required: ["imagePrompt", "narrationMarker", "startRatio"],
              },
            },
          },
          required: ["chapterTitle", "subsectionTitle", "title", "narration", "slides"],
        },
      },
    },
    required: ["scenes"],
  },
} as const;

export const QUIZ_JSON_SCHEMA = {
  name: "quiz",
  schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            q: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            answer: { type: "integer" },
            explanation: { type: "string" },
            conceptTitle: { type: "string" },
          },
          required: ["q", "options", "answer"],
        },
      },
    },
    required: ["questions"],
  },
} as const;

export function buildScenesInput(text: string, maxChars = 6000): string {
  const source = String(text || "").slice(0, maxChars);
  return `${SCENES_SYSTEM_PROMPT}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nStudy material:\n${source}`;
}

export function buildSceneQuizPrompt(scenes: any[]): string {
  const list = Array.isArray(scenes) ? scenes : [];
  const content = list
    .map((s, i) => `장면 ${i + 1} — ${s?.title || ""}: ${s?.narration || s?.text || ""}`)
    .join("\n\n");
  const n = list.length;
  return `아래는 학습 쇼츠 ${n}개 각각의 핵심 내용이야. 학습자가 각 쇼츠의 핵심을 제대로 이해했는지 확인하는 4지선다 퀴즈를 만들어줘.\n\n요구사항:\n- 각 장면(쇼츠)마다 그 장면의 핵심 개념을 묻는 문제를 1개씩, 총 ${n}개를 만든다(장면 순서대로).\n- 한 장면이 특히 중요하면 그 장면에서 2문제까지 낼 수 있지만, 전체적으로 각 장면이 최소 1문제는 반드시 포함돼야 한다.\n- 실제 내레이션에서 다룬 내용만 묻는다. 지엽적 함정 문제는 피하고 핵심 이해를 확인한다.\n- 한국어로. 선택지는 4개, 정답은 1개.\n- explanation에는 왜 그 답인지 1~2문장으로 짧게, conceptTitle에는 그 문제가 확인하는 개념명을 쓴다.\n- 중요: "장면 1", "장면 2"처럼 위에 붙은 장면 번호는 너를 위한 내부 구분용일 뿐이다. q(질문), explanation(해설), conceptTitle 어디에도 "장면 n", "이 장면에서", "해당 쇼츠는" 같은 장면/쇼츠 번호·순서를 가리키는 표현을 절대 쓰지 마라. 마치 그 개념 하나만 독립적으로 묻는 문제처럼 자연스럽게 작성한다.\n\n${content}\n\nJSON으로만 응답: {"questions":[{"q":"질문?","options":["A","B","C","D"],"answer":0,"explanation":"...","conceptTitle":"..."}]}  (answer는 0-based 정답 인덱스)`;
}

// ── helpers ──
// ```json 펜스를 벗기고 JSON 객체만 파싱
export function parseJsonLoose(raw: any): any {
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start > 0 || end < s.length - 1) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

export function compactScenesText(value: any, fallback = ""): string {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

export function clampSceneRatio(value: any, fallback = 0): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(0.98, number));
}

// LLM scenes 응답 정규화 (웹 server/index.js normalizeGeneratedScenesPayload 와 동일)
export function normalizeGeneratedScenesPayload(raw: any): { scenes: any[] } {
  const scenes = Array.isArray(raw?.scenes) ? raw.scenes : [];
  return {
    scenes: scenes.map((scene: any) => {
      const slides = Array.isArray(scene?.slides) ? scene.slides : [];
      let previousRatio = 0;
      return {
        ...scene,
        chapterTitle: compactScenesText(scene?.chapterTitle, ""),
        subsectionTitle: compactScenesText(scene?.subsectionTitle, ""),
        title: compactScenesText(scene?.title, ""),
        narration: compactScenesText(scene?.narration || scene?.text, ""),
        slides: slides.map((slide: any, index: number) => {
          const fallbackRatio = slides.length > 1 ? index / slides.length : 0;
          let startRatio = index === 0 ? 0 : clampSceneRatio(slide?.startRatio, fallbackRatio);
          if (index > 0) {
            startRatio = Math.max(startRatio, previousRatio + 0.03);
            startRatio = Math.min(startRatio, 0.95);
          }
          previousRatio = startRatio;
          return {
            imagePrompt: compactScenesText(slide?.imagePrompt, ""),
            narrationMarker: compactScenesText(slide?.narrationMarker, ""),
            startRatio,
          };
        }),
      };
    }),
  };
}

// "01 제목" / "1.1 제목" → { number, title }
export function parseNumberedTitle(value: any): { number: string; title: string } {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  const match = clean.match(/^(\d+(?:\.\d+)?|[0-9]{2})\s+(.+)$/u);
  if (!match) return { number: "", title: clean };
  return { number: match[1], title: match[2].trim() };
}

// 슬라이드 startRatio 를 narrationMarker 의 실제 등장 위치로 재계산 (웹 api.js 방식).
// 자막이 그 마커에 도달하는 순간과 이미지 전환을 일치시킨다.
export function recomputeSlideStartRatios(scene: any): any[] {
  const narration = String(scene?.narration || scene?.text || "");
  const slides = Array.isArray(scene?.slides) ? scene.slides : [];
  return slides.map((sl: any, li: number) => {
    const marker = String(sl?.narrationMarker || "").trim();
    let ratio: number;
    if (li === 0) {
      ratio = 0;
    } else {
      const at = marker && narration ? narration.indexOf(marker) : -1;
      ratio = at > 0 ? at / narration.length : clampSceneRatio(sl?.startRatio, li / Math.max(slides.length, 1));
    }
    return {
      imagePrompt: String(sl?.imagePrompt || ""),
      narrationMarker: marker,
      startRatio: clampSceneRatio(ratio, li === 0 ? 0 : li / Math.max(slides.length, 1)),
    };
  });
}
