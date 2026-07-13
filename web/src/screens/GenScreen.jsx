import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SCENES, generateScenes, fetchTTS, generateQuiz, generateImage } from '../api'

const STEPS = [
  { id: 'g1', icon: '📄', name: '텍스트 분석' },
  { id: 'g2', icon: '✍️', name: '스크립트 생성' },
  { id: 'g3', icon: '🎙️', name: '음성 합성 (TTS)' },
  { id: 'g4', icon: '🖼️', name: '이미지 생성' },
  { id: 'g5', icon: '🧠', name: '퀴즈 생성' },
]

const IMAGE_CONCURRENCY = Math.max(1, Math.min(6, Number(import.meta.env.VITE_IMAGE_CONCURRENCY || 4) || 4))

function cloneScenesForReplay(scenes) {
  return scenes.map(scene => ({
    ...scene,
    slides: (scene.slides || []).map(slide => ({ ...slide })),
  }))
}

export default function GenScreen({
  navigate,
  inputText,
  onComplete,
  replayScenes,
  replayAudioBuffers,
  replayQuiz = [],
  demoOnly = false,
}) {
  const [stepStates, setStepStates] = useState({ g1: 'idle', g2: 'idle', g3: 'idle', g4: 'idle', g5: 'idle' })
  const [stepDescs, setStepDescs] = useState({
    g1: '대기 중...', g2: '대기 중...', g3: '대기 중...', g4: '대기 중...', g5: '대기 중...',
  })
  const [subText, setSubText] = useState('쇼츠 생성 중...')
  const [warnings, setWarnings] = useState([])
  const mountedRef = useRef(true)
  const imageSignatureCacheRef = useRef(new Map())

  function setStep(id, state, desc) {
    setStepStates(p => ({ ...p, [id]: state }))
    if (desc) setStepDescs(p => ({ ...p, [id]: desc }))
  }

  function addWarning(message) {
    setWarnings(p => [...p, message].slice(-3))
  }

  function formatImageError(error) {
    if (error?.code === 'GEMINI_API_KEY_MISSING' || /Gemini API key/i.test(String(error?.message || error || ''))) {
      return 'Gemini API key가 없어 이미지 생성을 건너뛰었어요. `.env`에 `GEMINI_API_KEY`를 설정해 주세요.'
    }
    const message = String(error?.message || error || '')
    if (message.includes('429') || /rate.?limit|too many requests/i.test(message)) {
      return '이미지 API 요청 제한으로 일부 이미지 생성이 실패했어요. 병렬 개수를 낮추거나 잠시 후 다시 시도해 주세요.'
    }
    return '일부 이미지 생성이 실패했어요. 생성된 쇼츠는 계속 만들고, 실패한 이미지는 비워둘게요.'
  }

  function isGeminiKeyMissingError(error) {
    return error?.code === 'GEMINI_API_KEY_MISSING' || /Gemini API key/i.test(String(error?.message || error || ''))
  }

  async function isLikelyBlankImage(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return false

    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = 48
          canvas.height = 84
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          let sum = 0
          let sumSq = 0
          let opaqueCount = 0

          for (let index = 0; index < data.length; index += 4) {
            const alpha = data[index + 3]
            if (alpha < 12) continue
            const lum = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
            sum += lum
            sumSq += lum * lum
            opaqueCount++
          }

          if (!opaqueCount) {
            resolve(true)
            return
          }

          const mean = sum / opaqueCount
          const variance = sumSq / opaqueCount - mean * mean
          resolve(mean > 246 && variance < 24)
        } catch (_) {
          resolve(false)
        }
      }
      img.onerror = () => resolve(false)
      img.src = dataUrl
    })
  }

  async function getImageSignature(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return null
    const cached = imageSignatureCacheRef.current.get(dataUrl)
    if (cached) return cached

    const signature = await new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = 12
          canvas.height = 20
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          const sig = []

          for (let index = 0; index < data.length; index += 4) {
            sig.push(
              Math.round(data[index] / 16),
              Math.round(data[index + 1] / 16),
              Math.round(data[index + 2] / 16),
            )
          }
          resolve(sig)
        } catch (_) {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = dataUrl
    })

    if (signature) imageSignatureCacheRef.current.set(dataUrl, signature)
    return signature
  }

  function signatureDistance(a, b) {
    if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY
    let sum = 0
    for (let index = 0; index < a.length; index++) sum += Math.abs(a[index] - b[index])
    return sum / a.length
  }

  async function isTooSimilarToAnyImage(dataUrl, existingUrls) {
    const current = await getImageSignature(dataUrl)
    if (!current) return false

    for (const existingUrl of existingUrls) {
      const existing = await getImageSignature(existingUrl)
      if (signatureDistance(current, existing) < 1.15) return true
    }
    return false
  }

  const delay = ms => new Promise(r => setTimeout(r, ms))

  useEffect(() => {
    mountedRef.current = true
    const alive = () => mountedRef.current

    async function run() {
      if (replayScenes?.length) {
        const scenes = cloneScenesForReplay(replayScenes)
        const audioBuffers = replayAudioBuffers ? [...replayAudioBuffers] : scenes.map(() => null)
        setSubText('데모 쇼츠 생성 중...')

        setStep('g1', 'now', '원문 구조 분석 중...')
        await delay(900); if (!alive()) return
        setStep('g1', 'done', '핵심 개념 추출 완료')

        setStep('g2', 'now', '쇼츠 스크립트 구성 중...')
        await delay(1600); if (!alive()) return
        setStep('g2', 'done', '장면 구성 완료')

        setStep('g3', 'now', '음성 합성 중... (1/3)')
        await delay(650); if (!alive()) return
        setStepDescs(p => ({ ...p, g3: '음성 합성 중... (2/3)' }))
        await delay(650); if (!alive()) return
        setStepDescs(p => ({ ...p, g3: '음성 합성 중... (3/3)' }))
        await delay(500); if (!alive()) return
        setStep('g3', 'done', '음성 합성 완료')

        const imageCount = scenes.reduce((sum, scene) => sum + (scene.slides || []).filter(slide => slide.imageUrl).length, 0) || scenes.length
        setStep('g4', 'now', `시각자료 생성 중... (0/${imageCount})`)
        const imageTicks = Math.max(1, imageCount)
        for (let i = 1; i <= imageTicks; i++) {
          await delay(2200 / imageTicks); if (!alive()) return
          setStepDescs(p => ({ ...p, g4: `시각자료 생성 중... (${i}/${imageCount})` }))
        }
        setStep('g4', 'done', '이미지 생성 완료')

        setStep('g5', 'now', '퀴즈 생성 중...')
        await delay(1000); if (!alive()) return
        setStep('g5', 'done', `퀴즈 ${replayQuiz.length}문제 생성 완료`)

        await delay(400); if (!alive()) return
        onComplete(scenes, audioBuffers, replayQuiz)
        return
      }

      if (demoOnly) {
        setSubText('재사용할 쇼츠를 찾지 못했어요')
        setStep('g1', 'done', '실제 생성은 꺼져 있어요')
        setStep('g2', 'idle', '기존 생성 결과가 필요해요')
        setStep('g3', 'idle', 'TTS 재사용 데이터 없음')
        setStep('g4', 'idle', '이미지 재사용 데이터 없음')
        setStep('g5', 'idle', '퀴즈 재사용 데이터 없음')
        addWarning('현재는 데모 모드라 새 이미지/TTS를 생성하지 않아요. 기존에 생성된 쇼츠를 먼저 열거나, 데모 모드를 해제해야 합니다.')
        return
      }

      let scenes = DEFAULT_SCENES
      let audioBuffers = scenes.map(() => null)

      // Step 1 — 텍스트 분석
      await delay(400); if (!alive()) return
      setStep('g1', 'now', '핵심 개념 추출 중...')
      await delay(1200); if (!alive()) return
      setStep('g1', 'done', '핵심 개념 추출 완료')

      // Step 2 — 스크립트 + 슬라이드 구성
      await delay(300); if (!alive()) return
      setStep('g2', 'now', '장면 구성 중...')
      if (inputText.trim()) {
        setSubText(`"${inputText.slice(0, 20)}..." 쇼츠 생성 중`)
        try {
          const newScenes = await generateScenes(inputText.trim())
          if (alive()) { scenes = newScenes; audioBuffers = scenes.map(() => null) }
        } catch (e) {
          console.warn('scenes 생성 실패, 기본값 사용:', e.message)
        }
      }
      if (!alive()) return
      setStep('g2', 'done', '장면 구성 완료')

      // Step 3 — TTS (narration 사용)
      await delay(300); if (!alive()) return
      setStep('g3', 'now', '음성 합성 중...')
      for (let i = 0; i < scenes.length; i++) {
        if (!alive()) return
        setStepDescs(p => ({ ...p, g3: `음성 합성 중... (${i + 1}/${scenes.length})` }))
        try {
          audioBuffers[i] = await fetchTTS(scenes[i].narration || '')
        } catch (e) {
          console.error(`TTS 실패 (씬 ${i + 1}):`, e.message)
        }
      }
      if (!alive()) return
      setStep('g3', 'done', '음성 합성 완료')

      // Step 4 — 이미지 생성 (동시 여러 개, 실패 시 재시도)
      await delay(300); if (!alive()) return
      setStep('g4', 'now', '시각자료 생성 중...')

      const tasks = scenes.flatMap((scene, si) =>
        (scene.slides || [])
          .filter(slide => String(slide.imagePrompt || '').trim())
          .map((slide, li) => ({ scene, si, li, prompt: slide.imagePrompt }))
      )
      const total = tasks.length
      let doneCount = 0
      let failedCount = 0
      const workerCount = Math.min(IMAGE_CONCURRENCY, total)

      async function genWithRetry(prompt, getExistingUrls = () => [], tries = 3) {
        let blankRetried = false
        let similarityRetried = false
        for (let attempt = 1; attempt <= tries; attempt++) {
          try {
            const actualPrompt = attempt === 1
              ? prompt
              : `${prompt}\n\nRetry requirement: create a clearly different raw educational artwork composition for this beat. Change the scene layout, visual metaphor, diagram structure, color emphasis, and camera distance. Do not repeat the previous image.`
            const url = await generateImage(actualPrompt)
            if (!blankRetried && await isLikelyBlankImage(url)) {
              blankRetried = true
              if (attempt < tries) continue
              throw new Error('Generated image looked blank.')
            }
            const existingUrls = getExistingUrls().filter(Boolean)
            if (!similarityRetried && existingUrls.length && await isTooSimilarToAnyImage(url, existingUrls)) {
              similarityRetried = true
              if (attempt < tries) continue
              throw new Error('Generated image looked too similar to a previous slide.')
            }
            return url
          } catch (e) {
            if (isGeminiKeyMissingError(e)) throw e
            if (attempt === tries) throw e
            await delay(1500 * attempt) // backoff for rate limits
          }
        }
      }

      async function worker(queue) {
        while (queue.length) {
          const t = queue.shift()
          if (!alive()) return
          try {
            const url = await genWithRetry(
              t.prompt,
              () => (t.scene.slides || [])
                .filter((_, slideIndex) => slideIndex !== t.li)
                .map(slide => slide.imageUrl)
                .filter(Boolean)
            )
            t.scene.slides[t.li].imageUrl = url
          } catch (e) {
            console.warn(`이미지 실패 (씬${t.si + 1} 슬라이드${t.li + 1}):`, e.message)
            failedCount++
            addWarning(`씬 ${t.si + 1} 슬라이드 ${t.li + 1}: ${formatImageError(e)}`)
            if (isGeminiKeyMissingError(e)) {
              queue.length = 0
            }
          }
          doneCount++
          setStepDescs(p => ({
            ...p,
            g4: failedCount
              ? `시각자료 생성 중... (${doneCount}/${total}, 실패 ${failedCount})`
              : `시각자료 생성 중... (${doneCount}/${total})`,
          }))
        }
      }

      const queue = [...tasks]
      setStepDescs(p => ({ ...p, g4: `시각자료 생성 중... (0/${total}, 동시 ${workerCount}개)` }))
      await Promise.all(Array.from({ length: workerCount }, () => worker(queue)))
      if (!alive()) return
      setStep('g4', 'done', failedCount ? `이미지 ${failedCount}개 실패, 나머지 완료` : '이미지 생성 완료')

      // Step 5 — 퀴즈 생성
      await delay(300); if (!alive()) return
      setStep('g5', 'now', '퀴즈 생성 중...')
      let quiz = []
      try {
        quiz = await generateQuiz(scenes)
      } catch (e) {
        console.warn('퀴즈 생성 실패:', e.message)
      }
      if (!alive()) return
      setStep('g5', 'done', `퀴즈 ${quiz.length}문제 생성 완료`)

      await delay(600); if (!alive()) return
      onComplete(scenes, audioBuffers, quiz)
    }

    run()
    return () => { mountedRef.current = false }
  }, []) // eslint-disable-line

  function stepIcon(state) {
    if (state === 'now') return '⏳'
    if (state === 'done') return '✅'
    return '···'
  }

  return (
    <div className="screen active" id="gen">
      <div className="sb"><span className="sb-t">9:43</span><span className="sb-r">●●● 🔋</span></div>
      <div className="gw">
        <div className="orb" />
        <div className="gt">AI가 만들고 있어요</div>
        <div className="gs">{subText}</div>
        {warnings.length > 0 && (
          <div className="gen-warning" role="status" aria-live="polite">
            <div className="gen-warning-title">생성 경고</div>
            {warnings.map((warning, index) => (
              <div key={`${warning}-${index}`} className="gen-warning-line">{warning}</div>
            ))}
          </div>
        )}
        <div className="steps">
          {STEPS.map(s => (
            <div key={s.id} className={`step ${stepStates[s.id] !== 'idle' ? stepStates[s.id] : ''}`}>
              <div className="sic">{s.icon}</div>
              <div className="stxt">
                <div className="snm">{s.name}</div>
                <div className="sds">{stepDescs[s.id]}</div>
              </div>
              <div className="sck">{stepIcon(stepStates[s.id])}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
