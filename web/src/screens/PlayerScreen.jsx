import { useState, useEffect, useRef, useCallback } from 'react'
import QuizScreen from './QuizScreen'
import TabBar from '../components/TabBar'

const SCENE_BG = [
  'linear-gradient(155deg,#071a0e 0%,#0a3520 55%,#0d5530 100%)',
  'linear-gradient(155deg,#0d0820 0%,#121540 55%,#162060 100%)',
  'linear-gradient(155deg,#120820 0%,#240e40 55%,#321555 100%)',
]

const PLAYBACK_RATES = [1, 1.25, 1.5, 2]
const SEEK_STEP = 5 // 좌우 화살표로 앞뒤 이동하는 초

function getSubtitleChunks(text) {
  const MAX = 40
  const sentences = text.split(/(?<=[.!?。！？…])\s+/).map(s => s.trim()).filter(Boolean)
  if (!sentences.length) sentences.push(text.trim())
  const chunks = []
  let cur = ''
  for (const s of sentences) {
    if (!cur) { cur = s; continue }
    if ((cur + ' ' + s).length <= MAX) { cur += ' ' + s }
    else { chunks.push(cur); cur = s }
  }
  if (cur) chunks.push(cur)
  const result = []
  for (const chunk of chunks) {
    if (chunk.length <= MAX) { result.push(chunk); continue }
    for (let i = 0; i < chunk.length; i += MAX) result.push(chunk.slice(i, i + MAX))
  }
  return result.filter(Boolean)
}

// Find which slide index should be active based on how far into the narration we are
function getActiveSlideIdx(narration, slides, progress) {
  if (!slides || slides.length <= 1) return 0
  const ratioSlides = slides
    .map((slide, index) => ({ index, startRatio: Number(slide.startRatio) }))
    .filter(item => Number.isFinite(item.startRatio))

  if (ratioSlides.length === slides.length) {
    let activeIdx = 0
    for (const item of ratioSlides) {
      if (progress >= Math.max(0, Math.min(0.98, item.startRatio))) activeIdx = item.index
    }
    return activeIdx
  }

  const coveredLen = Math.floor(narration.length * progress)
  const covered = narration.slice(0, coveredLen)
  let activeIdx = 0
  for (let i = 0; i < slides.length; i++) {
    const marker = slides[i].narrationMarker
    if (marker && covered.includes(marker)) activeIdx = i
  }
  return activeIdx
}

function findPreviousSlideImage(slides, activeIndex) {
  for (let index = Math.min(activeIndex, slides.length - 1); index >= 0; index--) {
    const imageUrl = slides[index]?.imageUrl
    if (typeof imageUrl === 'string' && imageUrl.trim()) return imageUrl
  }
  return ''
}

function extractFallbackKeywords(scene) {
  const source = [
    scene.shortTitle,
    scene.title,
    scene.chapterTitle,
    scene.narration,
  ].filter(Boolean).join(' ')
  const words = source
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length >= 2 && word.length <= 14)
  const seen = new Set()
  const result = []

  for (const word of words) {
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(word)
    if (result.length >= 4) break
  }

  return result.length ? result : ['핵심', '구조', '흐름']
}

function FallbackVisual({ scene }) {
  const keywords = extractFallbackKeywords(scene)
  const isEvaluation = /정성|정량|qualitative|quantitative/i.test([
    scene.shortTitle,
    scene.title,
    scene.chapterTitle,
    scene.narration,
  ].filter(Boolean).join(' '))
  const leftLabel = isEvaluation ? '정성' : keywords[0] || '개념'
  const rightLabel = isEvaluation ? '정량' : keywords[1] || '구조'

  return (
    <div className="fallback-visual">
      <div className="fallback-grid" />
      <div className="fallback-diagram">
        <div className="fallback-side left">
          <div className="fallback-symbol">?</div>
          <b>{leftLabel}</b>
          <span>{isEvaluation ? '사람이 맥락을 확인' : keywords[2] || '핵심을 해석'}</span>
        </div>
        <div className="fallback-bridge">
          <span />
          <b>+</b>
          <span />
        </div>
        <div className="fallback-side right">
          <div className="fallback-symbol">#</div>
          <b>{rightLabel}</b>
          <span>{isEvaluation ? '숫자로 성능을 측정' : keywords[3] || '근거를 비교'}</span>
        </div>
      </div>
    </div>
  )
}

export default function PlayerScreen({ scenes, audioBuffers, navigate, quiz = [], pack = null, initialSceneIndex = 0 }) {
  const safeInitialSceneIndex = Math.max(0, Math.min(Number(initialSceneIndex || 0), Math.max(scenes.length - 1, 0)))
  const [curScene, setCurScene] = useState(-1)
  const [showQuiz, setShowQuiz] = useState(false)
  const [showPauseIcon, setShowPauseIcon] = useState(false)
  const [progress, setProgress] = useState(scenes.map(() => 0))
  const [subtitles, setSubtitles] = useState(scenes.map(() => ''))
  const [swipeHint, setSwipeHint] = useState(false)
  const [dotState, setDotState] = useState(scenes.map(() => 'idle'))
  const [slideIdxs, setSlideIdxs] = useState(scenes.map(() => 0))
  const [playbackRate, setPlaybackRate] = useState(1)
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true)
  const [activeQuiz, setActiveQuiz] = useState(quiz)

  const curSceneRef = useRef(-1)
  const isPausedRef = useRef(false)
  const isTransRef = useRef(false)
  const waitSwipeRef = useRef(false)
  const curAudioRef = useRef(null)
  const playbackRateRef = useRef(1)
  const playIdRef = useRef(0)
  const progIvRef = useRef(null)
  const startTimeRef = useRef(0)
  const elapsedPauseRef = useRef(0)
  const sceneEls = useRef([])
  const touchStartRef = useRef(null)
  const scenesRef = useRef(scenes)
  const audioBuffersRef = useRef(audioBuffers)
  const showQuizRef = useRef(false)
  useEffect(() => { scenesRef.current = scenes }, [scenes])
  useEffect(() => { audioBuffersRef.current = audioBuffers }, [audioBuffers])
  useEffect(() => { showQuizRef.current = showQuiz }, [showQuiz])
  useEffect(() => { setActiveQuiz(quiz) }, [quiz])
  useEffect(() => {
    playbackRateRef.current = playbackRate
    if (curAudioRef.current) {
      curAudioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  function sceneSetPos(idx, pos, animated, axis = 'y') {
    const el = sceneEls.current[idx]
    if (!el) return
    const transform = axis === 'x' ? `translateX(${pos}%)` : `translateY(${pos}%)`
    if (!animated) {
      el.style.transition = 'none'
      el.style.transform = transform
      void el.offsetHeight
    } else {
      el.style.transition = 'transform 0.42s cubic-bezier(0.32,0.72,0,1)'
      el.style.transform = transform
    }
    el.style.pointerEvents = pos === 0 ? 'all' : 'none'
  }

  function stopAudio() {
    ++playIdRef.current
    if (curAudioRef.current) {
      curAudioRef.current.pause()
      curAudioRef.current.src = ''
      curAudioRef.current = null
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    clearInterval(progIvRef.current)
  }

  const setProgressAt = useCallback((idx, pct) => {
    setProgress(prev => { const n = [...prev]; n[idx] = pct; return n })
  }, [])

  const setSubtitleAt = useCallback((idx, text) => {
    setSubtitles(prev => { const n = [...prev]; n[idx] = text; return n })
  }, [])

  const setSlideIdxAt = useCallback((sceneIdx, slideIdx) => {
    setSlideIdxs(prev => {
      if (prev[sceneIdx] === slideIdx) return prev
      const n = [...prev]; n[sceneIdx] = slideIdx; return n
    })
  }, [])

  const updateSubtitle = useCallback((idx, elapsed, durationMs) => {
    const sc = scenesRef.current[idx]
    if (!sc) return
    const narration = sc.narration || sc.text || ''
    const chunks = getSubtitleChunks(narration)
    if (!chunks.length) return

    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0)
    const progress = Math.min(elapsed / durationMs, 0.9999)

    // Subtitle: character-count-weighted sync
    let cumulative = 0
    for (let i = 0; i < chunks.length; i++) {
      cumulative += chunks[i].length / totalChars
      if (progress < cumulative) { setSubtitleAt(idx, chunks[i]); break }
    }

    // Slide transition: switch when narrationMarker has been passed
    if (sc.slides && sc.slides.length > 1) {
      setSlideIdxAt(idx, getActiveSlideIdx(narration, sc.slides, progress))
    }
  }, [setSubtitleAt, setSlideIdxAt])

  const onSceneEnded = useCallback((idx) => {
    const sc = scenesRef.current
    const narration = sc[idx]?.narration || sc[idx]?.text || ''
    const chunks = getSubtitleChunks(narration)
    setSubtitleAt(idx, chunks[chunks.length - 1] || '')
    setProgressAt(idx, 100)
    if (idx < sc.length - 1) {
      waitSwipeRef.current = true
      setSwipeHint(true)
    } else {
      // 마지막 쇼츠 종료 → 리마인드 없이 바로 퀴즈
      setTimeout(() => setShowQuiz(true), 650)
    }
  }, [setProgressAt, setSubtitleAt])

  const playSceneAudio = useCallback((idx) => {
    const myPlayId = ++playIdRef.current
    const alive = () => playIdRef.current === myPlayId

    elapsedPauseRef.current = 0
    startTimeRef.current = Date.now()
    setSubtitleAt(idx, '')

    function startProgress(durationMs, audioEl) {
      clearInterval(progIvRef.current)
      progIvRef.current = setInterval(() => {
        if (!alive()) { clearInterval(progIvRef.current); return }
        if (isPausedRef.current) return
        const elapsed = audioEl
          ? audioEl.currentTime * 1000
          : Date.now() - startTimeRef.current + elapsedPauseRef.current
        setProgressAt(idx, Math.min((elapsed / durationMs) * 100, 99))
        updateSubtitle(idx, elapsed, durationMs)
      }, 80)
    }

    function fallback() {
      if (!alive()) return
      const text = scenesRef.current[idx]?.narration || scenesRef.current[idx]?.text || ''
      const rate = playbackRateRef.current || 1
      const duration = Math.max(text.length * 75, 3000) / rate
      startTimeRef.current = Date.now()
      startProgress(duration, null)
      if (window.speechSynthesis) {
        const utt = new SpeechSynthesisUtterance(text)
        utt.lang = 'ko-KR'; utt.rate = rate
        utt.onend = () => { if (alive()) { clearInterval(progIvRef.current); onSceneEnded(idx) } }
        window.speechSynthesis.speak(utt)
      } else {
        setTimeout(() => { if (alive()) { clearInterval(progIvRef.current); onSceneEnded(idx) } }, duration)
      }
    }

    const buf = audioBuffersRef.current[idx]
    if (buf) {
      const url = URL.createObjectURL(buf)
      const audio = new Audio(url)
      audio.playbackRate = playbackRateRef.current || 1
      curAudioRef.current = audio
      let fb = false
      const doFallback = () => { if (!fb && alive()) { fb = true; curAudioRef.current = null; fallback() } }
      audio.onloadedmetadata = () => {
        if (!alive()) return
        startTimeRef.current = Date.now()
        startProgress(audio.duration * 1000, audio)
      }
      audio.onended = () => {
        if (!alive()) return
        curAudioRef.current = null
        clearInterval(progIvRef.current)
        URL.revokeObjectURL(url)
        onSceneEnded(idx)
      }
      audio.onerror = doFallback
      audio.play().catch(doFallback)
    } else {
      fallback()
    }
  }, [setProgressAt, setSubtitleAt, updateSubtitle, onSceneEnded])

  const slideToScene = useCallback((idx, dir, axis = 'y') => {
    if (isTransRef.current) return
    isTransRef.current = true
    waitSwipeRef.current = false
    setSwipeHint(false)
    stopAudio()

    const prev = curSceneRef.current
    const fromPos = dir > 0 ? 105 : -105
    const toPos = dir > 0 ? -105 : 105

    setProgressAt(idx, 0)
    setSlideIdxs(p => { const n = [...p]; n[idx] = 0; return n })
    setDotState(scenesRef.current.map((_, i) =>
      i < idx ? 'done' : i === idx ? 'now' : 'idle'
    ))

    sceneSetPos(idx, fromPos, false, axis)
    if (prev >= 0 && prev !== idx) sceneSetPos(prev, 0, false, axis)

    requestAnimationFrame(() => {
      sceneSetPos(idx, 0, true, axis)
      if (prev >= 0 && prev !== idx) sceneSetPos(prev, toPos, true, axis)
      curSceneRef.current = idx
      setCurScene(idx)
      setTimeout(() => {
        isTransRef.current = false
        playSceneAudio(idx)
      }, 430)
    })
  }, [setProgressAt, playSceneAudio])

  // 좌우 화살표: 현재 쇼츠 안에서 delta초만큼 앞뒤 이동
  const seekBySeconds = useCallback((delta) => {
    const idx = curSceneRef.current
    if (idx < 0) return
    const audio = curAudioRef.current
    if (audio && audio.duration) {
      const next = Math.max(0, Math.min(audio.duration - 0.05, audio.currentTime + delta))
      audio.currentTime = next
      startTimeRef.current = Date.now() - (next * 1000) / (playbackRateRef.current || 1)
      elapsedPauseRef.current = 0
      setProgressAt(idx, (next / audio.duration) * 100)
      updateSubtitle(idx, next * 1000, audio.duration * 1000)
    } else {
      const text = scenesRef.current[idx]?.narration || scenesRef.current[idx]?.text || ''
      const rate = playbackRateRef.current || 1
      const durationMs = Math.max(text.length * 75, 3000) / rate
      const curElapsed = isPausedRef.current
        ? elapsedPauseRef.current
        : (Date.now() - startTimeRef.current + elapsedPauseRef.current)
      const nextElapsed = Math.max(0, Math.min(durationMs - 50, curElapsed + delta * 1000))
      startTimeRef.current = Date.now()
      elapsedPauseRef.current = nextElapsed
      setProgressAt(idx, (nextElapsed / durationMs) * 100)
      updateSubtitle(idx, nextElapsed, durationMs)
    }
  }, [setProgressAt, updateSubtitle])

  useEffect(() => {
    scenes.forEach((_, i) => sceneSetPos(i, 105, false))
    const t = setTimeout(() => slideToScene(safeInitialSceneIndex, 1), 350)
    return () => { clearTimeout(t); stopAudio() }
  }, []) // eslint-disable-line

  useEffect(() => {
    function onKey(e) {
      if (showQuizRef.current) return
      const cur = curSceneRef.current
      const total = scenesRef.current.length
      if (e.code === 'Space' || e.code === 'Tab') {
        e.preventDefault()
        if (isPausedRef.current) {
          isPausedRef.current = false
          startTimeRef.current = Date.now() - elapsedPauseRef.current
          if (curAudioRef.current) curAudioRef.current.play()
          if (window.speechSynthesis?.paused) window.speechSynthesis.resume()
        } else {
          isPausedRef.current = true
          elapsedPauseRef.current += Date.now() - startTimeRef.current
          if (curAudioRef.current) curAudioRef.current.pause()
          if (window.speechSynthesis?.speaking) window.speechSynthesis.pause()
          setShowPauseIcon(true)
          setTimeout(() => setShowPauseIcon(false), 600)
        }
        return
      }
      // 위/아래: 이전/다음 쇼츠
      if (e.code === 'ArrowDown') { e.preventDefault(); if (cur < total - 1) slideToScene(cur + 1, 1, 'y'); return }
      if (e.code === 'ArrowUp') { e.preventDefault(); if (cur > 0) slideToScene(cur - 1, -1, 'y'); return }
      // 좌/우: 현재 쇼츠 안에서 되감기/빨리감기
      if (e.code === 'ArrowRight') { e.preventDefault(); seekBySeconds(SEEK_STEP); return }
      if (e.code === 'ArrowLeft') { e.preventDefault(); seekBySeconds(-SEEK_STEP); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slideToScene, seekBySeconds])

  function onTouchStart(e) { touchStartRef.current = e.touches[0].clientY }
  function onTouchEnd(e) {
    if (!touchStartRef.current) return
    const dy = touchStartRef.current - e.changedTouches[0].clientY
    touchStartRef.current = null
    if (Math.abs(dy) < 40) return
    if (dy > 0 && curSceneRef.current < scenesRef.current.length - 1) slideToScene(curSceneRef.current + 1, 1)
    else if (dy < 0 && curSceneRef.current > 0) slideToScene(curSceneRef.current - 1, -1)
  }
  function onWheel(e) {
    if (isTransRef.current) return
    const cur = curSceneRef.current
    const total = scenesRef.current.length
    if (e.deltaY > 30 && cur < total - 1) slideToScene(cur + 1, 1)
    else if (e.deltaY < -30 && cur > 0) slideToScene(cur - 1, -1)
  }

  function seekTo(barEl, clientX) {
    const rect = barEl.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const idx = curSceneRef.current
    const audio = curAudioRef.current
    if (audio && audio.duration) {
      audio.currentTime = ratio * audio.duration
      startTimeRef.current = Date.now() - audio.currentTime * 1000
      elapsedPauseRef.current = 0
    } else {
      elapsedPauseRef.current = ratio * 10000
      startTimeRef.current = Date.now()
    }
    setProgressAt(idx, ratio * 100)
  }

  function onBarMouseDown(e, barEl) {
    e.preventDefault()
    seekTo(barEl, e.clientX)
    function onMove(ev) { seekTo(barEl, ev.clientX) }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function navigateFromPlayer(id) {
    stopAudio()
    navigate(id)
  }

  const activeSceneForHud = scenes[curScene] || scenes[safeInitialSceneIndex] || scenes[0] || {}
  const hudSectionTitle = activeSceneForHud.sectionTitle || activeSceneForHud.chapterTitle || activeSceneForHud.chapter || ''
  const hudShortTitle = activeSceneForHud.shortTitle || activeSceneForHud.title || ''
  // 퀴즈 중엔 좌상단 칩 숨김
  const chipPrimary = showQuiz ? '' : (hudSectionTitle || hudShortTitle)
  const chipSecondary = showQuiz || !hudSectionTitle ? '' : hudShortTitle
  const hasHudChip = Boolean(chipPrimary || chipSecondary)

  return (
    <div className="screen active player-wrap with-tabs"
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onWheel={onWheel}>
      {!showQuiz && (
        <div className="p-mobile-head">
          <div className="p-sb"><span className="sb-t">9:41</span><span className="sb-r">🔋</span></div>
          <div className="p-mobile-title-row">
            <button
              type="button"
              className="p-back"
              aria-label="뒤로 가기"
              onClick={() => navigateFromPlayer(pack?.sections?.length ? 'pack-toc' : 'home')}
            >
              ←
            </button>
            <div className="p-mobile-title">{pack?.title || scenes[0]?.chapterTitle || scenes[0]?.title || ''}</div>
          </div>
        </div>
      )}
      <div className={`pause-overlay${showPauseIcon ? ' show' : ''}`}>
        <span className="pause-ic-big">⏸</span>
      </div>
      <div className="p-hud">
        {hasHudChip && (
          <div className={`section-chip${chipSecondary ? '' : ' single'}`}>
            {chipPrimary && <span>{chipPrimary}</span>}
            {chipSecondary && <b>{chipSecondary}</b>}
          </div>
        )}
        {!showQuiz && (
          <div className="pdots">
            {scenes.map((_, i) => (
              <div key={i} className={`pdot${dotState[i] === 'now' ? ' now' : dotState[i] === 'done' ? ' done' : ''}`} />
            ))}
          </div>
        )}
      </div>

      {showQuiz && <QuizScreen quiz={activeQuiz} navigate={(id) => { setShowQuiz(false); navigate(id) }} />}

      {!showQuiz && (
        <div className="p-speed" role="group" aria-label="재생 속도">
          {PLAYBACK_RATES.map(rate => (
            <button
              key={rate}
              type="button"
              className={`p-speed-item${playbackRate === rate ? ' on' : ''}`}
              onClick={() => setPlaybackRate(rate)}
              aria-pressed={playbackRate === rate}
            >
              {rate === 1 ? '1x' : `${rate}x`}
            </button>
          ))}
        </div>
      )}

      {!showQuiz && (
        <button
          type="button"
          className={`p-cc${subtitlesEnabled ? ' on' : ''}`}
          onClick={() => setSubtitlesEnabled(value => !value)}
          aria-label={subtitlesEnabled ? '자막 끄기' : '자막 켜기'}
          title={subtitlesEnabled ? '자막 끄기' : '자막 켜기'}
        >
          CC
        </button>
      )}

      {scenes.map((scene, i) => {
        const slides = scene.slides || []
        const slide = slides[slideIdxs[i]] ?? null
        const activeImageUrl = slide?.imageUrl || findPreviousSlideImage(slides, slideIdxs[i])
        const visualKey = activeImageUrl
          ? `img-${activeImageUrl.length}-${activeImageUrl.slice(-32)}`
          : `fallback-${i}-${slideIdxs[i]}`

        return (
          <div
            key={i}
            className="pscene"
            ref={el => { sceneEls.current[i] = el }}
            style={{ transform: 'translateY(105%)', pointerEvents: 'none' }}
          >
            {/* 배경: 이미지가 있으면 같은 이미지의 흐릿한 확대본으로 여백을 채움, 없으면 그라디언트 */}
            {activeImageUrl ? (
              <div className="pbg">
                <img src={activeImageUrl} alt="" className="pbg-img" />
              </div>
            ) : (
              <div className="pbg" style={{ background: SCENE_BG[i % SCENE_BG.length] }} />
            )}

            {/* 슬라이드 이미지 + 어노테이션 */}
            <div className={`pvis${activeImageUrl ? ' has-image' : ' no-image'}`}>
              {activeImageUrl ? (
                <div key={visualKey} className="slide-wrap">
                  <img
                    src={activeImageUrl}
                    alt=""
                    className="slide-img"
                  />
                </div>
              ) : (
                <FallbackVisual scene={scene} slide={slide} />
              )}
            </div>

            {/* 자막 */}
            {subtitlesEnabled && (
              <div className="subt">
                <div className="subt-pill">
                  <div className="subt-text">{subtitles[i]}</div>
                </div>
              </div>
            )}

            {/* 스와이프 힌트 */}
            <div className={`swipe-hint${swipeHint && curScene === i ? ' show' : ''}`}>
              <span className="sh-arrow">↑</span>
              <span className="sh-txt">스크롤하여 다음</span>
            </div>

            {/* 진행 바 */}
            <div
              className="pbar"
              style={{ cursor: 'pointer' }}
              onMouseDown={e => onBarMouseDown(e, e.currentTarget)}
            >
              <div className="pfill" style={{ width: `${progress[i]}%` }} />
            </div>
          </div>
        )
      })}

      <div className="player-tabs">
        <TabBar active="" navigate={navigateFromPlayer} />
      </div>
    </div>
  )
}
