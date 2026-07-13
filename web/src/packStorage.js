const DB_NAME = 'snapmind-web-packs'
const DB_VERSION = 1
const STORE_NAME = 'packs'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, action) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    const request = action(store)
    let result

    request.onsuccess = () => {
      result = request.result
    }
    request.onerror = () => {
      db.close()
      reject(request.error)
    }
    tx.oncomplete = () => {
      db.close()
      resolve(result)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function loadGeneratedPacks() {
  const packs = await withStore('readonly', store => store.getAll())
  return packs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

export async function saveGeneratedPack(pack) {
  await withStore('readwrite', store => store.put(pack))
}

export async function deleteGeneratedPack(packId) {
  await withStore('readwrite', store => store.delete(packId))
}

async function deleteGeneratedPacks(packIds) {
  if (!packIds.length) return
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    packIds.forEach(packId => store.delete(packId))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return null
  const meta = dataUrl.slice(5, commaIndex)
  const mimeType = meta.split(';')[0] || 'application/octet-stream'
  const base64 = dataUrl.slice(commaIndex + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

function hydrateImportedPack(pack) {
  return {
    ...pack,
    audioBuffers: (pack.audioBuffers || []).map(audio => {
      if (audio instanceof Blob || audio === null) return audio
      if (audio?.dataUrl) return dataUrlToBlob(audio.dataUrl)
      return null
    }),
    sections: (pack.sections || []).map(section => ({
      ...section,
      shortIds: [...(section.shortIds || [])],
      children: (section.children || []).map(child => ({
        ...child,
        shortIds: [...(child.shortIds || [])],
      })),
    })),
    scenes: (pack.scenes || []).map(scene => ({
      ...scene,
      slides: (scene.slides || []).map(slide => ({ ...slide })),
    })),
  }
}

export async function importBenchmarkPacks() {
  let response
  try {
    response = await fetch(`/benchmark-packs.json?ts=${Date.now()}`, { cache: 'no-store' })
  } catch (_) {
    return []
  }
  if (!response.ok) return []

  const data = await response.json().catch(() => null)
  const packs = Array.isArray(data?.packs) ? data.packs.map(hydrateImportedPack) : []
  if (!packs.length) return []

  const existing = await loadGeneratedPacks()
  const existingKeys = new Set(existing.map(pack => `${pack.title || ''}:${pack.benchmark?.extractionMode || ''}`))
  const replaceExisting = Boolean(data?.replaceExisting)
  const imported = []

  for (const pack of packs) {
    const key = `${pack.title || ''}:${pack.benchmark?.extractionMode || ''}`
    if (existingKeys.has(key)) {
      if (!replaceExisting) continue
      const matchingIds = existing
        .filter(existingPack => `${existingPack.title || ''}:${existingPack.benchmark?.extractionMode || ''}` === key)
        .map(existingPack => existingPack.id)
      await deleteGeneratedPacks(matchingIds)
      existingKeys.delete(key)
    }
    await saveGeneratedPack(pack)
    imported.push(pack)
    existingKeys.add(key)
  }

  return imported
}
