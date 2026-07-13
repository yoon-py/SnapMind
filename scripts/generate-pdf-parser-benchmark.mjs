#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { convertBackendShortsPack } from '../web/src/api.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const BACKEND_URL = process.env.SNAPMIND_BACKEND_URL || 'http://localhost:8788'
const PDF_PATH = process.argv[2] || '/Users/yoonhwan/Downloads/[ML Basic] (6-1) 모델 평가의 기초.pdf'
const PACK_TITLE = 'GPT5.4 + Image2 low · PDF Parser'
const EXTRACTION_MODE = 'pdf-parser'
const IMAGE_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.SNAPMIND_IMAGE_CONCURRENCY || 4) || 4))
const SLIDES_PER_SHORT = Math.max(1, Math.min(7, Number(process.env.SNAPMIND_SLIDES_PER_SHORT || 4) || 4))

function roundMs(value) {
  return Math.round(Number(value || 0))
}

function formatMs(value) {
  const ms = roundMs(value)
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function nowKstSlug() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = type => parts.find(part => part.type === type)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')}-${get('hour')}${get('minute')}`
}

function makeStageTracker() {
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

  function update(status) {
    const step = String(status?.step || '')
    if (step.includes('extracting text')) switchStage('pdfExtractionMs')
    else if (step.includes('extracting toc')) switchStage('tocExtractionMs')
    else if (step.includes('outlin')) switchStage('summaryStructureMs')
    else if (step.includes('story') || step.includes('final')) switchStage('scriptGenerationMs')
  }

  function finish() {
    switchStage(null)
    timings.backendTotalMs = performance.now() - totalStart
    return Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, roundMs(value)]))
  }

  switchStage('pdfExtractionMs')
  return { update, finish }
}

async function startPackJob(pdfPath) {
  const fileBuffer = await fs.readFile(pdfPath)
  const fileName = path.basename(pdfPath)
  const form = new FormData()
  form.append('sourceFile', new Blob([fileBuffer], { type: 'application/pdf' }), fileName)
  form.append('packFormat', 'shorts')
  form.append('title', PACK_TITLE)
  form.append('extractionMode', EXTRACTION_MODE)
  form.append('skipMedia', '1')

  const response = await fetch(`${BACKEND_URL}/api/generate-pack`, { method: 'POST', body: form })
  const raw = await response.text()
  const data = raw ? JSON.parse(raw) : {}
  if (!response.ok) {
    throw new Error(data.error || `pack API ${response.status}`)
  }
  if (!data.jobId) {
    throw new Error('pack job id missing')
  }
  return data.jobId
}

async function pollPackJob(jobId, tracker) {
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 1400))
    const response = await fetch(`${BACKEND_URL}/api/generate-pack/${jobId}/status`)
    const raw = await response.text()
    const data = raw ? JSON.parse(raw) : {}
    if (!response.ok) {
      throw new Error(data.error || `pack status ${response.status}`)
    }
    tracker.update(data)
    if (data.status === 'working') {
      const count = data.totalChunks ? ` (${data.completedChunks || 0}/${data.totalChunks})` : ''
      console.log(`[backend] ${data.step || 'working'}${count}`)
    }
    if (data.status === 'done') return { pack: data.pack, debug: data.debug }
    if (data.status === 'error') throw new Error(data.error || 'pack generation failed')
  }
}

async function fetchTtsDataUrl(text) {
  const response = await fetch(`${BACKEND_URL}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!response.ok) {
    throw new Error(`TTS API ${response.status}: ${await response.text()}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  return `data:audio/mpeg;base64,${buffer.toString('base64')}`
}

async function fetchImageDataUrl(prompt) {
  const response = await fetch(`${BACKEND_URL}/api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const raw = await response.text()
  const data = raw ? JSON.parse(raw) : {}
  if (!response.ok) {
    throw new Error(data.error || `image API ${response.status}`)
  }
  if (!data.b64) {
    throw new Error('image API returned no image data')
  }
  return `data:image/png;base64,${data.b64}`
}

async function fillTts(pack) {
  const start = performance.now()
  let failed = 0
  for (let index = 0; index < pack.scenes.length; index += 1) {
    const scene = pack.scenes[index]
    process.stdout.write(`[tts] ${index + 1}/${pack.scenes.length} ${scene.shortTitle || scene.title}\n`)
    try {
      pack.audioBuffers[index] = { dataUrl: await fetchTtsDataUrl(scene.narration || '') }
    } catch (error) {
      failed += 1
      console.warn(`[tts] failed ${index + 1}: ${error.message}`)
      pack.audioBuffers[index] = null
    }
  }
  return { ms: roundMs(performance.now() - start), failed }
}

async function fillImages(pack) {
  const start = performance.now()
  const tasks = pack.scenes.flatMap((scene, sceneIndex) =>
    (scene.slides || [])
      .filter(slide => String(slide.imagePrompt || '').trim())
      .slice(0, SLIDES_PER_SHORT)
      .map((slide, slideIndex) => ({ sceneIndex, slideIndex, slide }))
  )
  let cursor = 0
  let completed = 0
  let failed = 0

  async function worker() {
    for (;;) {
      const taskIndex = cursor
      cursor += 1
      if (taskIndex >= tasks.length) return
      const task = tasks[taskIndex]
      try {
        task.slide.imageUrl = await fetchImageDataUrl(task.slide.imagePrompt)
      } catch (error) {
        failed += 1
        console.warn(`[image] failed scene ${task.sceneIndex + 1} slide ${task.slideIndex + 1}: ${error.message}`)
      }
      completed += 1
      console.log(`[image] ${completed}/${tasks.length}`)
    }
  }

  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, Math.max(tasks.length, 1)) }, () => worker()))
  return { ms: roundMs(performance.now() - start), failed, total: tasks.length }
}

function buildDevlog(pack, failures, debug) {
  const timings = pack.benchmark?.timings || {}
  const generatedAt = pack.benchmark?.generatedAt || new Date().toISOString()
  const sections = pack.sections || []
  const tocLines = sections.flatMap(section => [
    `- ${section.number || ''} ${section.title}`.trim(),
    ...(section.children || []).map(child => `  - ${`${child.number || ''} ${child.title}`.trim()}`),
  ])
  const timingLines = Object.entries(timings).map(([key, value]) => `- ${key}: ${formatMs(value)}`)
  const debugOutline = Array.isArray(debug?.numberedOutline)
    ? debug.numberedOutline.map(item => `- ${item.number} ${item.title} (${item.bodyLength || 0} chars)`)
    : []

  return [
    '# SnapMind PDF Parser Benchmark',
    '',
    `- 생성 일시: ${generatedAt}`,
    `- 입력 PDF: ${path.basename(PDF_PATH)}`,
    `- 팩 이름: ${pack.title}`,
    '- 모델 조합: GPT5.4 + GPT Image 2 low',
    '- 추출 방식: PDF Parser only',
    `- 총 대단원 수: ${sections.length}`,
    `- 총 세부 목차 수: ${pack.benchmark?.tocCount || 0}`,
    `- 총 쇼츠 수: ${pack.scenes?.length || 0}`,
    `- 이미지 생성 대상: ${failures.imageTotal || 0}`,
    `- 실패/재시도: TTS 실패 ${failures.ttsFailed || 0}, 이미지 실패 ${failures.imageFailed || 0}`,
    '- API 키 저장 여부: 저장하지 않음',
    '',
    '## 목차',
    '',
    ...tocLines,
    '',
    '## 단계별 소요 시간',
    '',
    ...timingLines,
    '',
    '참고: tocExtractionMs 또는 summaryStructureMs가 0ms이면 원본 목차 직접 사용 경로에서 폴링 간격 사이에 완료된 단계입니다.',
    '',
    '## PDF Parser 감지 목차',
    '',
    ...(debugOutline.length ? debugOutline : ['- 기록 없음']),
    '',
    '## 검수 메모',
    '',
    '- 원본 PDF 목차 순서 보존을 우선 적용했다.',
    '- 세부 목차 하나를 하나의 완성된 쇼츠로 묶는 방향으로 재생성했다.',
    '- Upstage OCR은 이번 생성에서 사용하지 않았다.',
    '',
  ].join('\n')
}

async function main() {
  console.log(`[input] ${PDF_PATH}`)
  const health = await fetch(`${BACKEND_URL}/health`).then(response => response.json())
  console.log(`[backend] ${health.llmProvider} ${health.model}`)

  const tracker = makeStageTracker()
  const jobId = await startPackJob(PDF_PATH)
  console.log(`[backend] job ${jobId}`)
  const { pack: backendPack, debug } = await pollPackJob(jobId, tracker)
  const backendTimings = tracker.finish()

  const pack = convertBackendShortsPack(backendPack, {
    title: PACK_TITLE,
    extractionMode: EXTRACTION_MODE,
    sourceFileName: path.basename(PDF_PATH),
    timings: backendTimings,
  })

  const tts = await fillTts(pack)
  const image = await fillImages(pack)
  const totalGenerationMs = roundMs(
    (pack.benchmark?.timings?.backendTotalMs || 0) +
    tts.ms +
    image.ms
  )

  pack.benchmark = {
    ...(pack.benchmark || {}),
    llmModel: 'gpt-5.4',
    imageModel: 'gpt-image-2',
    imageQuality: 'low',
    extractionMode: EXTRACTION_MODE,
    generatedAt: new Date().toISOString(),
    sourceFileName: path.basename(PDF_PATH),
    tocCount: (pack.sections || []).reduce((sum, section) => sum + (section.children?.length || 1), 0),
    shortCount: pack.scenes?.length || 0,
    timingNotes: {
      tocExtractionMs: 'Original source TOC was detected directly; this stage can finish between status polls.',
      summaryStructureMs: 'No separate LLM summary pass was used when the source TOC was reliable.',
    },
    timings: {
      ...(pack.benchmark?.timings || {}),
      ttsGenerationMs: tts.ms,
      imageGenerationMs: image.ms,
      totalGenerationMs,
    },
  }

  const outputPath = path.join(repoRoot, 'web/public/benchmark-packs.json')
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, JSON.stringify({
    replaceExisting: true,
    generatedAt: new Date().toISOString(),
    packs: [pack],
  }))

  const devlogDir = path.join(repoRoot, 'docs/devlog')
  await fs.mkdir(devlogDir, { recursive: true })
  const devlogPath = path.join(devlogDir, `snapmind-pdf-parser-benchmark-${nowKstSlug()}.md`)
  await fs.writeFile(devlogPath, buildDevlog(pack, {
    ttsFailed: tts.failed,
    imageFailed: image.failed,
    imageTotal: image.total,
  }, debug))

  console.log('[done]')
  console.log(`pack: ${pack.title}`)
  console.log(`toc: ${pack.benchmark.tocCount}, shorts: ${pack.benchmark.shortCount}`)
  console.log(`timings: ${JSON.stringify(pack.benchmark.timings)}`)
  console.log(`export: ${outputPath}`)
  console.log(`devlog: ${devlogPath}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
