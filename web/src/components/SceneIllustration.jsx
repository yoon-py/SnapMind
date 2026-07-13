export default function SceneIllustration({ index }) {
  const i = index % 4

  // Scene 0: 광합성 개요 — 태양빛 → 잎 → 포도당
  if (i === 0) return (
    <svg className="ill" viewBox="0 0 230 230" fill="none">
      {/* 태양 */}
      <circle cx="50" cy="48" r="26" fill="#D4A400" opacity=".95"/>
      <g stroke="#D4A400" strokeWidth="2" opacity=".5">
        <line x1="50" y1="10" x2="50" y2="2"/>
        <line x1="78" y1="20" x2="83" y2="13"/>
        <line x1="88" y1="48" x2="96" y2="48"/>
        <line x1="22" y1="20" x2="17" y2="13"/>
        <line x1="12" y1="48" x2="4" y2="48"/>
        <line x1="78" y1="76" x2="83" y2="83"/>
        <line x1="22" y1="76" x2="17" y2="83"/>
      </g>
      {/* 빛 화살표 */}
      <line x1="80" y1="60" x2="108" y2="100" stroke="#D4A400" strokeWidth="2" strokeDasharray="5 3" opacity=".7"/>
      <polygon points="108,100 100,88 116,90" fill="#D4A400" opacity=".7"/>
      {/* 잎 */}
      <ellipse cx="138" cy="118" rx="42" ry="28" fill="#2ecc71" opacity=".9"/>
      <line x1="96" y1="118" x2="180" y2="118" stroke="#27ae60" strokeWidth="1.5"/>
      <line x1="138" y1="90" x2="138" y2="146" stroke="#27ae60" strokeWidth="1.5"/>
      <line x1="138" y1="118" x2="138" y2="185" stroke="#27ae60" strokeWidth="2.5"/>
      {/* 줄기·뿌리 */}
      <line x1="118" y1="178" x2="100" y2="210" stroke="#8B5E3C" strokeWidth="2"/>
      <line x1="138" y1="185" x2="120" y2="215" stroke="#8B5E3C" strokeWidth="2"/>
      <line x1="138" y1="185" x2="158" y2="215" stroke="#8B5E3C" strokeWidth="2"/>
      {/* 포도당 출력 */}
      <rect x="168" y="94" width="52" height="36" rx="10" fill="rgba(212,164,0,.15)" stroke="#D4A400" strokeWidth="1.5"/>
      <text x="194" y="110" fill="#D4A400" fontSize="13" fontWeight="900" textAnchor="middle">C₆H₁₂O₆</text>
      <text x="194" y="122" fill="rgba(255,255,255,.6)" fontSize="8" textAnchor="middle">포도당</text>
      <line x1="180" y1="112" x2="168" y2="112" stroke="#D4A400" strokeWidth="1.5" strokeDasharray="3 2"/>
      {/* O2 출력 */}
      <rect x="168" y="140" width="52" height="30" rx="10" fill="rgba(100,200,255,.1)" stroke="#64c8ff" strokeWidth="1.5"/>
      <text x="194" y="158" fill="#64c8ff" fontSize="12" fontWeight="900" textAnchor="middle">O₂ ↑</text>
      <line x1="180" y1="155" x2="168" y2="155" stroke="#64c8ff" strokeWidth="1.5" strokeDasharray="3 2"/>
    </svg>
  )

  // Scene 1: 광합성 재료 — 빛+CO2+H2O → 엽록체 → 포도당+O2
  if (i === 1) return (
    <svg className="ill" viewBox="0 0 230 230" fill="none">
      {/* 입력 재료 */}
      <rect x="8" y="52" width="60" height="44" rx="12" fill="rgba(212,164,0,.15)" stroke="#D4A400" strokeWidth="1.5"/>
      <text x="38" y="72" fill="#D4A400" fontSize="18" textAnchor="middle">☀️</text>
      <text x="38" y="86" fill="white" fontSize="8" fontWeight="700" textAnchor="middle">빛에너지</text>

      <rect x="8" y="108" width="60" height="44" rx="12" fill="rgba(27,138,166,.18)" stroke="#1B8AA6" strokeWidth="1.5"/>
      <text x="38" y="128" fill="#1B8AA6" fontSize="16" textAnchor="middle">💧</text>
      <text x="38" y="142" fill="white" fontSize="8" fontWeight="700" textAnchor="middle">H₂O</text>

      <rect x="8" y="164" width="60" height="44" rx="12" fill="rgba(100,200,100,.12)" stroke="#4CAF50" strokeWidth="1.5"/>
      <text x="38" y="184" fill="#4CAF50" fontSize="14" textAnchor="middle">CO₂</text>
      <text x="38" y="198" fill="white" fontSize="8" fontWeight="700" textAnchor="middle">이산화탄소</text>

      {/* 화살표 */}
      <line x1="70" y1="74" x2="90" y2="115" stroke="#D4A400" strokeWidth="1.5" opacity=".6"/>
      <line x1="70" y1="130" x2="90" y2="125" stroke="#1B8AA6" strokeWidth="1.5" opacity=".6"/>
      <line x1="70" y1="186" x2="90" y2="135" stroke="#4CAF50" strokeWidth="1.5" opacity=".6"/>

      {/* 엽록체 */}
      <ellipse cx="130" cy="122" rx="38" ry="30" fill="rgba(46,204,113,.15)" stroke="#2ecc71" strokeWidth="2"/>
      <text x="130" y="116" fill="#2ecc71" fontSize="22" textAnchor="middle">🌿</text>
      <text x="130" y="134" fill="white" fontSize="9" fontWeight="800" textAnchor="middle">엽록체</text>

      {/* 출력 */}
      <rect x="172" y="82" width="54" height="38" rx="10" fill="rgba(212,164,0,.12)" stroke="#D4A400" strokeWidth="1.5"/>
      <text x="199" y="99" fill="#D4A400" fontSize="10" fontWeight="900" textAnchor="middle">포도당</text>
      <text x="199" y="112" fill="rgba(255,255,255,.5)" fontSize="8" textAnchor="middle">C₆H₁₂O₆</text>

      <rect x="172" y="130" width="54" height="38" rx="10" fill="rgba(100,200,255,.1)" stroke="#64c8ff" strokeWidth="1.5"/>
      <text x="199" y="152" fill="#64c8ff" fontSize="12" fontWeight="900" textAnchor="middle">O₂ ↑</text>

      <line x1="168" y1="101" x2="172" y2="101" stroke="#D4A400" strokeWidth="1.5"/>
      <line x1="168" y1="149" x2="172" y2="149" stroke="#64c8ff" strokeWidth="1.5"/>
    </svg>
  )

  // Scene 2: 명반응 — 빛 → 틸라코이드 → ATP + NADPH + O2
  if (i === 2) return (
    <svg className="ill" viewBox="0 0 230 230" fill="none">
      {/* 빛 광자 */}
      <circle cx="40" cy="36" r="8" fill="#D4A400" opacity=".9"/>
      <text x="40" y="40" fill="white" fontSize="9" textAnchor="middle" fontWeight="700">光</text>
      <circle cx="80" cy="24" r="8" fill="#D4A400" opacity=".9"/>
      <text x="80" y="28" fill="white" fontSize="9" textAnchor="middle" fontWeight="700">光</text>
      <circle cx="120" cy="34" r="8" fill="#D4A400" opacity=".9"/>
      <text x="120" y="38" fill="white" fontSize="9" textAnchor="middle" fontWeight="700">光</text>
      <circle cx="160" cy="24" r="8" fill="#D4A400" opacity=".9"/>
      <text x="160" y="28" fill="white" fontSize="9" textAnchor="middle" fontWeight="700">光</text>

      {/* 빛 → 틸라코이드 화살표 */}
      <line x1="40" y1="45" x2="40" y2="72" stroke="#D4A400" strokeWidth="1.5" strokeDasharray="4 2"/>
      <line x1="80" y1="33" x2="80" y2="72" stroke="#D4A400" strokeWidth="1.5" strokeDasharray="4 2"/>
      <line x1="120" y1="43" x2="120" y2="72" stroke="#D4A400" strokeWidth="1.5" strokeDasharray="4 2"/>
      <line x1="160" y1="33" x2="160" y2="72" stroke="#D4A400" strokeWidth="1.5" strokeDasharray="4 2"/>

      {/* 틸라코이드 막 */}
      <rect x="16" y="72" width="196" height="40" rx="20" fill="rgba(27,138,166,.2)" stroke="#1B8AA6" strokeWidth="2"/>
      <text x="115" y="87" fill="#1B8AA6" fontSize="9" fontWeight="800" textAnchor="middle">틸라코이드 막</text>
      <text x="115" y="102" fill="rgba(255,255,255,.5)" fontSize="8" textAnchor="middle">광계 I · II — 광인산화</text>

      {/* H2O 분해 */}
      <rect x="16" y="126" width="60" height="36" rx="10" fill="rgba(27,138,166,.15)" stroke="#1B8AA6" strokeWidth="1.5"/>
      <text x="46" y="143" fill="#1B8AA6" fontSize="11" fontWeight="900" textAnchor="middle">H₂O</text>
      <text x="46" y="155" fill="rgba(255,255,255,.5)" fontSize="8" textAnchor="middle">광분해</text>
      <line x1="46" y1="112" x2="46" y2="126" stroke="#1B8AA6" strokeWidth="1.5"/>

      {/* O2 방출 */}
      <rect x="16" y="174" width="60" height="32" rx="10" fill="rgba(100,200,255,.1)" stroke="#64c8ff" strokeWidth="1.5"/>
      <text x="46" y="194" fill="#64c8ff" fontSize="12" fontWeight="900" textAnchor="middle">O₂ ↑</text>
      <line x1="46" y1="162" x2="46" y2="174" stroke="#64c8ff" strokeWidth="1.5" strokeDasharray="3 2"/>

      {/* ATP */}
      <rect x="88" y="126" width="56" height="36" rx="10" fill="rgba(212,164,0,.15)" stroke="#D4A400" strokeWidth="1.5"/>
      <text x="116" y="143" fill="#D4A400" fontSize="13" fontWeight="900" textAnchor="middle">ATP</text>
      <text x="116" y="155" fill="rgba(255,255,255,.5)" fontSize="8" textAnchor="middle">에너지 화폐</text>
      <line x1="116" y1="112" x2="116" y2="126" stroke="#D4A400" strokeWidth="1.5"/>

      {/* NADPH */}
      <rect x="156" y="126" width="60" height="36" rx="10" fill="rgba(76,175,80,.12)" stroke="#4CAF50" strokeWidth="1.5"/>
      <text x="186" y="143" fill="#4CAF50" fontSize="11" fontWeight="900" textAnchor="middle">NADPH</text>
      <text x="186" y="155" fill="rgba(255,255,255,.5)" fontSize="8" textAnchor="middle">환원력</text>
      <line x1="186" y1="112" x2="186" y2="126" stroke="#4CAF50" strokeWidth="1.5"/>

      <text x="115" y="220" fill="rgba(255,255,255,.4)" fontSize="9" textAnchor="middle">빛 → ATP + NADPH + O₂</text>
    </svg>
  )

  // Scene 3: 암반응 (캘빈 회로) — CO2 → G3P → 포도당
  return (
    <svg className="ill" viewBox="0 0 230 230" fill="none">
      {/* 제목 */}
      <text x="115" y="28" fill="white" fontSize="12" fontWeight="900" textAnchor="middle">암반응 (캘빈 회로)</text>
      <text x="115" y="42" fill="rgba(255,255,255,.4)" fontSize="8" textAnchor="middle">빛 없이도 진행 · 스트로마</text>

      {/* 원형 회로 */}
      <circle cx="115" cy="128" r="58" fill="none" stroke="rgba(76,175,80,.3)" strokeWidth="2" strokeDasharray="6 3"/>

      {/* CO2 고정 */}
      <rect x="74" y="52" width="82" height="34" rx="12" fill="rgba(76,175,80,.15)" stroke="#4CAF50" strokeWidth="1.5"/>
      <text x="115" y="66" fill="#4CAF50" fontSize="10" fontWeight="800" textAnchor="middle">① CO₂ 고정</text>
      <text x="115" y="78" fill="rgba(255,255,255,.5)" fontSize="8" textAnchor="middle">루비스코 효소</text>

      {/* 환원 */}
      <rect x="158" y="104" width="62" height="34" rx="12" fill="rgba(212,164,0,.12)" stroke="#D4A400" strokeWidth="1.5"/>
      <text x="189" y="118" fill="#D4A400" fontSize="9" fontWeight="800" textAnchor="middle">② 환원</text>
      <text x="189" y="130" fill="rgba(255,255,255,.5)" fontSize="8" textAnchor="middle">ATP·NADPH</text>

      {/* G3P */}
      <rect x="130" y="164" width="76" height="34" rx="12" fill="rgba(27,138,166,.15)" stroke="#1B8AA6" strokeWidth="1.5"/>
      <text x="168" y="178" fill="#1B8AA6" fontSize="10" fontWeight="800" textAnchor="middle">G3P 생성</text>
      <text x="168" y="190" fill="rgba(255,255,255,.5)" fontSize="8" textAnchor="middle">포도당 원료</text>

      {/* RuBP 재생 */}
      <rect x="10" y="164" width="76" height="34" rx="12" fill="rgba(200,111,82,.12)" stroke="#C86F52" strokeWidth="1.5"/>
      <text x="48" y="178" fill="#C86F52" fontSize="9" fontWeight="800" textAnchor="middle">③ RuBP</text>
      <text x="48" y="190" fill="rgba(255,255,255,.5)" fontSize="8" textAnchor="middle">재생·반복</text>

      {/* 포도당 출력 */}
      <rect x="10" y="104" width="62" height="34" rx="12" fill="rgba(212,164,0,.15)" stroke="#D4A400" strokeWidth="1.5"/>
      <text x="41" y="118" fill="#D4A400" fontSize="10" fontWeight="900" textAnchor="middle">포도당</text>
      <text x="41" y="130" fill="rgba(255,255,255,.5)" fontSize="8" textAnchor="middle">C₆H₁₂O₆</text>

      {/* 화살표 (회로) */}
      <path d="M115 86 Q155 90 175 108" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" fill="none" markerEnd="url(#a)"/>
      <path d="M189 138 Q188 158 168 164" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" fill="none"/>
      <path d="M130 181 Q90 188 72 182" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" fill="none"/>
      <path d="M48 164 Q40 148 48 138" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" fill="none"/>
      <path d="M72 113 Q90 106 115 86" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" fill="none"/>
    </svg>
  )
}
