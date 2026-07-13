# SnapMind — 뉴스 → 유튜브 쇼츠 설계 (MVP)

작성일: 2026-06-30

## 배경 / 목표

최종 목표는 "언론사 뉴스 수집 → 핫한 거 선별 → 4종 콘텐츠(온라인기사/SNS/유튜브뉴스/쇼츠) 생산 → 자동 업로드"지만,
전체를 한 번에 만들다 미디어풀 구축에서 막혔다. 그래서 범위를 **딱 한 슬라이스**로 좁힌다.

> **기사 URL 1개 → 본문+이미지 추출 → shorts pack 생성 → 이미지 매칭 → ffmpeg로 쇼츠 mp4 1개**

뉴스 수집/선별, 업로드 자동화는 이번 범위 밖.

## 핵심 결정

- **이미지: AI 생성 대신 원본 기사에서 하베스팅한다.** (비용↓, 뉴스에 적합, "언론사 거 그대로")
- **추출: 자체 파서** (`fetch` + `cheerio`). og:image + 본문 `<figure>/<img>` + 캡션 + 본문 텍스트.
- **렌더: ffmpeg 먼저** (`render-short-video.js` 확장). Remotion은 나중.
- **영상 클립은 MVP 제외.** 정지컷 + 켄번즈(슬로우 줌/팬)로 충분.
- **출처 크레딧 자동 삽입** (`scene.media.credit`) — 자동 업로드 시 저작권 리스크 완화용으로 처음부터 박아둠.

## 데이터 흐름

```
[기사 URL]
  ├─ articleMedia.fetchArticle(url)
  │    → { title, byline, bodyText, images:[{url,caption,width,height,kind:"hero"|"body"}], sourceUrl }
  │
  ├─ bodyText → generatePackFromSource(packFormat:"shorts")   (기존 재활용)
  │    → pack.ideas[].clips[].scenes[]
  │
  ├─ matchScenesToMedia(scenes, images)
  │    → 각 scene.media = { type:"image", url|localPath, caption, credit, sourceUrl }
  │
  ├─ TTS (기존 재활용) → clip별 음성
  │
  └─ ffmpeg 렌더 → 쇼츠 mp4 (1080x1920, 켄번즈 + 자막 + 크레딧 + 음성)
```

## 신규 / 변경 모듈

| 파일 | 역할 | 상태 |
|---|---|---|
| `shared/backend-core/src/articleMedia.ts` | URL → 본문+이미지 추출 (cheerio) | 신규 |
| `matchScenesToMedia` (articleMedia.ts 내) | scene ↔ 이미지 매칭 | 신규 |
| `scripts/run-news-shorts-e2e.js` | URL → mp4 한 방 파이프라인 (run-shorts-e2e.js의 URL판) | 신규 |
| `scripts/render-short-video.js` | media 이미지 + 크레딧 자막 지원 | 확장 |
| `scene.media` | 기존 `scene.image`(생성형) 대체/보완 | 데이터모델 |

## scene ↔ 이미지 매칭 규칙

- hero(og:image) → 인트로/타이틀 씬
- body 이미지 → 캡션 키워드가 씬 headline/body와 겹치는 곳 우선 배치, 없으면 순서대로 분배
- 이미지 부족 시 재사용 + 켄번즈로 다른 구도처럼 처리
- 모든 미디어에 `credit`(출처) 동반

## 검증 (Definition of Done)

- 임의 뉴스 URL 1개로 스크립트 실행 → `artifacts/news-shorts/run-*/` 에 mp4 1개 생성
- 영상 안에 기사 사진 + 자막 + 출처 크레딧 + 한국어 TTS 음성이 들어감
- AI 이미지 생성 호출 0건 (비용 0)

## 이후 단계 (범위 밖, 메모)

1. 뉴스 수집(RSS/X/YouTube 트렌드) + 선별
2. 4종 포맷 분기 (온라인기사 ✅ / SNS / 유튜브뉴스 / 쇼츠)
3. Remotion 전환
4. 유튜브/인스타/X 자동 업로드
5. 저작권 정식 처리 (라이선스/인용 범위)
