import { useEffect, useRef, useState } from 'react'

const ACTION_WIDTH = 82
const SWIPE_THRESHOLD = 38

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export default function SwipeDeletePackCard({
  icon = '🎬',
  iconBackground = 'rgba(212,164,0,0.1)',
  title,
  meta,
  badge = 'SHORTS',
  badgeClass = 'bs',
  onOpen,
  onDelete,
  onRename,
}) {
  const [open, setOpen] = useState(false)
  const [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title || '')
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const offsetRef = useRef(0)
  const draggingRef = useRef(false)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    if (!editing) setDraftTitle(title || '')
  }, [editing, title])

  function setOffsetValue(value) {
    offsetRef.current = value
    setOffset(value)
  }

  function handlePointerDown(event) {
    if (editing) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    draggingRef.current = true
    suppressClickRef.current = false
    startXRef.current = event.clientX
    startYRef.current = event.clientY
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event) {
    if (!draggingRef.current) return

    const dx = event.clientX - startXRef.current
    const dy = event.clientY - startYRef.current
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    if (Math.abs(dy) > Math.abs(dx) * 1.2) return

    suppressClickRef.current = true
    const base = open ? -ACTION_WIDTH : 0
    setOffsetValue(clamp(base + dx, -ACTION_WIDTH, 0))
  }

  function handlePointerUp(event) {
    if (!draggingRef.current) return
    draggingRef.current = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const shouldOpen = offsetRef.current < -SWIPE_THRESHOLD
    setOpen(shouldOpen)
    setOffsetValue(shouldOpen ? -ACTION_WIDTH : 0)
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 120)
  }

  function handleCardClick() {
    if (editing) return
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (open) {
      setOpen(false)
      setOffsetValue(0)
      return
    }
    onOpen?.()
  }

  function handleDelete(event) {
    event.stopPropagation()
    onDelete?.()
  }

  function startEditing(event) {
    event.stopPropagation()
    setOpen(false)
    setOffsetValue(0)
    setDraftTitle(title || '')
    setEditing(true)
  }

  function cancelEditing(event) {
    event.stopPropagation()
    setDraftTitle(title || '')
    setEditing(false)
  }

  function saveTitle(event) {
    event.stopPropagation()
    const cleanTitle = draftTitle.trim()
    if (!cleanTitle) return
    onRename?.(cleanTitle)
    setEditing(false)
  }

  function handleTitleKeyDown(event) {
    if (event.key === 'Enter') {
      saveTitle(event)
    }
    if (event.key === 'Escape') {
      cancelEditing(event)
    }
  }

  return (
    <div className={`swipe-pack${open ? ' open' : ''}`}>
      <button className="swipe-delete" type="button" onClick={handleDelete}>
        삭제
      </button>
      <div
        className="swipe-content"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleCardClick}
      >
        <div className="pc">
          <div className="pi" style={{ background: iconBackground }}>{icon}</div>
          <div className="pn">
            {editing ? (
              <input
                className="pack-title-input"
                value={draftTitle}
                onChange={event => setDraftTitle(event.target.value)}
                onClick={event => event.stopPropagation()}
                onPointerDown={event => event.stopPropagation()}
                onKeyDown={handleTitleKeyDown}
                autoFocus
              />
            ) : (
              <div className="pt">{title}</div>
            )}
            <div className="pm">{meta}</div>
          </div>
          {editing ? (
            <div className="pack-edit-actions">
              <button className="pack-save" type="button" onPointerDown={event => event.stopPropagation()} onClick={saveTitle}>저장</button>
              <button className="pack-cancel" type="button" onPointerDown={event => event.stopPropagation()} onClick={cancelEditing}>취소</button>
            </div>
          ) : (
            <>
              {onRename && (
                <button className="pack-edit" type="button" aria-label="팩 이름 수정" onPointerDown={event => event.stopPropagation()} onClick={startEditing}>
                  ✎
                </button>
              )}
              <div className={`pb ${badgeClass}`}>{badge}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
