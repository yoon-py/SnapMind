import { useState } from 'react'

const LABELS = ['A', 'B', 'C', 'D']

const S = {
  wrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 80, background: '#F7F8FF',
    padding: '72px 22px 22px', zIndex: 40, display: 'flex', flexDirection: 'column',
  },
  kicker: {
    fontSize: 11, fontWeight: 800, letterSpacing: 2,
    color: '#D4A400', marginBottom: 10, textTransform: 'uppercase',
  },
  question: {
    fontSize: 19, fontWeight: 900, color: '#12122A', lineHeight: 1.45, marginBottom: 28,
  },
  optionBase: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
    border: '1.5px solid #E2E4F0', background: '#fff',
    transition: 'background 0.15s, border-color 0.15s',
    marginBottom: 10,
  },
  optionOk: {
    background: '#EAF9F0', borderColor: '#1FA95C',
  },
  optionNo: {
    background: '#FEF0EE', borderColor: '#FF3B30',
  },
  optionPicked: {
    background: '#FFF8DC', borderColor: '#D4A400',
  },
  labelBase: {
    flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
    background: '#EDEEF8', color: '#6B6F9A',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800,
  },
  labelOk: { background: '#1FA95C', color: '#fff' },
  labelNo: { background: '#FF3B30', color: '#fff' },
  optionText: { fontSize: 14, flex: 1, color: '#1E1E36', fontWeight: 600 },
  nextBtn: {
    marginTop: 16, width: '100%', padding: '15px',
    background: '#D4A400', color: '#fff', fontSize: 15,
    fontWeight: 800, border: 'none', borderRadius: 14, cursor: 'pointer',
    flexShrink: 0,
  },
  explain: {
    padding: '13px 14px', borderRadius: 14, background: '#FFFDF2',
    border: '1px solid #EFE1A6', color: '#454150', fontSize: 13,
    lineHeight: 1.5, fontWeight: 600, marginTop: 8,
  },
  explainTitle: {
    color: '#12122A', fontSize: 13, fontWeight: 900, marginBottom: 4,
  },
  multiBadge: {
    display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start',
    marginBottom: 10, padding: '5px 9px', borderRadius: 999,
    background: '#FFF1BA', color: '#8B6500', fontSize: 11, fontWeight: 900,
  },
  // result screen
  resultWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 80, background: '#F7F8FF',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '0 28px 22px', zIndex: 40,
  },
  resultScore: { fontSize: 22, fontWeight: 900, color: '#12122A', marginBottom: 8, marginTop: 16 },
  resultSub: { fontSize: 13, color: '#7B7F9E', marginBottom: 40, textAlign: 'center' },
  homeBtn: {
    width: '100%', padding: 16, background: '#D4A400', color: '#fff',
    fontSize: 16, fontWeight: 800, border: 'none', borderRadius: 14,
    cursor: 'pointer', marginBottom: 12,
  },
  replayBtn: {
    width: '100%', padding: 16, background: '#fff', color: '#6B6F9A',
    fontSize: 15, fontWeight: 700, border: '1.5px solid #E2E4F0',
    borderRadius: 14, cursor: 'pointer',
  },
}

function normalizeQuestion(raw) {
  const options = Array.isArray(raw?.options) ? raw.options.filter(Boolean) : []
  const correctIndexes = Array.isArray(raw?.correctIndexes)
    ? raw.correctIndexes
    : [raw?.correctIndex, raw?.answer].filter(value => value !== undefined)
  const cleanCorrectIndexes = [...new Set(correctIndexes.map(Number).filter(index =>
    Number.isInteger(index) && index >= 0 && index < options.length
  ))]

  return {
    q: raw?.q || raw?.question || '',
    options,
    correctIndexes: cleanCorrectIndexes.length ? cleanCorrectIndexes : [0],
    explanation: raw?.explanation || '',
    conceptTitle: raw?.conceptTitle || '',
  }
}

function arraysEqualSet(a, b) {
  if (a.length !== b.length) return false
  const bs = new Set(b)
  return a.every(item => bs.has(item))
}

function QuizQuestion({ q, idx, total, onNext, isLast }) {
  const isMultiple = q.correctIndexes.length > 1
  const [selected, setSelected] = useState(isMultiple ? [] : null)
  const [submitted, setSubmitted] = useState(false)

  function pick(i) {
    if (submitted) return

    if (isMultiple) {
      setSelected(current => (
        current.includes(i)
          ? current.filter(item => item !== i)
          : [...current, i]
      ))
      return
    }

    setSelected(i)
    setSubmitted(true)
  }

  function optionStyle(i) {
    const selectedIndexes = isMultiple ? selected : selected === null ? [] : [selected]
    if (!submitted && selectedIndexes.includes(i)) return { ...S.optionBase, ...S.optionPicked }
    if (!submitted) return S.optionBase
    if (q.correctIndexes.includes(i)) return { ...S.optionBase, ...S.optionOk }
    if (selectedIndexes.includes(i)) return { ...S.optionBase, ...S.optionNo }
    return { ...S.optionBase, opacity: 0.5 }
  }

  function labelStyle(i) {
    const selectedIndexes = isMultiple ? selected : selected === null ? [] : [selected]
    if (!submitted && selectedIndexes.includes(i)) return { ...S.labelBase, background: '#D4A400', color: '#fff' }
    if (!submitted) return S.labelBase
    if (q.correctIndexes.includes(i)) return { ...S.labelBase, ...S.labelOk }
    if (selectedIndexes.includes(i)) return { ...S.labelBase, ...S.labelNo }
    return S.labelBase
  }

  function submitMultiple() {
    if (!isMultiple || selected.length === 0) return
    setSubmitted(true)
  }

  function next() {
    onNext(isMultiple ? selected : [selected])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={S.kicker}>🧠 퀴즈 · {idx + 1} / {total}</div>
      {isMultiple && <div style={S.multiBadge}>중복 정답 가능</div>}
      <div style={S.question}>{q.q}</div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {q.options.map((opt, i) => (
          <div key={i} style={optionStyle(i)} onClick={() => pick(i)}>
            <div style={labelStyle(i)}>{LABELS[i]}</div>
            <span style={S.optionText}>{opt}</span>
            {submitted && q.correctIndexes.includes(i) && <span style={{ fontSize: 18 }}>✓</span>}
            {submitted && (isMultiple ? selected.includes(i) : selected === i) && !q.correctIndexes.includes(i) && <span style={{ fontSize: 18 }}>×</span>}
          </div>
        ))}
      </div>
      {isMultiple && !submitted && (
        <button style={{ ...S.nextBtn, opacity: selected.length ? 1 : 0.45 }} onClick={submitMultiple} disabled={!selected.length}>
          제출
        </button>
      )}
      {submitted && (
        <>
          {(q.explanation || q.conceptTitle) && (
            <div style={S.explain}>
              <div style={S.explainTitle}>{q.conceptTitle || '개념 설명'}</div>
              {q.explanation}
            </div>
          )}
          <button style={S.nextBtn} onClick={next}>
            {isLast ? '결과 보기' : '다음 문제'}
          </button>
        </>
      )}
      {!isMultiple && selected !== null && !submitted && (
        <button style={S.nextBtn} onClick={() => setSubmitted(true)}>
          확인
        </button>
      )}
    </div>
  )
}

export default function QuizScreen({ quiz, navigate }) {
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState(false)
  const [score, setScore] = useState(0)
  const [answers, setAnswers] = useState([])

  const questions = (quiz.length ? quiz : [
    { q: '광합성이 일어나는 세포 소기관은?', options: ['미토콘드리아', '엽록체', '리보솜', '골지체'], answer: 1, explanation: '광합성은 엽록체에서 일어납니다. 엽록체는 빛에너지를 받아 식물이 사용할 수 있는 에너지 형태로 바꾸는 역할을 합니다.', conceptTitle: '엽록체' },
    { q: '명반응의 산물이 아닌 것은?', options: ['ATP', 'NADPH', 'O₂', '포도당'], answer: 3, explanation: '명반응은 빛에너지를 ATP와 NADPH로 바꾸고 산소를 내보냅니다. 포도당은 이후 캘빈 회로를 거쳐 만들어지는 결과에 가깝습니다.', conceptTitle: '명반응' },
    { q: '캘빈 회로에서 고정되는 기체는?', options: ['O₂', 'N₂', 'CO₂', 'H₂'], answer: 2, explanation: '캘빈 회로는 이산화탄소를 붙잡아 당을 만드는 방향으로 이어집니다. 그래서 CO₂ 고정이 핵심 표현입니다.', conceptTitle: '캘빈 회로' },
  ]).map(normalizeQuestion).slice(0, 30)

  function handleNext(selectedIndexes) {
    const correct = arraysEqualSet(selectedIndexes, questions[current].correctIndexes)
    setAnswers(prev => [...prev, { selected: selectedIndexes, correct }])
    if (correct) setScore(s => s + 1)
    if (current + 1 >= questions.length) setDone(true)
    else setCurrent(c => c + 1)
  }

  if (done) {
    const total = questions.length
    const emoji = score === total ? '🏆' : score >= total / 2 ? '👏' : '📚'
    const msg = score === total ? '완벽해요!' : score >= total / 2 ? '잘 했어요! 복습하면 더 좋아요.' : '한 번 더 학습해봐요.'
    return (
      <div style={S.resultWrap}>
        <div style={{ fontSize: 64 }}>{emoji}</div>
        <div style={S.resultScore}>{score} / {total} 정답</div>
        <div style={S.resultSub}>{msg}</div>
        <button style={S.homeBtn} onClick={() => navigate('home')}>홈으로</button>
        <button style={S.replayBtn} onClick={() => navigate('player-direct')}>다시 보기</button>
      </div>
    )
  }

  return (
    <div style={S.wrap}>
      <QuizQuestion
        key={current}
        q={questions[current]}
        idx={current}
        total={questions.length}
        isLast={current === questions.length - 1}
        onNext={handleNext}
      />
    </div>
  )
}
