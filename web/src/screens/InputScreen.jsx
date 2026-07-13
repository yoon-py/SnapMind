import { useState, useRef, useCallback } from 'react'


const FORMATS = [
  { id: 'shorts', icon: '🎬', name: '쇼츠', desc: 'TTS + 이미지' },
  { id: 'cards', icon: '🃏', name: '카드', desc: '단계별 학습' },
  { id: 'deck', icon: '📊', name: '덱', desc: '슬라이드' },
]

export default function InputScreen({ navigate, inputText, setInputText, benchmarkFile, setBenchmarkFile }) {
  const [format, setFormat] = useState('shorts')
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const fileRef = useRef(null)

  function handleMake() {
    if (!inputText.trim()) return
    if (format === 'cards') {
      navigate('card-gen')
      return
    }
    if (format === 'deck') {
      alert('웹 덱 생성은 다음 단계에서 연결할게요. 지금은 쇼츠 또는 카드형을 선택해 주세요.')
      return
    }
    navigate('gen')
  }

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadErr('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/extract-text', { method: 'POST', body: form })
      const raw = await res.text()
      const data = raw ? JSON.parse(raw) : {}
      if (!res.ok) throw new Error(data.error || `추출 실패 (${res.status})`)
      if (!data.text) throw new Error('파일에서 읽을 수 있는 텍스트를 찾지 못했어요')
      setInputText(data.text)
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setBenchmarkFile?.(file)
      } else {
        setBenchmarkFile?.(null)
      }
    } catch (err) {
      const message = err instanceof SyntaxError
        ? '서버 응답을 읽지 못했어요. 백엔드가 실행 중인지 확인해 주세요.'
        : err.message
      setUploadErr(message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }, [setInputText])

  return (
    <div className="screen active" id="input">
      <div className="sb"><span className="sb-t">9:42</span><span className="sb-r">●●● 🔋</span></div>
      <div className="i-scroll">
        <button className="bk" onClick={() => navigate('home')}>← 뒤로</button>
        <div className="i-ttl">학습팩 만들기</div>
        <div className="i-sub">학습 자료를 붙여넣거나 파일을 올려주세요</div>

        <div className="fl">원문 텍스트</div>
        <textarea
          className="ta"
          placeholder="원문 텍스트를 여기에 붙여넣어 주세요"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          rows={6}
        />

        <div className="ur">
          <div className="ub" onClick={() => !uploading && fileRef.current?.click()}>
            <div className="ue">{uploading ? '⏳' : '📎'}</div>
            {uploading ? '읽는 중...' : '파일 업로드'}
            <span style={{ fontSize: 10, color: 'var(--ink-s)' }}>PDF, DOCX, HWP, TXT</span>
          </div>
          <div className="ub">
            <div className="ue">📷</div>
            사진 촬영
            <span style={{ fontSize: 10, color: 'var(--ink-s)' }}>교재, 노트</span>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.hwp,.hwpx,.pptx,.xlsx,.txt,.md" style={{ display: 'none' }} onChange={handleFile} />
        {uploadErr && <div style={{ fontSize: 12, color: '#f44336', marginBottom: 12 }}>⚠️ {uploadErr}</div>}

        <div className="fl">결과 형식</div>
        <div className="fr">
          {FORMATS.map(f => (
            <div
              key={f.id}
              className={`fb${format === f.id ? ' on' : ''}`}
              onClick={() => setFormat(f.id)}
            >
              <span className="fe">{f.icon}</span>
              <div className="fn">{f.name}</div>
              <div className="fd">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <button className="gbtn" onClick={handleMake}>
        ✨ AI로 {format === 'cards' ? '카드팩' : format === 'deck' ? '덱' : '쇼츠'} 생성하기
      </button>
    </div>
  )
}
