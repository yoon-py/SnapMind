import { useEffect, useState } from 'react'

function cleanSentence(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？…요다])\s+/)[0]
    .trim()
}

function shorten(text, max = 72) {
  const clean = String(text || '').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

function buildFallbackChapters(scenes) {
  const groups = new Map()
  scenes.forEach((scene, index) => {
    const title = scene.chapterTitle || scene.sectionTitle || '핵심 흐름'
    if (!groups.has(title)) groups.set(title, [])
    groups.get(title).push({
      title: shorten(scene.shortTitle || scene.title || `쇼츠 ${index + 1}`, 22),
      body: shorten(cleanSentence(scene.narration || scene.text || '') || scene.title, 96),
    })
  })

  return [...groups.entries()].map(([title, bullets]) => ({
    title: shorten(title, 24),
    bullets: bullets.slice(0, 4),
  })).slice(0, 5)
}

function buildFallbackCards(scenes, chapters) {
  const cardsFromChapters = chapters.flatMap(chapter =>
    (chapter.bullets || []).map(bullet => ({
      conceptTitle: bullet.title || chapter.title,
      chapterTitle: chapter.title,
      front: `${bullet.title || chapter.title}에서 꼭 기억할 점은?`,
      back: bullet.body || '방금 본 쇼츠의 핵심 흐름을 다시 떠올려 보세요.',
    }))
  )

  if (cardsFromChapters.length) return cardsFromChapters.slice(0, 8)

  return scenes.slice(0, 6).map((scene, index) => ({
    conceptTitle: scene.shortTitle || scene.title || `핵심 ${index + 1}`,
    chapterTitle: scene.chapterTitle || scene.sectionTitle || '학습 리마인드',
    front: `${scene.shortTitle || scene.title || `핵심 ${index + 1}`}의 핵심은?`,
    back: shorten(cleanSentence(scene.narration || scene.text || '') || '방금 본 내용을 한 문장으로 떠올려 보세요.', 110),
  }))
}

export default function RecapScreen({ scenes = [], recap = null, loading = false, error = '', onQuiz, onReplay }) {
  const chapters = recap?.chapters?.length ? recap.chapters : buildFallbackChapters(scenes)
  const cards = recap?.cards?.length ? recap.cards : buildFallbackCards(scenes, chapters)
  const packTitle = recap?.title || scenes[0]?.title || '학습 쇼츠'
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const stopPlayerGesture = event => event.stopPropagation()

  useEffect(() => {
    setCurrent(0)
    setFlipped(false)
  }, [recap, scenes])

  const safeCurrent = Math.min(current, Math.max(cards.length - 1, 0))
  const card = cards[safeCurrent] || {
    conceptTitle: '핵심 개념',
    chapterTitle: '학습 리마인드',
    front: '방금 배운 내용에서 꼭 기억할 점은?',
    back: '핵심 개념을 다시 떠올린 뒤 퀴즈로 확인해 보세요.',
  }
  const isLast = safeCurrent >= cards.length - 1

  function handlePrimary() {
    if (!flipped) {
      setFlipped(true)
      return
    }
    if (isLast) {
      onQuiz?.()
      return
    }
    setCurrent(index => Math.min(index + 1, cards.length - 1))
    setFlipped(false)
  }

  function handlePrevious() {
    setCurrent(index => Math.max(index - 1, 0))
    setFlipped(false)
  }

  return (
    <div
      className="recap-screen"
      onTouchStart={stopPlayerGesture}
      onTouchMove={stopPlayerGesture}
      onTouchEnd={stopPlayerGesture}
      onWheel={stopPlayerGesture}
    >
      <div className="recap-bg" />
      <div className="recap-content flashcard-mode">
        <div className="recap-kicker">REMIND</div>
        <div className="recap-title">카드로 한 번 더<br />떠올려 봐요</div>
        <div className="recap-sub">{packTitle} 핵심 리마인드</div>
        {loading && <div className="recap-status">리마인드 카드를 만드는 중...</div>}
        {!loading && error && <div className="recap-status warn">AI 리마인드 생성에 실패해 기본 카드를 보여줘요.</div>}

        <div className="recap-card-meta">
          <span>{card.chapterTitle || '학습 리마인드'}</span>
          <b>{safeCurrent + 1} / {Math.max(cards.length, 1)}</b>
        </div>

        <button
          className={`recap-flashcard${flipped ? ' flipped' : ''}`}
          type="button"
          onClick={() => setFlipped(value => !value)}
        >
          <div className="recap-card-label">{flipped ? 'ANSWER' : 'QUESTION'}</div>
          <div className="recap-card-title">{card.conceptTitle || '핵심 개념'}</div>
          <div className="recap-card-body">{flipped ? card.back : card.front}</div>
          <div className="recap-card-hint">{flipped ? '탭해서 질문 다시 보기' : '탭해서 답 보기'}</div>
        </button>

        <div className="recap-card-nav">
          <button type="button" onClick={handlePrevious} disabled={safeCurrent === 0}>이전</button>
          <div className="recap-card-dots">
            {cards.slice(0, 8).map((_, index) => (
              <span key={index} className={index === safeCurrent ? 'on' : ''} />
            ))}
          </div>
        </div>
      </div>

      <div className="recap-actions">
        <button className="recap-primary" type="button" onClick={handlePrimary}>
          {!flipped ? '답 보기' : isLast ? '퀴즈로 복습' : '다음 카드'}
        </button>
        <button className="recap-secondary" type="button" onClick={onReplay}>다시 보기</button>
      </div>
    </div>
  )
}
