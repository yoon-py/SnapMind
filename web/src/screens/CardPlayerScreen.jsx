import { useMemo, useRef, useState } from 'react'

function stripMarkdown(text) {
  return String(text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
}

function getCards(pack) {
  return (pack?.ideas || []).flatMap((idea, ideaIndex) =>
    (idea.lessonCards || []).map((card, cardIndex) => ({
      ...card,
      ideaTitle: idea.title || `개념 ${ideaIndex + 1}`,
      ideaSection: idea.section || '',
      cardNumber: cardIndex + 1,
      totalInIdea: idea.lessonCards?.length || 1,
    }))
  )
}

function inferCardType(card) {
  if (card?.cardType && card.cardType !== 'concept') return card.cardType
  if (card?.check?.question) return 'quiz'
  if (card?.interaction?.kind && card.interaction.kind !== 'none') return 'interactive'
  if (card?.diagram?.kind && card.diagram.kind !== 'none') return 'diagram'
  if (card?.media?.kind === 'source_image') return 'source_image'
  if (card?.media?.kind === 'free_image') return 'free_image'
  return card?.cardType || 'concept'
}

function CardDiagram({ card }) {
  const diagram = card.diagram || {}
  const labels = diagram.labels?.length ? diagram.labels : [card.title, card.support].filter(Boolean).slice(0, 4)
  const kind = diagram.kind || 'none'

  if (kind === 'formula' || diagram.expression) {
    return (
      <div className="card-diagram formula">
        <div className="card-diagram-title">{diagram.title || '핵심 식'}</div>
        <div className="formula-box">{diagram.expression || stripMarkdown(card.support)}</div>
      </div>
    )
  }

  if (kind === 'comparison') {
    const left = labels[0] || '개념 A'
    const right = labels[1] || '개념 B'
    return (
      <div className="card-diagram compare">
        <div className="compare-panel"><b>{left}</b><span>{stripMarkdown(card.body).slice(0, 72)}</span></div>
        <div className="compare-vs">VS</div>
        <div className="compare-panel"><b>{right}</b><span>{stripMarkdown(card.support).slice(0, 72)}</span></div>
      </div>
    )
  }

  return (
    <div className={`card-diagram ${kind}`}>
      <div className="card-diagram-title">{diagram.title || '개념 흐름'}</div>
      <div className="flow-line">
        {labels.slice(0, 5).map((label, index) => (
          <div className="flow-node" key={`${label}-${index}`}>
            <span>{index + 1}</span>
            <b>{label}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

function MediaSlot({ card }) {
  const media = card.media || {}
  const kind = media.kind || inferCardType(card)
  const title = kind === 'source_image' ? '학습자료 삽화 슬롯' : '저작권 프리 이미지 슬롯'
  const label = kind === 'source_image' ? 'SOURCE' : 'FREE'

  return (
    <div className="card-media-slot">
      <div className="media-badge">{label}</div>
      <div className="media-title">{title}</div>
      <div className="media-query">{media.query || card.title}</div>
      <div className="media-caption">{media.caption || '이 카드에는 정확한 이해를 돕는 이미지가 들어갈 수 있어요.'}</div>
    </div>
  )
}

function InteractiveBlock({ card }) {
  const interaction = card.interaction || {}
  const check = card.check || {}
  const kind = interaction.kind && interaction.kind !== 'none'
    ? interaction.kind
    : check.question
      ? 'quiz'
      : 'flip'
  const [revealed, setRevealed] = useState(false)
  const [picked, setPicked] = useState(null)
  const [slider, setSlider] = useState(50)
  const options = interaction.options?.length ? interaction.options : check.options || []

  if (kind === 'quiz') {
    return (
      <div className="card-interaction">
        <div className="interaction-prompt">{check.question || interaction.prompt || '어떤 선택이 맞을까요?'}</div>
        <div className="interaction-options">
          {options.map((option, index) => {
            const isPicked = picked === index
            const isCorrect = Number(check.correctIndex || 0) === index
            return (
              <button
                key={`${option}-${index}`}
                type="button"
                className={`interaction-option${picked !== null && isCorrect ? ' ok' : ''}${isPicked && !isCorrect ? ' no' : ''}`}
                onClick={() => setPicked(index)}
              >
                {option}
              </button>
            )
          })}
        </div>
        {picked !== null && <div className="interaction-answer">{check.explanation || card.support}</div>}
      </div>
    )
  }

  if (kind === 'slider') {
    return (
      <div className="card-interaction">
        <div className="interaction-prompt">{interaction.prompt || '값을 움직이며 변화를 확인해 보세요.'}</div>
        <input className="card-slider" type="range" min="0" max="100" value={slider} onChange={event => setSlider(event.target.value)} />
        <div className="slider-readout">
          <span>작게</span>
          <b>{slider}</b>
          <span>크게</span>
        </div>
        <div className="interaction-answer">{interaction.answer || card.support}</div>
      </div>
    )
  }

  if (kind === 'toggle') {
    return (
      <div className="card-interaction">
        <div className="interaction-prompt">{interaction.prompt || '둘 중 하나를 눌러 차이를 확인해 보세요.'}</div>
        <div className="toggle-row">
          {(options.length ? options : ['A', 'B']).slice(0, 3).map((option, index) => (
            <button
              key={`${option}-${index}`}
              type="button"
              className={picked === index ? 'on' : ''}
              onClick={() => setPicked(index)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="interaction-answer">{picked === null ? '선택지를 눌러 보세요.' : interaction.answer || card.support}</div>
      </div>
    )
  }

  if (kind === 'order') {
    return (
      <div className="card-interaction">
        <div className="interaction-prompt">{interaction.prompt || '순서를 떠올려 보세요.'}</div>
        <div className="order-list">
          {(options.length ? options : [card.title, card.support]).slice(0, 5).map((option, index) => (
            <div className="order-item" key={`${option}-${index}`}><span>{index + 1}</span>{option}</div>
          ))}
        </div>
        <button className="interaction-reveal" type="button" onClick={() => setRevealed(value => !value)}>정답 흐름 보기</button>
        {revealed && <div className="interaction-answer">{interaction.answer || card.support}</div>}
      </div>
    )
  }

  return (
    <div className="card-interaction">
      <div className="interaction-prompt">{interaction.prompt || '핵심을 먼저 떠올려 보세요.'}</div>
      <button className="interaction-reveal" type="button" onClick={() => setRevealed(value => !value)}>
        {revealed ? '다시 가리기' : '답 보기'}
      </button>
      {revealed && <div className="interaction-answer">{interaction.answer || card.support}</div>}
    </div>
  )
}

function CardBody({ card }) {
  const type = inferCardType(card)
  return (
    <>
      {(type === 'source_image' || type === 'free_image') && <MediaSlot card={card} />}
      {(type === 'diagram' || type === 'comparison') && <CardDiagram card={card} />}
      {(type === 'interactive' || type === 'recall' || type === 'quiz') && <InteractiveBlock card={card} />}
      <div className="learn-card-body">{stripMarkdown(card.body)}</div>
      {card.support && <div className="learn-card-support">{stripMarkdown(card.support)}</div>}
    </>
  )
}

export default function CardPlayerScreen({ pack, navigate }) {
  const cards = useMemo(() => getCards(pack), [pack])
  const [index, setIndex] = useState(0)
  const touchStartRef = useRef(null)
  const card = cards[index] || null

  function move(delta) {
    setIndex(current => Math.max(0, Math.min(cards.length - 1, current + delta)))
  }

  function onTouchStart(event) {
    touchStartRef.current = event.touches[0].clientY
  }

  function onTouchEnd(event) {
    if (!touchStartRef.current) return
    const dy = touchStartRef.current - event.changedTouches[0].clientY
    touchStartRef.current = null
    if (Math.abs(dy) < 42) return
    if (dy > 0) move(1)
    else move(-1)
  }

  function onWheel(event) {
    if (event.deltaY > 30) move(1)
    else if (event.deltaY < -30) move(-1)
  }

  if (!card) {
    return (
      <div className="screen active card-player">
        <div className="empty-pack">
          <div className="empty-pack-title">카드가 없어요</div>
          <button className="empty-pack-btn" onClick={() => navigate('input')}>다시 만들기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen active card-player" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onWheel={onWheel}>
      <div className="card-player-head">
        <button className="card-back" type="button" onClick={() => navigate('packs')}>←</button>
        <div>
          <div className="card-pack-title">{pack?.title || '카드 학습팩'}</div>
          <div className="card-pack-sub">{index + 1} / {cards.length} · {card.ideaTitle}</div>
        </div>
      </div>

      <div className={`learn-card type-${inferCardType(card)}`}>
        <div className="learn-card-top">
          <span>{card.eyebrow || card.ideaSection || 'LEARNING CARD'}</span>
          <b>{inferCardType(card).replace('_', ' ')}</b>
        </div>
        <h1>{card.title}</h1>
        <CardBody card={card} />
      </div>

      <div className="card-player-actions">
        <button type="button" onClick={() => move(-1)} disabled={index === 0}>이전</button>
        <button type="button" className="primary" onClick={() => index >= cards.length - 1 ? navigate('packs') : move(1)}>
          {index >= cards.length - 1 ? '완료' : '다음'}
        </button>
      </div>
    </div>
  )
}
