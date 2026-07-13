import TabBar from '../components/TabBar'
import SwipeDeletePackCard from '../components/SwipeDeletePackCard'

function packMeta(pack) {
  if (pack.format === 'cards') {
    const cardCount = (pack.ideas || []).reduce((sum, idea) => sum + (idea.lessonCards?.length || 0), 0)
    return `${pack.ideas?.length || 0}개 개념 · ${cardCount}장 카드`
  }
  if (pack.sections?.length) {
    const detail = (pack.sections || []).reduce((sum, section) => sum + (section.children?.length || 1), 0)
    return `${pack.sections.length}개 대단원 · ${detail}개 목차 · ${pack.scenes?.length || 0}개 쇼츠`
  }
  return `${pack.scenes?.length || 0}개 쇼츠 · 저장됨`
}

export default function HomeScreen({
  navigate,
  cachedScenes,
  generatedPacks = [],
  openGeneratedPack,
  deleteGeneratedPack,
  renameGeneratedPack,
}) {
  const hasPacks = generatedPacks.length > 0

  return (
    <div className="screen active" id="home">
      <div className="sb"><span className="sb-t">9:41</span><span className="sb-r">●●● 🔋</span></div>
      <div className="h-scroll">
        <div className="h-top">
          <div className="logo">Snap<b>Mind</b></div>
          <div className="av">Y</div>
        </div>
        <div className="hero" onClick={() => navigate('input')}>
          <div className="h-chip">AI · 학습팩</div>
          <div className="h-ttl">자료를 올리면<br/>학습팩으로 바꿔줘요</div>
          <div className="h-sub">쇼츠, 카드형, 덱까지 한 곳에서</div>
          <button className="h-btn">✨ 지금 만들기 →</button>
        </div>
        <div className="sl">최근 생성 팩</div>
        <div className="pl">
          {hasPacks ? (
            generatedPacks.map((pack, i) => (
              <SwipeDeletePackCard
                key={pack.id}
                icon={pack.format === 'cards' ? '🃏' : i === 0 ? '✨' : '🎬'}
                title={pack.title || pack.scenes?.[0]?.title || '생성된 팩'}
                meta={packMeta(pack)}
                onOpen={() => openGeneratedPack(pack.id)}
                onDelete={() => deleteGeneratedPack?.(pack.id)}
                onRename={(title) => renameGeneratedPack?.(pack.id, title)}
              />
            ))
          ) : cachedScenes ? (
            <div className="pc" onClick={() => navigate('player-direct')}>
              <div className="pi" style={{ background: 'rgba(212,164,0,0.1)' }}>🌿</div>
              <div className="pn">
                <div className="pt">{cachedScenes[0]?.title || '생성된 쇼츠'}</div>
                <div className="pm">{cachedScenes.length}개 쇼츠 · 방금 생성</div>
              </div>
              <div className="pb bs">SHORTS</div>
            </div>
          ) : (
            <div className="home-empty-pack">
              <div className="home-empty-title">아직 생성된 팩이 없어요</div>
              <div className="home-empty-sub">학습자료를 올려 첫 쇼츠 팩을 만들어보세요</div>
            </div>
          )}
        </div>
      </div>
      <TabBar active="home" navigate={navigate} />
    </div>
  )
}
