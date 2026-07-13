import { useEffect, useRef, useState } from 'react'
import { fetchTTS, generateBenchmarkBackendPacks, generateImage } from '../api'

const IMAGE_CONCURRENCY = Math.max(1, Math.min(6, Number(import.meta.env.VITE_IMAGE_CONCURRENCY || 4) || 4))

const STEPS = [
  { id: 'extract', icon: '📄', name: 'PDF 추출' },
  { id: 'outline', icon: '🧭', name: '목차 구성' },
  { id: 'script', icon: '✍️', name: '쇼츠 스토리보드' },
  { id: 'tts', icon: '🎙️', name: '음성 합성' },
  { id: 'image', icon: '🖼️', name: '이미지 생성' },
  { id: 'save', icon: '📚', name: '팩 저장' },
]

function initialSteps() {
  return Object.fromEntries(STEPS.map(step => [step.id, { state: 'idle', desc: '대기 중...' }]))
}

function clonePack(pack) {
  return {
    ...pack,
    scenes: (pack.scenes || []).map(scene => ({
      ...scene,
      slides: (scene.slides || []).map(slide => ({ ...slide })),
    })),
    audioBuffers: [...(pack.audioBuffers || [])],
    quiz: [...(pack.quiz || [])],
    sections: (pack.sections || []).map(section => ({
      ...section,
      shortIds: [...(section.shortIds || [])],
      children: (section.children || []).map(child => ({ ...child, shortIds: [...(child.shortIds || [])] })),
    })),
  }
}

export default function BenchmarkGenScreen({ navigate, benchmarkFile, onComplete }) {
  const [steps, setSteps] = useState(initialSteps)
  const [title, setTitle] = useState('PDF 벤치마크 생성 중...')
  const [warning, setWarning] = useState('')
  const mountedRef = useRef(true)

  function setStep(id, state, desc) {
    setSteps(current => ({
      ...current,
      [id]: {
        state,
        desc: desc || current[id]?.desc || '',
      },
    }))
  }

  function stepIcon(state) {
    if (state === 'now') return '⏳'
    if (state === 'done') return '✅'
    if (state === 'warn') return '⚠️'
    return '···'
  }

  useEffect(() => {
    mountedRef.current = true
    const alive = () => mountedRef.current

    async function fillMedia(pack) {
      const workingPack = clonePack(pack)
      const scenes = workingPack.scenes || []
      const mediaStart = performance.now()
      const timings = {
        ...(workingPack.benchmark?.timings || {}),
        ttsGenerationMs: 0,
        imageGenerationMs: 0,
      }

      setStep('tts', 'now', `${workingPack.title} 음성 합성 중...`)
      const ttsStart = performance.now()
      for (let index = 0; index < scenes.length; index += 1) {
        if (!alive()) return workingPack
        setStep('tts', 'now', `${workingPack.title} 음성 합성 중... (${index + 1}/${scenes.length})`)
        try {
          workingPack.audioBuffers[index] = await fetchTTS(scenes[index].narration || '')
        } catch (error) {
          console.warn('벤치마크 TTS 실패:', error?.message || error)
        }
      }
      timings.ttsGenerationMs = performance.now() - ttsStart

      const tasks = scenes.flatMap((scene, sceneIndex) =>
        (scene.slides || [])
          .filter(slide => String(slide.imagePrompt || '').trim())
          .slice(0, 4)
          .map((slide, slideIndex) => ({ scene, sceneIndex, slide, slideIndex }))
      )

      setStep('image', 'now', `${workingPack.title} 이미지 생성 중... (0/${tasks.length})`)
      let completed = 0
      let failed = 0
      let cursor = 0
      const imageStart = performance.now()

      async function worker() {
        for (;;) {
          const taskIndex = cursor
          cursor += 1
          if (taskIndex >= tasks.length || !alive()) return
          const task = tasks[taskIndex]
          try {
            task.slide.imageUrl = await generateImage(task.slide.imagePrompt)
          } catch (error) {
            failed += 1
            console.warn('벤치마크 이미지 실패:', error?.message || error)
          }
          completed += 1
          setStep(
            'image',
            failed ? 'warn' : 'now',
            failed
              ? `${workingPack.title} 이미지 생성 중... (${completed}/${tasks.length}, 실패 ${failed})`
              : `${workingPack.title} 이미지 생성 중... (${completed}/${tasks.length})`
          )
        }
      }

      await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, Math.max(tasks.length, 1)) }, () => worker()))
      timings.imageGenerationMs = performance.now() - imageStart
      timings.totalGenerationMs = (timings.backendTotalMs || 0) + (performance.now() - mediaStart)
      workingPack.benchmark = {
        ...(workingPack.benchmark || {}),
        generatedAt: new Date().toISOString(),
        sourceFileName: workingPack.sourceFileName,
        tocCount: (workingPack.sections || []).reduce((sum, section) => sum + (section.children?.length || 1), 0),
        shortCount: scenes.length,
        timings,
      }
      return workingPack
    }

    async function run() {
      if (!benchmarkFile) {
        setTitle('PDF 파일이 필요해요')
        setWarning('입력 화면에서 PDF를 먼저 업로드해 주세요.')
        return
      }

      try {
        setStep('extract', 'now', 'PDF Parser로 학습자료 추출 시작')
        const packs = await generateBenchmarkBackendPacks(benchmarkFile, event => {
          if (!alive()) return
          const label = event.config?.label || ''
          if (event.phase === 'start') {
            setTitle(`${label} 결과 생성 중...`)
            setStep('extract', 'now', `${label} 방식으로 PDF 추출 중...`)
          }
          if (event.phase === 'poll') {
            const status = event.status || {}
            const step = status.step || ''
            if (step.includes('extract')) setStep('extract', 'now', `${label} 텍스트 추출 중...`)
            if (step.includes('toc')) setStep('outline', 'now', `${label} 원본 목차 추출 중...`)
            else if (step.includes('outlin')) setStep('outline', 'now', `${label} 목차와 아이디어 구성 중...`)
            else if (step.includes('story')) setStep('script', 'now', `${label} 쇼츠 스토리보드 작성 중... (${status.completedChunks || 0}/${status.totalChunks || '?'})`)
            else if (step.includes('final')) setStep('script', 'now', `${label} 팩 메타데이터 정리 중...`)
          }
          if (event.phase === 'done') {
            setStep('extract', 'done', `${label} 텍스트 추출 완료`)
            setStep('outline', 'done', `${label} 목차 구성 완료`)
            setStep('script', 'done', `${label} 쇼츠 스토리보드 완료`)
          }
        })
        if (!alive()) return

        const completedPacks = []
        for (const pack of packs) {
          setTitle(`${pack.title} 미디어 생성 중...`)
          completedPacks.push(await fillMedia(pack))
        }
        if (!alive()) return

        setStep('tts', 'done', '음성 합성 완료')
        setStep('image', 'done', '이미지 생성 완료')
        setStep('save', 'now', '팩 저장소에 저장 중...')
        await new Promise(resolve => setTimeout(resolve, 400))
        if (!alive()) return
        setStep('save', 'done', 'PDF Parser 벤치마크 팩 저장 완료')
        onComplete(completedPacks)
      } catch (error) {
        console.error('벤치마크 생성 실패:', error)
        setWarning(error?.message || '벤치마크 생성에 실패했어요.')
        setStep('save', 'warn', '생성 실패')
      }
    }

    run()
    return () => { mountedRef.current = false }
  }, []) // eslint-disable-line

  return (
    <div className="screen active" id="benchmark-gen">
      <div className="sb"><span className="sb-t">9:43</span><span className="sb-r">●●● 🔋</span></div>
      <div className="gw">
        <div className="orb" />
        <div className="gt">벤치마크 팩 생성</div>
        <div className="gs">{title}</div>
        {warning && (
          <div className="gen-warning" role="status" aria-live="polite">
            <div className="gen-warning-title">생성 경고</div>
            <div className="gen-warning-line">{warning}</div>
          </div>
        )}
        <div className="steps">
          {STEPS.map(step => (
            <div key={step.id} className={`step ${steps[step.id]?.state !== 'idle' ? steps[step.id]?.state : ''}`}>
              <div className="sic">{step.icon}</div>
              <div className="stxt">
                <div className="snm">{step.name}</div>
                <div className="sds">{steps[step.id]?.desc}</div>
              </div>
              <div className="sck">{stepIcon(steps[step.id]?.state)}</div>
            </div>
          ))}
        </div>
        {warning && (
          <button className="empty-pack-btn" type="button" onClick={() => navigate('input')}>
            입력으로 돌아가기
          </button>
        )}
      </div>
    </div>
  )
}
