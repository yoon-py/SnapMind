import TabBar from '../components/TabBar'
import SwipeDeletePackCard from '../components/SwipeDeletePackCard'

function formatPackDate(createdAt) {
  if (!createdAt) return '저장됨'
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '저장됨'
  return `${date.getMonth() + 1}/${date.getDate()} 생성`
}

export default function PacksScreen({
  navigate,
  cachedScenes,
  generatedPacks = [],
  openGeneratedPack,
  deleteGeneratedPack,
  renameGeneratedPack,
  mode = 'list',
  activePack = null,
  openPackSection,
}) {
  function getPackMeta(pack) {
    if (pack.format === 'cards') {
      const cardCount = (pack.ideas || []).reduce((sum, idea) => sum + (idea.lessonCards?.length || 0), 0)
      return `${pack.ideas?.length || 0}개 개념 · ${cardCount}장 카드 · ${formatPackDate(pack.createdAt)}`
    }
    return pack.sections?.length
      ? `${pack.sections.length}개 대단원 · ${(pack.sections || []).reduce((sum, section) => sum + (section.children?.length || 1), 0)}개 목차 · ${pack.scenes?.length || 0}개 쇼츠 · ${formatPackDate(pack.createdAt)}`
      : `${pack.scenes?.length || 0}개 쇼츠 · ${formatPackDate(pack.createdAt)}`
  }

  if (mode === 'toc' && activePack) {
    const sections = activePack.sections || []
    const detailCount = sections.reduce((sum, section) => sum + (section.children?.length || 1), 0)
    return (
      <div className="screen active" id="pack-toc">
        <div className="sb"><span className="sb-t">9:41</span><span className="sb-r">●●● 🔋</span></div>
        <div className="toc-scroll">
          <button className="bk" onClick={() => navigate('packs')}>← 팩 목록</button>
          <div className="toc-kicker">학습 목차</div>
          <div className="toc-title">{activePack.title || '생성된 쇼츠 팩'}</div>
          <div className="toc-sub">{activePack.scenes?.length || 0}개 쇼츠 · {sections.length}개 대단원 · {detailCount}개 세부 목차</div>
          <div className="toc-list">
            {sections.map((section, index) => {
              const children = section.children || []
              if (!children.length) {
                return (
                  <button
                    key={section.id}
                    type="button"
                    className="toc-item"
                    onClick={() => openPackSection?.(section.id)}
                  >
                    <div className="toc-num">{section.number || String(index + 1).padStart(2, '0')}</div>
                    <div className="toc-body">
                      <div className="toc-item-title">{section.displayTitle || section.title}</div>
                      <div className="toc-item-summary">{section.summary || `${section.shortIds?.length || 0}개 쇼츠`}</div>
                    </div>
                    <div className="toc-count">{section.shortIds?.length || 0}</div>
                  </button>
                )
              }

              return (
                <div key={section.id} className="toc-group">
                  <div className="toc-group-head">
                    <div className="toc-num major">{section.number || String(index + 1).padStart(2, '0')}</div>
                    <div className="toc-body">
                      <div className="toc-group-title">{section.title}</div>
                      <div className="toc-item-summary">{children.length}개 세부 목차 · {section.shortIds?.length || 0}개 쇼츠</div>
                    </div>
                  </div>
                  <div className="toc-children">
                    {children.map(child => (
                      <button
                        key={child.id}
                        type="button"
                        className="toc-child"
                        onClick={() => openPackSection?.(child.id)}
                      >
                        <div className="toc-child-num">{child.number || '•'}</div>
                        <div className="toc-body">
                          <div className="toc-item-title">{child.title}</div>
                          <div className="toc-item-summary">{child.summary || `${child.shortIds?.length || 0}개 쇼츠`}</div>
                        </div>
                        <div className="toc-count">{child.shortIds?.length || 0}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <TabBar active="packs" navigate={navigate} />
      </div>
    )
  }

  const hasStoredPacks = generatedPacks.length > 0
  const hasGenerated = !hasStoredPacks && cachedScenes && cachedScenes.length > 0

  return (
    <div className="screen active" id="packs">
      <div className="sb"><span className="sb-t">9:41</span><span className="sb-r">●●● 🔋</span></div>
      <div className="pk-scroll">
        <div className="pk-hdr">내 팩</div>
        <div className="pk-sub">생성된 학습 쇼츠 팩 목록</div>

        {hasStoredPacks && (
          <>
            <div className="sl">저장된 생성 팩</div>
            <div className="pl" style={{ marginBottom: 20 }}>
              {generatedPacks.map((pack, index) => (
                <SwipeDeletePackCard
                  key={pack.id}
                  icon={pack.format === 'cards' ? '🃏' : index === 0 ? '✨' : '🎬'}
                  title={pack.title || pack.scenes?.[0]?.title || '생성된 팩'}
                  meta={getPackMeta(pack)}
                  onOpen={() => openGeneratedPack(pack.id)}
                  onDelete={() => deleteGeneratedPack?.(pack.id)}
                  onRename={(title) => renameGeneratedPack?.(pack.id, title)}
                />
              ))}
            </div>
          </>
        )}

        {hasGenerated && (
          <>
            <div className="sl">최근 생성</div>
            <div className="pl" style={{ marginBottom: 20 }}>
              <div className="pc" onClick={() => navigate('player-direct')}>
                <div className="pi" style={{ background: 'rgba(212,164,0,0.1)' }}>✨</div>
                <div className="pn">
                  <div className="pt">{cachedScenes[0].title || '생성된 쇼츠'}</div>
                  <div className="pm">{cachedScenes.length}개 쇼츠 · 방금 생성</div>
                </div>
                <div className="pb bs">SHORTS</div>
              </div>
            </div>
          </>
        )}
        {!hasStoredPacks && !hasGenerated && (
          <div className="empty-pack">
            <div className="empty-pack-icon">📚</div>
            <div className="empty-pack-title">아직 생성된 팩이 없어요</div>
            <button className="empty-pack-btn" type="button" onClick={() => navigate('input')}>새 쇼츠 만들기</button>
          </div>
        )}
        <div style={{ height: 20 }} />
      </div>
      <TabBar active="packs" navigate={navigate} />
    </div>
  )
}
