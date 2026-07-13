import { useEffect, useState } from 'react'
import { DEFAULT_SCENES, DEFAULT_INPUT_TEXT, getModelComboLabel, withModelComboTitle } from './api'
import HomeScreen from './screens/HomeScreen'
import InputScreen from './screens/InputScreen'
import GenScreen from './screens/GenScreen'
import CardGenScreen from './screens/CardGenScreen'
import BenchmarkGenScreen from './screens/BenchmarkGenScreen'
import PlayerScreen from './screens/PlayerScreen'
import CardPlayerScreen from './screens/CardPlayerScreen'
import PacksScreen from './screens/PacksScreen'
import ProfileScreen from './screens/ProfileScreen'
import { deleteGeneratedPack as deleteStoredPack, importBenchmarkPacks, loadGeneratedPacks, saveGeneratedPack } from './packStorage'

function cloneScenes(scenes) {
  return scenes.map(scene => ({
    ...scene,
    slides: (scene.slides || []).map(slide => ({ ...slide })),
  }))
}

// Group flat generated scenes into a 대단원→소단원 (section→children) outline,
// and stamp each scene with the ids the player chip + TOC navigation expect.
function buildSectionsFromScenes(scenes) {
  const byChapter = new Map()
  scenes.forEach((scene, i) => {
    const chapterTitle = scene.chapterTitle || scene.sectionTitle || '학습 주제'
    const chapterNumber = scene.chapterNumber || ''
    const key = `${chapterNumber} ${chapterTitle}`.trim()
    if (!byChapter.has(key)) {
      const idx = byChapter.size
      byChapter.set(key, {
        id: `sec-${idx + 1}`,
        number: chapterNumber || String(idx + 1).padStart(2, '0'),
        title: chapterTitle,
        displayTitle: key || chapterTitle,
        summary: '',
        shortIds: [],
        children: [],
      })
    }
    const chapter = byChapter.get(key)
    const sceneId = scene.id || `scene-${i + 1}`
    const childId = `${chapter.id}-${chapter.children.length + 1}`
    const childTitle = scene.subsectionTitle || scene.title || chapterTitle
    chapter.children.push({
      id: childId,
      number: scene.sectionNumber || '',
      title: childTitle,
      displayTitle: scene.subsectionDisplay || childTitle,
      summary: '',
      shortIds: [sceneId],
    })
    chapter.shortIds.push(sceneId)
    scene.id = sceneId
    scene.chapterId = chapter.id
    scene.sectionId = childId
    scene.chapterTitle = chapterTitle
    if (!scene.sectionTitle) scene.sectionTitle = chapterTitle
    if (!scene.shortTitle) scene.shortTitle = scene.subsectionDisplay || childTitle
  })
  return [...byChapter.values()]
}

function createPackFromGeneration(scenes, audioBuffers, quiz, modelComboLabel) {
  const createdAt = new Date().toISOString()
  const clonedScenes = cloneScenes(scenes)
  const sections = buildSectionsFromScenes(clonedScenes)
  return {
    id: `pack-${Date.now()}`,
    format: 'shorts',
    title: sections[0]?.title || scenes[0]?.sectionTitle || scenes[0]?.title || '생성된 쇼츠',
    modelComboLabel,
    createdAt,
    scenes: clonedScenes,
    audioBuffers: [...audioBuffers],
    quiz: [...quiz],
    sections,
  }
}

export default function App() {
  const [screen, setScreen] = useState('home')
  const [inputText, setInputText] = useState(DEFAULT_INPUT_TEXT)
  const [scenes, setScenes] = useState(DEFAULT_SCENES)
  const [audioBuffers, setAudioBuffers] = useState([null, null, null])
  const [cachedScenes, setCachedScenes] = useState(null)
  const [cachedAudioBuffers, setCachedAudioBuffers] = useState(null)
  const [cachedQuiz, setCachedQuiz] = useState([])
  const [generatedPacks, setGeneratedPacks] = useState([])
  const [activePackId, setActivePackId] = useState(null)
  const [activePack, setActivePack] = useState(null)
  const [initialSceneIndex, setInitialSceneIndex] = useState(0)
  const [benchmarkFile, setBenchmarkFile] = useState(null)
  const [quiz, setQuiz] = useState([])

  useEffect(() => {
    let alive = true
    importBenchmarkPacks()
      .catch(error => {
        console.warn('벤치마크 팩 가져오기 실패:', error?.message || error)
        return []
      })
      .then(() => loadGeneratedPacks())
      .then(packs => {
        if (!alive) return
        setGeneratedPacks(packs)
        const latest = packs[0]
        if (latest) {
          setCachedScenes(cloneScenes(latest.scenes || []))
          setCachedAudioBuffers([...(latest.audioBuffers || [])])
          setCachedQuiz(latest.quiz || [])
          setActivePackId(latest.id)
          setActivePack(latest)
        }
      })
      .catch(error => console.warn('저장된 팩 불러오기 실패:', error?.message || error))

    return () => { alive = false }
  }, [])

  useEffect(() => {
    window.__SNAPMIND_GENERATED_PACKS__ = generatedPacks
  }, [generatedPacks])

  useEffect(() => {
    window.__SNAPMIND_CURRENT_PACK__ = activePack?.format === 'cards'
      ? activePack
      : {
          id: `current-${Date.now()}`,
          title: scenes[0]?.title || cachedScenes?.[0]?.title || '생성된 쇼츠',
          createdAt: new Date().toISOString(),
          scenes: cloneScenes(cachedScenes || scenes),
          audioBuffers: [...(cachedAudioBuffers || audioBuffers)],
          quiz: [...(cachedQuiz?.length ? cachedQuiz : quiz)],
          sections: activePack?.sections || [],
        }
  }, [scenes, audioBuffers, quiz, cachedScenes, cachedAudioBuffers, cachedQuiz, activePack])

  function navigate(id) {
    if (id === 'player-direct') {
      if (activePack?.format === 'cards') {
        setScreen('card-player')
        return
      }
      if (cachedScenes) {
        setScenes(cachedScenes.map(s => ({ ...s })))
        setAudioBuffers(cachedAudioBuffers ? [...cachedAudioBuffers] : [null, null, null])
        setQuiz(cachedQuiz)
      }
      setScreen('player')
      return
    }
    setScreen(id)
  }

  function openGeneratedPack(packId) {
    const pack = generatedPacks.find(p => p.id === packId)
    if (!pack) return
    if (pack.format === 'cards') {
      setActivePack(pack)
      setActivePackId(pack.id)
      setScreen('card-player')
      return
    }
    if (pack.sections?.length) {
      setActivePack(pack)
      setActivePackId(pack.id)
      setScreen('pack-toc')
      return
    }
    openGeneratedPackAt(packId, 0)
  }

  function openGeneratedPackAt(packId, sceneIndex = 0) {
    const pack = generatedPacks.find(p => p.id === packId)
    if (!pack) return
    if (pack.format === 'cards') {
      setActivePack(pack)
      setActivePackId(pack.id)
      setScreen('card-player')
      return
    }
    setScenes(cloneScenes(pack.scenes || []))
    setAudioBuffers([...(pack.audioBuffers || [])])
    setQuiz(pack.quiz || [])
    setCachedScenes(cloneScenes(pack.scenes || []))
    setCachedAudioBuffers([...(pack.audioBuffers || [])])
    setCachedQuiz(pack.quiz || [])
    setActivePackId(pack.id)
    setActivePack(pack)
    setInitialSceneIndex(sceneIndex)
    setScreen('player')
  }

  function resetCurrentPack() {
    setScenes(DEFAULT_SCENES)
    setAudioBuffers([null, null, null])
    setQuiz([])
    setCachedScenes(null)
    setCachedAudioBuffers(null)
    setCachedQuiz([])
    setActivePackId(null)
    setActivePack(null)
    setInitialSceneIndex(0)
  }

  function setCurrentPack(pack) {
    if (pack?.format === 'cards') {
      setActivePack(pack)
      setActivePackId(pack.id)
      setInitialSceneIndex(0)
      return
    }
    setScenes(cloneScenes(pack.scenes || []))
    setAudioBuffers([...(pack.audioBuffers || [])])
    setQuiz(pack.quiz || [])
    setCachedScenes(cloneScenes(pack.scenes || []))
    setCachedAudioBuffers([...(pack.audioBuffers || [])])
    setCachedQuiz(pack.quiz || [])
    setActivePackId(pack.id)
    setActivePack(pack)
    setInitialSceneIndex(0)
  }

  function deleteGeneratedPack(packId) {
    const nextPacks = generatedPacks.filter(pack => pack.id !== packId)
    setGeneratedPacks(nextPacks)

    if (activePackId === packId) {
      const replacement = nextPacks[0]
      if (replacement) {
        setCurrentPack(replacement)
      } else {
        resetCurrentPack()
      }
    }

    deleteStoredPack(packId).catch(error => {
      console.warn('팩 삭제 실패:', error?.message || error)
    })
  }

  function renameGeneratedPack(packId, title) {
    const cleanTitle = String(title || '').trim()
    if (!cleanTitle) return

    setGeneratedPacks(current => {
      const next = current.map(pack => (
        pack.id === packId ? { ...pack, title: cleanTitle } : pack
      ))
      const renamedPack = next.find(pack => pack.id === packId)
      if (renamedPack) {
        saveGeneratedPack(renamedPack).catch(error => {
          console.warn('팩 이름 저장 실패:', error?.message || error)
        })
      }
      return next
    })

    if (activePackId === packId) {
      const pack = generatedPacks.find(item => item.id === packId)
      if (pack) {
        setCurrentPack({ ...pack, title: cleanTitle })
      }
    }
  }

  async function onGenComplete(newScenes, newAudioBuffers, newQuiz = []) {
    setScenes(newScenes)
    setAudioBuffers(newAudioBuffers)
    setQuiz(newQuiz)
    setCachedScenes(newScenes.map(s => ({ ...s })))
    setCachedAudioBuffers([...newAudioBuffers])
    setCachedQuiz(newQuiz)
    const modelComboLabel = await getModelComboLabel()
    const pack = createPackFromGeneration(newScenes, newAudioBuffers, newQuiz, modelComboLabel)
    setActivePack(pack)
    setGeneratedPacks(current => [pack, ...current])
    setActivePackId(pack.id)
    saveGeneratedPack(pack).catch(error => {
      console.warn('팩 저장 실패:', error?.message || error)
    })
    // 생성 직후 바로 재생하지 않고 학습 목차부터 보여준다
    setScreen(pack.sections?.length ? 'pack-toc' : 'player')
  }

  function onCardGenComplete(pack) {
    const fallbackComboLabel = pack.modelComboLabel || ''
    const nextPack = {
      ...pack,
      format: 'cards',
      title: withModelComboTitle(pack.title || '카드 학습팩', fallbackComboLabel),
      modelComboLabel: fallbackComboLabel,
      createdAt: pack.createdAt || new Date().toISOString(),
    }
    setActivePack(nextPack)
    setActivePackId(nextPack.id)
    setGeneratedPacks(current => [nextPack, ...current])
    saveGeneratedPack(nextPack).catch(error => {
      console.warn('카드팩 저장 실패:', error?.message || error)
    })
    setScreen('card-player')
  }

  function onBenchmarkComplete(packs) {
    if (!packs?.length) return
    const nextPacks = [...packs].reverse()
    const incomingKeys = new Set(nextPacks.map(pack => `${pack.title || ''}:${pack.benchmark?.extractionMode || ''}`))
    setGeneratedPacks(current => {
      const replaced = current.filter(pack => !incomingKeys.has(`${pack.title || ''}:${pack.benchmark?.extractionMode || ''}`))
      current
        .filter(pack => incomingKeys.has(`${pack.title || ''}:${pack.benchmark?.extractionMode || ''}`))
        .forEach(pack => {
          deleteStoredPack(pack.id).catch(error => {
            console.warn('기존 벤치마크 팩 삭제 실패:', error?.message || error)
          })
        })
      return [...nextPacks, ...replaced]
    })
    nextPacks.forEach(pack => {
      saveGeneratedPack(pack).catch(error => {
        console.warn('벤치마크 팩 저장 실패:', error?.message || error)
      })
    })
    const firstPack = nextPacks[0]
    setActivePack(firstPack)
    setActivePackId(firstPack.id)
    setCachedScenes(cloneScenes(firstPack.scenes || []))
    setCachedAudioBuffers([...(firstPack.audioBuffers || [])])
    setCachedQuiz(firstPack.quiz || [])
    setScreen('packs')
  }

  const commonTabProps = {
    navigate,
    cachedScenes,
    generatedPackCount: generatedPacks.length,
    generatedPacks,
    openGeneratedPack,
    deleteGeneratedPack,
    renameGeneratedPack,
  }

  return (
    <div className="phone">
      <div className="island" />
      {screen === 'home' && (
        <HomeScreen
          navigate={navigate}
          cachedScenes={cachedScenes}
          generatedPacks={generatedPacks}
          openGeneratedPack={openGeneratedPack}
          deleteGeneratedPack={deleteGeneratedPack}
          renameGeneratedPack={renameGeneratedPack}
        />
      )}
      {screen === 'input' && (
        <InputScreen
          navigate={navigate}
          inputText={inputText}
          setInputText={setInputText}
          benchmarkFile={benchmarkFile}
          setBenchmarkFile={setBenchmarkFile}
        />
      )}
      {screen === 'gen' && (
        <GenScreen
          navigate={navigate}
          inputText={inputText}
          onComplete={onGenComplete}
        />
      )}
      {screen === 'card-gen' && (
        <CardGenScreen
          navigate={navigate}
          inputText={inputText}
          onComplete={onCardGenComplete}
        />
      )}
      {screen === 'benchmark-gen' && (
        <BenchmarkGenScreen
          navigate={navigate}
          benchmarkFile={benchmarkFile}
          onComplete={onBenchmarkComplete}
        />
      )}
      {screen === 'pack-toc' && activePack && (
        <PacksScreen
          {...commonTabProps}
          mode="toc"
          activePack={activePack}
          openPackSection={(sectionId) => {
            const index = (activePack.scenes || []).findIndex(scene => (
              scene.sectionId === sectionId ||
              scene.chapterId === sectionId
            ))
            openGeneratedPackAt(activePack.id, Math.max(0, index))
          }}
        />
      )}
      {screen === 'player' && (
        <PlayerScreen
          navigate={navigate}
          scenes={scenes}
          audioBuffers={audioBuffers}
          quiz={quiz}
          pack={activePack}
          initialSceneIndex={initialSceneIndex}
        />
      )}
      {screen === 'card-player' && activePack && (
        <CardPlayerScreen
          navigate={navigate}
          pack={activePack}
        />
      )}
      {screen === 'packs' && (
        <PacksScreen {...commonTabProps} />
      )}
      {screen === 'profile' && (
        <ProfileScreen {...commonTabProps} />
      )}
    </div>
  )
}
