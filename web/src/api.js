const DEFAULT_INPUT_TEXT = ''
const DEFAULT_MODEL_COMBO_LABEL = 'GPT5.4 + GPT Image 2 low + Nano Banana Pro + OCR'
let modelComboCache = null

function compactText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim()
}

export function withModelComboTitle(title, comboLabel = DEFAULT_MODEL_COMBO_LABEL) {
  const cleanTitle = compactText(title, '생성된 팩')
  const cleanCombo = compactText(comboLabel, DEFAULT_MODEL_COMBO_LABEL)
  if (!cleanCombo) return cleanTitle
  if (cleanTitle.includes(cleanCombo)) return cleanTitle
  return `${cleanTitle} · ${cleanCombo}`
}

export async function getModelComboLabel() {
  try {
    const resp = await fetch('/api/model-combo')
    if (!resp.ok) throw new Error(`model combo API ${resp.status}`)
    const data = await resp.json()
    modelComboCache = compactText(data?.label, DEFAULT_MODEL_COMBO_LABEL)
  } catch (_) {
    modelComboCache = modelComboCache || DEFAULT_MODEL_COMBO_LABEL
  }
  return modelComboCache
}

const DEFAULT_SCENES = [
  {
    title: '광합성 개요',
    narration: '광합성은 식물이 햇빛에너지를 이용해 이산화탄소와 물로 포도당을 만드는 놀라운 과정이에요. 마치 식물이 태양을 먹고 사는 것처럼, 빛 하나로 스스로 영양분을 만들어냅니다. 엽록체라는 초록색 소기관이 공장처럼 이 과정을 담당해요. 광합성의 재료는 빛, 물, 이산화탄소 세 가지고, 만들어지는 것은 포도당과 산소예요. 우리가 매일 숨 쉬는 산소가 바로 식물의 광합성 덕분이에요.',
    slides: [
      {
        imagePrompt: '',
        narrationMarker: '광합성은 식물이',
        startRatio: 0,
        imageUrl: null,
      },
    ],
  },
  {
    title: '명반응',
    narration: '명반응은 광합성의 첫 번째 단계로, 빛에너지를 화학에너지로 바꾸는 과정이에요. 엽록체 안 틸라코이드 막에서 빛을 흡수해 ATP와 NADPH를 만들어냅니다. 이때 물이 분해되면서 산소가 방출되는데, 이것이 우리가 호흡하는 산소의 원천이에요. 마치 태양광 발전처럼 빛을 받아 에너지를 저장하는 과정이라고 생각하면 돼요.',
    slides: [
      {
        imagePrompt: '',
        narrationMarker: '명반응은 광합성의',
        startRatio: 0,
        imageUrl: null,
      },
    ],
  },
  {
    title: '캘빈 회로',
    narration: '캘빈 회로는 광합성의 두 번째 단계인 암반응이에요. 빛이 없어도 일어날 수 있어서 암반응이라 불러요. 명반응에서 만든 ATP와 NADPH로 이산화탄소를 포도당으로 바꿉니다. 루비스코 효소가 이산화탄소를 붙잡아 G3P를 만들고, 이것이 포도당으로 이어지는 과정이 계속 반복돼요.',
    slides: [
      {
        imagePrompt: '',
        narrationMarker: '캘빈 회로는 광합성의',
        startRatio: 0,
        imageUrl: null,
      },
    ],
  },
]

export { DEFAULT_SCENES, DEFAULT_INPUT_TEXT }

function clampStartRatio(value, fallback = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(0, Math.min(0.98, number))
}

export async function generateScenes(text) {
  const resp = await fetch('/api/generate-scenes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) throw new Error(`scenes API ${resp.status}`)
  const data = await resp.json()
  if (!data.scenes || !data.scenes.length) throw new Error('invalid scenes response')
  return data.scenes.map((s, i) => {
    const chapter = parseNumberedTitle(s.chapterTitle || s.sectionTitle || '')
    const subsection = parseNumberedTitle(s.subsectionTitle || s.title || '')
    const chapterTitle = chapter.title || '학습 주제'
    const subsectionTitle = subsection.title || s.title || chapterTitle
    const subsectionDisplay = `${subsection.number ? subsection.number + ' ' : ''}${subsectionTitle}`.trim()
    const narration = s.narration || s.text || ''
    const rawSlides = s.slides || []
    return {
      id: `scene-${i + 1}`,
      order: i + 1,
      chapterNumber: chapter.number || '',
      chapterTitle,
      sectionNumber: subsection.number || '',
      subsectionTitle,
      subsectionDisplay,
      // player chip convention: top label = 대단원(chapter), bold = 소단원(subsection)
      sectionTitle: chapterTitle,
      shortTitle: subsectionDisplay,
      title: s.title || subsectionTitle || '',
      narration,
      // 슬라이드 전환 타이밍: LLM의 startRatio 추측 대신 narrationMarker가
      // 나레이션에서 실제 등장하는 문자 위치로 계산 → 자막이 그 지점에 도달하는 순간 전환
      slides: rawSlides.map((sl, li) => {
        const marker = (sl.narrationMarker || '').trim()
        let ratio
        if (li === 0) {
          ratio = 0
        } else {
          const at = marker && narration ? narration.indexOf(marker) : -1
          ratio = at > 0 ? at / narration.length : clampStartRatio(sl.startRatio, li / rawSlides.length)
        }
        return {
          imagePrompt: sl.imagePrompt || '',
          narrationMarker: marker,
          startRatio: clampStartRatio(ratio, li === 0 ? 0 : li / rawSlides.length),
          imageUrl: null,
        }
      }),
    }
  })
}

export async function generateQuiz(scenes) {
  const quizScenes = scenes.map(scene => ({
    title: scene.title || '',
    narration: scene.narration || scene.text || '',
  }))
  const resp = await fetch('/api/generate-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenes: quizScenes }),
  })
  if (!resp.ok) throw new Error(`quiz API ${resp.status}`)
  const data = await resp.json()
  if (!data.questions?.length) throw new Error('invalid quiz response')
  return data.questions
}

async function readApiError(response) {
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch (_) {
    data = null
  }

  const error = new Error(data?.error || text || `API ${response.status}`)
  if (data?.code) error.code = data.code
  if (data?.provider) error.provider = data.provider
  if (data?.model) error.model = data.model
  error.status = response.status
  return error
}

export async function generateImage(imagePrompt) {
  const resp = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: imagePrompt }),
  })
  if (!resp.ok) throw await readApiError(resp)
  const data = await resp.json()
  if (!data.b64) throw new Error('no b64 in response')
  return `data:${data.mimeType || 'image/png'};base64,${data.b64}`
}

export async function generateRecapQuiz({ scenes, pack }) {
  const recapScenes = scenes.map(scene => ({
    id: scene.id,
    title: scene.title || '',
    shortTitle: scene.shortTitle || '',
    chapterTitle: scene.chapterTitle || scene.sectionTitle || '',
    sectionTitle: scene.sectionTitle || '',
    narration: scene.narration || scene.text || '',
  }))
  const resp = await fetch('/api/generate-recap-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scenes: recapScenes,
      pack: pack ? { title: pack.title || '', sections: pack.sections || [] } : null,
    }),
  })
  if (!resp.ok) throw await readApiError(resp)
  const data = await resp.json()
  return {
    recap: data.recap || null,
    quiz: Array.isArray(data.quiz) ? data.quiz : [],
  }
}

export async function fetchTTS(text) {
  const resp = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) throw new Error(`TTS API ${resp.status}`)
  return await resp.blob()
}

async function startPackJob(file, { title, extractionMode }) {
  const form = new FormData()
  form.append('sourceFile', file)
  form.append('packFormat', 'shorts')
  form.append('title', title)
  form.append('extractionMode', extractionMode)
  form.append('skipMedia', '1')
  const resp = await fetch('/api/generate-pack', { method: 'POST', body: form })
  const raw = await resp.text()
  const data = raw ? JSON.parse(raw) : {}
  if (!resp.ok) throw new Error(data.error || `pack API ${resp.status}`)
  if (!data.jobId) throw new Error('pack job id missing')
  return data.jobId
}

async function startTextPackJob({ sourceText, title, packFormat = 'cards' }) {
  const form = new FormData()
  form.append('sourceText', sourceText)
  form.append('packFormat', packFormat)
  form.append('title', title || '')
  form.append('skipMedia', '1')
  const resp = await fetch('/api/generate-pack', { method: 'POST', body: form })
  const raw = await resp.text()
  const data = raw ? JSON.parse(raw) : {}
  if (!resp.ok) throw new Error(data.error || `pack API ${resp.status}`)
  if (!data.jobId) throw new Error('pack job id missing')
  return data.jobId
}

async function pollPackJob(jobId, onProgress) {
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 1600))
    const resp = await fetch(`/api/generate-pack/${jobId}/status`)
    const raw = await resp.text()
    const data = raw ? JSON.parse(raw) : {}
    if (!resp.ok) throw new Error(data.error || `pack status ${resp.status}`)
    onProgress?.(data)
    if (data.status === 'done') return data.pack
    if (data.status === 'error') throw new Error(data.error || 'pack generation failed')
  }
}

export async function generateCardPack(sourceText, onProgress) {
  const clean = String(sourceText || '').trim()
  if (!clean) throw new Error('source text required')
  const title = clean.slice(0, 28)
  const modelComboLabel = await getModelComboLabel()
  const jobId = await startTextPackJob({ sourceText: clean, title, packFormat: 'cards' })
  const pack = await pollPackJob(jobId, onProgress)
  if (!pack || pack.format !== 'cards') throw new Error('invalid card pack response')
  return {
    ...pack,
    title: withModelComboTitle(pack.title || title || '카드 학습팩', modelComboLabel),
    modelComboLabel,
    createdAt: new Date().toISOString(),
  }
}

function parseNumberedTitle(value) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim()
  const match = clean.match(/^(\d+(?:\.\d+)?|[0-9]{2})\s+(.+)$/u)
  if (!match) {
    return { number: '', title: clean }
  }
  return { number: match[1], title: match[2].trim() }
}

function buildSceneImagePrompt({ packTitle, chapterTitle, ideaTitle, clipTitle, scene }) {
  const callouts = (scene.callouts || []).filter(Boolean).join(', ')
  const captionLines = (scene.captionLines || []).filter(Boolean).join(', ')
  return [
    `Vertical 9:16 educational illustration for a Korean learning short.`,
    `Pack topic: ${packTitle}. Chapter: ${chapterTitle}. Subsection/topic: ${ideaTitle}. Clip: ${clipTitle}.`,
    `Scene headline: ${scene.headline || ''}. Core explanation: ${scene.body || scene.narration || ''}.`,
    `Create artwork for this exact TTS beat, not a full chapter poster or cover slide.`,
    callouts ? `Important visual callouts to depict without text: ${callouts}.` : '',
    captionLines ? `Caption meaning to express visually, not as written text: ${captionLines}.` : '',
    scene.visualStyle ? `Visual style: ${scene.visualStyle}.` : '',
    scene.layoutHint ? `Composition hint: ${scene.layoutHint}.` : '',
    scene.motionHint ? `Motion feeling: ${scene.motionHint}.` : '',
    `Use concrete objects, arrows, flow lines, before-after contrast, and simple symbols where useful.`,
    `When the concept needs precision, render it like a clean educational slide: exact formulas, graphs, axes, matrices, layer diagrams, or architecture blocks should be clear and aligned.`,
    `Short Korean labels, tiny diagram titles, formulas, axis labels, and legends are allowed when they improve understanding. Keep them brief and readable; do not write long paragraphs inside the image.`,
    `Never render a large top title, unit name, chapter name, subsection name, or cover-style headline. The app renders those separately.`,
    `Never render a table-of-contents screen, numbered bullet-card list, title page, lesson menu, app fallback card layout, or an image that is mostly text boxes.`,
    `The image must be raw educational artwork only, not a phone screenshot and not a complete mobile app screen.`,
    `Absolutely no smartphone frame, rounded phone viewport, notch, dynamic island, status bar, clock, battery, speed buttons, progress bar, subtitles, caption strip, tab bar, browser chrome, app UI, watermark, or fake controls.`,
    `Fill the full 9:16 canvas with artwork/background. Do not create letterboxing, white poster margins, framed slide borders, or contain-style padding.`,
    `Compose for the app's vertical phone viewport and keep the top 18% visually quiet for app overlay, with only non-essential background there and no essential concept hidden there.`,
    `Make this beat visually distinct from nearby beats by changing the composition, objects, diagram structure, camera angle, or color emphasis when the idea changes.`,
  ].filter(Boolean).join(' ')
}

function collectQuiz(backendPack) {
  const questions = []
  for (const idea of backendPack?.ideas || []) {
    for (const question of idea.quiz?.questions || []) {
      questions.push({
        q: question.question || '',
        options: question.options || [],
        answer: Number(question.correctIndex || 0),
      })
    }
  }
  return questions.filter(q => q.q && q.options.length >= 3).slice(0, 6)
}

function toSectionId(title, index) {
  const slug = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `section-${index + 1}`
}

export function convertBackendShortsPack(backendPack, {
  title,
  displayTitle,
  extractionMode,
  sourceFileName,
  timings,
  modelComboLabel,
} = {}) {
  const createdAt = new Date().toISOString()
  const chaptersByTitle = new Map()
  const scenes = []

  for (const idea of backendPack?.ideas || []) {
    const parsedChapter = parseNumberedTitle(idea.section || '')
    const parsedSubsection = parseNumberedTitle(idea.title || '')
    const chapterTitle = parsedChapter.title || idea.section || '학습 주제'
    const chapterNumber = parsedChapter.number || ''
    const subsectionTitle = parsedSubsection.title || idea.title || chapterTitle
    const subsectionNumber = parsedSubsection.number || ''
    const chapterKey = `${chapterNumber} ${chapterTitle}`.trim()

    if (!chaptersByTitle.has(chapterKey)) {
      const chapterIndex = chaptersByTitle.size
      chaptersByTitle.set(chapterKey, {
        id: toSectionId(chapterKey || chapterTitle, chapterIndex),
        number: chapterNumber,
        title: chapterTitle,
        displayTitle: chapterKey || chapterTitle,
        summary: '',
        shortIds: [],
        children: [],
      })
    }
    const chapter = chaptersByTitle.get(chapterKey)
    const childIndex = chapter.children.length
    const childId = toSectionId(`${subsectionNumber} ${subsectionTitle}`.trim() || subsectionTitle, childIndex)
    const child = {
      id: `${chapter.id}-${childId}`,
      number: subsectionNumber,
      title: subsectionTitle,
      displayTitle: `${subsectionNumber} ${subsectionTitle}`.trim(),
      summary: idea.teaser || '',
      shortIds: [],
    }
    chapter.children.push(child)

    const clip = (idea.clips || [])[0] || {}
    if (clip) {
      const clipScenes = Array.isArray(clip.scenes) ? clip.scenes : []
      const narrationLengths = clipScenes.map(scene =>
        Math.max(1, String(scene.narration || scene.body || '').replace(/\s+/g, '').length)
      )
      const totalNarrationLength = narrationLengths.reduce((sum, length) => sum + length, 0) || 1
      let cumulativeNarrationLength = 0
      const sceneId = `${child.id}-short-1`
      child.shortIds.push(sceneId)
      chapter.shortIds.push(sceneId)
      scenes.push({
        id: sceneId,
        chapterId: chapter.id,
        chapterNumber,
        chapterTitle,
        sectionId: child.id,
        sectionNumber: subsectionNumber,
        sectionTitle: chapterTitle,
        shortTitle: child.displayTitle || clip.title || subsectionTitle,
        order: scenes.length + 1,
        title: clip.title || child.displayTitle || chapterTitle,
        narration: clip.narrationScript || clipScenes.map(s => s.narration).filter(Boolean).join(' '),
        slides: clipScenes.map((scene, index) => {
          const fallbackRatio = index / Math.max(clipScenes.length, 1)
          const startRatio = index === 0
            ? 0
            : clampStartRatio(cumulativeNarrationLength / totalNarrationLength, fallbackRatio)
          cumulativeNarrationLength += narrationLengths[index] || 1
          return {
            imagePrompt: buildSceneImagePrompt({
              packTitle: backendPack?.title || title || '',
              chapterTitle: chapter.displayTitle || chapterTitle,
              ideaTitle: child.displayTitle || subsectionTitle,
              clipTitle: clip.title || '',
              scene,
            }),
            narrationMarker: index === 0
              ? String(clip.narrationScript || scene.narration || '').slice(0, 10)
              : String(scene.narration || scene.body || '').slice(0, 10),
            startRatio,
            imageUrl: null,
          }
        }),
      })
    }
  }

  return {
    id: `pack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: displayTitle || withModelComboTitle(title || backendPack?.title || '생성된 쇼츠', modelComboLabel),
    createdAt,
    scenes,
    audioBuffers: scenes.map(() => null),
    quiz: collectQuiz(backendPack),
    sections: [...chaptersByTitle.values()],
    sourceFileName,
    benchmark: {
      llmModel: 'gpt-5.4',
      imageModel: 'gpt-image-2',
      imageQuality: 'low',
      modelComboLabel: modelComboLabel || DEFAULT_MODEL_COMBO_LABEL,
      extractionMode,
      timings: timings || {},
    },
  }
}

export async function generateBenchmarkBackendPacks(file, onProgress) {
  const modelComboLabel = await getModelComboLabel()
  const configs = [
    {
      title: 'PDF Parser',
      displayTitle: withModelComboTitle('PDF Parser', modelComboLabel),
      extractionMode: 'pdf-parser',
      label: 'PDF Parser',
    },
  ]
  const packs = []
  for (const config of configs) {
    const totalStart = performance.now()
    const timings = {
      pdfExtractionMs: 0,
      tocExtractionMs: 0,
      summaryStructureMs: 0,
      scriptGenerationMs: 0,
      backendTotalMs: 0,
    }
    let currentStage = null
    let stageStartedAt = totalStart

    function switchStage(nextStage) {
      const now = performance.now()
      if (currentStage && timings[currentStage] !== undefined) {
        timings[currentStage] += now - stageStartedAt
      }
      currentStage = nextStage
      stageStartedAt = now
    }

    function updateStageFromStatus(status) {
      const step = String(status?.step || '')
      if (step.includes('extracting text')) switchStage('pdfExtractionMs')
      else if (step.includes('extracting toc')) switchStage('tocExtractionMs')
      else if (step.includes('outlin')) switchStage('summaryStructureMs')
      else if (step.includes('story') || step.includes('final')) switchStage('scriptGenerationMs')
    }

    onProgress?.({ phase: 'start', config })
    switchStage('pdfExtractionMs')
    const jobId = await startPackJob(file, config)
    const backendPack = await pollPackJob(jobId, status => {
      updateStageFromStatus(status)
      onProgress?.({ phase: 'poll', config, status })
    })
    switchStage(null)
    timings.backendTotalMs = performance.now() - totalStart
    packs.push(convertBackendShortsPack(backendPack, {
      title: config.title,
      displayTitle: config.displayTitle,
      extractionMode: config.extractionMode,
      sourceFileName: file.name,
      timings,
      modelComboLabel,
    }))
    packs[packs.length - 1].modelComboLabel = modelComboLabel
    packs[packs.length - 1].benchmark = {
      ...(packs[packs.length - 1].benchmark || {}),
      modelComboLabel,
    }
    onProgress?.({ phase: 'done', config })
  }
  return packs
}
