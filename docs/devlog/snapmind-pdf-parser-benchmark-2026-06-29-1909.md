# SnapMind PDF Parser Benchmark

- 생성 일시: 2026-06-29T10:09:41.855Z
- 입력 PDF: [ML Basic] (6-1) 모델 평가의 기초.pdf
- 팩 이름: GPT5.4 + Image2 low · PDF Parser
- 모델 조합: GPT5.4 + GPT Image 2 low
- 추출 방식: PDF Parser only
- 총 대단원 수: 2
- 총 세부 목차 수: 5
- 총 쇼츠 수: 5
- 이미지 생성 대상: 20
- 실패/재시도: TTS 실패 0, 이미지 실패 0
- API 키 저장 여부: 저장하지 않음

## 목차

- 01 모델 평가의 중요성과 복잡성
  - 1.1 소원을 빌 때는 신중히
- 02 모델 평가의 구성요소
  - 2.1 정성평가와 정량평가
  - 2.2 정량평가 지표와 손실함수
  - 2.3 평가 데이터셋의 구성
  - 2.4 모델 선택과 Regularization

## 단계별 소요 시간

- pdfExtractionMs: 1.6s
- tocExtractionMs: 0ms
- summaryStructureMs: 0ms
- scriptGenerationMs: 111.3s
- backendTotalMs: 113.0s
- ttsGenerationMs: 52.6s
- imageGenerationMs: 160.4s
- totalGenerationMs: 325.9s

참고: tocExtractionMs 또는 summaryStructureMs가 0ms이면 원본 목차 직접 사용 경로에서 폴링 간격 사이에 완료된 단계입니다.

## PDF Parser 감지 목차

- 1.1 소원을 빌 때는 신중히 (1631 chars)
- 2.1 정성평가와 정량평가 (522 chars)
- 2.2 정량평가 지표와 손실함수 (987 chars)
- 2.3 평가 데이터셋의 구성 (998 chars)
- 2.4 모델 선택과 Regularization (670 chars)

## 검수 메모

- 원본 PDF 목차 순서 보존을 우선 적용했다.
- 세부 목차 하나를 하나의 완성된 쇼츠로 묶는 방향으로 재생성했다.
- Upstage OCR은 이번 생성에서 사용하지 않았다.
