import { useEffect, useRef, useState } from 'react'
import { generateCardPack } from '../api'

const STEPS = [
  { id: 'c1', icon: '📄', name: '자료 분석' },
  { id: 'c2', icon: '🃏', name: '카드 설계' },
  { id: 'c3', icon: '📐', name: '도식/인터랙션 배치' },
  { id: 'c4', icon: '🧠', name: '복습 문항 구성' },
]

export default function CardGenScreen({ navigate, inputText, onComplete }) {
  const [stepStates, setStepStates] = useState({ c1: 'idle', c2: 'idle', c3: 'idle', c4: 'idle' })
  const [stepDescs, setStepDescs] = useState({
    c1: '대기 중...', c2: '대기 중...', c3: '대기 중...', c4: '대기 중...',
  })
  const [subText, setSubText] = useState('카드형 학습팩 생성 중...')
  const [warning, setWarning] = useState('')
  const mountedRef = useRef(true)

  function setStep(id, state, desc) {
    setStepStates(prev => ({ ...prev, [id]: state }))
    if (desc) setStepDescs(prev => ({ ...prev, [id]: desc }))
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

    async function run() {
      const clean = String(inputText || '').trim()
      if (!clean) {
        setWarning('카드로 만들 학습 자료가 비어 있어요.')
        setStep('c1', 'warn', '원문 텍스트가 필요해요')
        return
      }

      setSubText(`"${clean.slice(0, 20)}..." 카드팩 생성 중`)
      setStep('c1', 'now', '핵심 개념과 학습 순서 분석 중...')

      try {
        const pack = await generateCardPack(clean, status => {
          if (!alive()) return
          const step = String(status?.step || '')
          const completed = Number(status?.completedChunks || 0)
          const total = Number(status?.totalChunks || 0)
          const suffix = total ? ` (${Math.min(completed, total)}/${total})` : ''

          if (step.includes('extract')) {
            setStep('c1', 'now', `자료 읽는 중${suffix}`)
          } else if (step.includes('generating')) {
            setStep('c1', 'done', '자료 분석 완료')
            setStep('c2', 'now', `카드 흐름 설계 중${suffix}`)
          } else if (step.includes('retry')) {
            setStep('c2', 'now', '빠진 단원이 없는지 다시 점검 중...')
          }
        })

        if (!alive()) return
        const ideaCount = pack.ideas?.length || 0
        const cardCount = (pack.ideas || []).reduce((sum, idea) => sum + (idea.lessonCards?.length || 0), 0)
        setStep('c1', 'done', '자료 분석 완료')
        setStep('c2', 'done', `${ideaCount}개 개념 · ${cardCount}장 카드 구성 완료`)
        setStep('c3', 'done', '비교표, 도식, 인터랙션 타입 배치 완료')
        setStep('c4', 'done', '연습 문제와 최종 복습 구성 완료')
        setTimeout(() => {
          if (alive()) onComplete(pack)
        }, 500)
      } catch (error) {
        if (!alive()) return
        setStep('c1', 'warn', '자료 분석 또는 생성 요청에서 문제가 생겼어요')
        setStep('c2', 'warn', '카드 생성 실패')
        setWarning(error?.message || '카드팩을 생성하지 못했어요.')
      }
    }

    run()
    return () => { mountedRef.current = false }
  }, []) // eslint-disable-line

  return (
    <div className="screen active" id="card-gen">
      <div className="sb"><span className="sb-t">9:43</span><span className="sb-r">●●● 🔋</span></div>
      <div className="gw card-gen-wrap">
        <div className="orb" />
        <div className="gt">카드팩을 만들고 있어요</div>
        <div className="gs">{subText}</div>
        {warning && (
          <div className="gen-warning" role="status" aria-live="polite">
            <div className="gen-warning-title">생성 경고</div>
            <div className="gen-warning-line">{warning}</div>
            <button className="card-inline-btn" type="button" onClick={() => navigate('input')}>입력으로 돌아가기</button>
          </div>
        )}
        <div className="steps">
          {STEPS.map(step => (
            <div key={step.id} className={`step ${stepStates[step.id] !== 'idle' ? stepStates[step.id] : ''}`}>
              <div className="sic">{step.icon}</div>
              <div className="stxt">
                <div className="snm">{step.name}</div>
                <div className="sds">{stepDescs[step.id]}</div>
              </div>
              <div className="sck">{stepIcon(stepStates[step.id])}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
