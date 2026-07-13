import TabBar from '../components/TabBar'

export default function ProfileScreen({ navigate, generatedPackCount }) {
  return (
    <div className="screen active" id="profile">
      <div className="sb"><span className="sb-t">9:41</span><span className="sb-r">●●● 🔋</span></div>
      <div className="prf-scroll">
        <div className="prf-hero">
          <div className="prf-av">Y</div>
          <div className="prf-name">윤환</div>
          <div className="prf-email">yoonpub0@gmail.com</div>
          <div className="prf-badge">🔥 7일 연속 학습 중</div>
        </div>
        <div className="stat-row">
          <div className="stat-box">
            <div className="stat-n">{generatedPackCount}</div>
            <div className="stat-l">생성된 팩</div>
          </div>
          <div className="stat-box">
            <div className="stat-n">12</div>
            <div className="stat-l">완료한 쇼츠</div>
          </div>
          <div className="stat-box">
            <div className="stat-n">7</div>
            <div className="stat-l">학습 스트릭</div>
          </div>
        </div>
        <div className="prf-sec">학습 설정</div>
        <div className="prf-list">
          <div className="prf-item">
            <span>🎙 TTS 음성</span>
            <span className="prf-item-r">Cedar (기본)</span>
          </div>
          <div className="prf-item">
            <span>🎯 학습 목표</span>
            <span className="prf-item-r">하루 5분</span>
          </div>
          <div className="prf-item">
            <span>📝 쇼츠 길이</span>
            <span className="prf-item-r">30초</span>
          </div>
        </div>
        <div className="prf-sec">앱 설정</div>
        <div className="prf-list">
          <div className="prf-item">
            <span>🔔 알림</span>
            <span className="prf-item-r">켜짐</span>
          </div>
          <div className="prf-item">
            <span>🌙 다크 모드</span>
            <span className="prf-item-r">시스템 따름</span>
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>
      <TabBar active="profile" navigate={navigate} />
    </div>
  )
}
