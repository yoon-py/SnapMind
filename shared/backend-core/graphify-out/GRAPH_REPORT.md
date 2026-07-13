# Graph Report - backend-core  (2026-07-13)

## Corpus Check
- 17 files · ~25,460 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 226 nodes · 533 edges · 15 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `14a7ba57`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- shortsMedia.ts
- trimText
- constants.ts
- generation.ts
- googleTextToSpeech.ts
- googleDocumentAi.ts
- articleMedia.ts
- generatePackFromSource
- scenesPrompt.ts
- geminiTextToSpeech.ts
- splitSourceIntoChunks
- extractSectionHeadingHints
- jobs.ts
- openaiTextToSpeech.ts
- generateShortsPackFromSource

## God Nodes (most connected - your core abstractions)
1. `trimText()` - 38 edges
2. `clampText()` - 23 edges
3. `slugify()` - 14 edges
4. `normalizeCardsPack()` - 13 edges
5. `generatePackFromSource()` - 13 edges
6. `generateShortsPackFromSource()` - 12 edges
7. `isLikelySectionHeading()` - 10 edges
8. `extractSectionHeadingHints()` - 10 edges
9. `detectSourceLanguage()` - 10 edges
10. `normalizeShortsPack()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `resolveUrl()` --calls--> `trimText()`  [EXTRACTED]
  src/articleMedia.ts → src/text.ts
- `toNumberOrUndefined()` --calls--> `trimText()`  [EXTRACTED]
  src/articleMedia.ts → src/text.ts
- `fetchArticle()` --calls--> `trimText()`  [EXTRACTED]
  src/articleMedia.ts → src/text.ts
- `parseArticleHtml()` --calls--> `trimText()`  [EXTRACTED]
  src/articleMedia.ts → src/text.ts
- `keywordOverlapScore()` --calls--> `trimText()`  [EXTRACTED]
  src/articleMedia.ts → src/text.ts

## Import Cycles
- None detected.

## Communities (15 total, 0 thin omitted)

### Community 0 - "shortsMedia.ts"
Cohesion: 0.13
Nodes (29): buildDeckSlideImagePath(), buildDeckSlideImagePrompt(), enrichDeckPackWithImages(), buildShortSceneImagePrompt(), decodeBase64(), GeminiImageConfig, generateShortSceneImage(), getFileExtensionFromMimeType() (+21 more)

### Community 1 - "trimText"
Cohesion: 0.21
Nodes (27): collectPackText(), defaultsQuestion(), normalizeCardsPack(), normalizeCoverLines(), normalizeDeckDiagram(), normalizeDeckPack(), normalizeDeckSlide(), normalizeDeckTextBlocks() (+19 more)

### Community 2 - "constants.ts"
Cohesion: 0.10
Nodes (17): accentPalette, chunkIdeasSchema, DANISH_STOPWORDS, deckPackSchema, ENGLISH_STOPWORDS, iconPalette, IDEA_CHAT_LIMITS, LANGUAGE_PROFILES (+9 more)

### Community 3 - "generation.ts"
Cohesion: 0.11
Nodes (17): buildNarrationScriptFromScenes(), CARD_DIAGRAM_KINDS, CARD_INTERACTION_KINDS, CARD_MEDIA_KINDS, CARD_TYPES, DECK_LAYOUTS, DECK_TEXT_ROLES, derivePackReviewQuestionsFromIdeas() (+9 more)

### Community 4 - "googleTextToSpeech.ts"
Cohesion: 0.21
Nodes (16): buildShortSceneSsml(), decodePemPrivateKey(), encodeJsonSegment(), escapeSsml(), fromBase64(), getDefaultGoogleTtsVoice(), getGoogleAccessToken(), googleAccessTokenCache (+8 more)

### Community 5 - "googleDocumentAi.ts"
Cohesion: 0.23
Nodes (12): decodePemPrivateKey(), encodeJsonSegment(), extractTextWithGoogleDocumentAi(), getGoogleAccessToken(), googleAccessTokenCache, GoogleDocumentAiConfig, normalizeMultilineSecret(), resolveGoogleDocumentAiConfig() (+4 more)

### Community 6 - "articleMedia.ts"
Cohesion: 0.22
Nodes (12): ARTICLE_CONTAINER_SELECTORS, ArticleImage, ArticleImageKind, fetchArticle(), FetchedArticle, isLikelyEditorialImage(), keywordOverlapScore(), matchScenesToMedia() (+4 more)

### Community 7 - "generatePackFromSource"
Cohesion: 0.23
Nodes (12): buildChunkPrompt(), buildDebugPayload(), buildDeckPrompt(), buildMetaPrompt(), buildPrompt(), countStopwords(), detectSourceLanguage(), generateDeckPackFromSource() (+4 more)

### Community 8 - "scenesPrompt.ts"
Cohesion: 0.29
Nodes (11): generateShortsPackFromScenes(), buildSceneQuizPrompt(), buildScenesInput(), clampSceneRatio(), compactScenesText(), normalizeGeneratedScenesPayload(), parseJsonLoose(), parseNumberedTitle() (+3 more)

### Community 9 - "geminiTextToSpeech.ts"
Cohesion: 0.24
Nodes (7): buildWavFile(), decodeBase64(), extractPcmFromTtsResponse(), GeminiTextToSpeechConfig, getDefaultGeminiTtsVoice(), synthesizeShortAudio(), TTS_FALLBACK_MODELS

### Community 10 - "splitSourceIntoChunks"
Cohesion: 0.31
Nodes (9): getChunkSizeForModel(), extractNumberedDocumentOutline(), isChapterLevelHeading(), lineMatchesOutlineItem(), normalizeHeadingCandidate(), normalizeOutlineMatchText(), parseNumberedOutlineHeading(), splitSourceIntoChunks() (+1 more)

### Community 11 - "extractSectionHeadingHints"
Cohesion: 0.28
Nodes (9): extractSectionHeadingHints(), hasLikelySentenceEnding(), isGenericSectionLabel(), isLikelySectionHeading(), isMostlyUppercase(), isTitleCaseHeading(), looksLikeStructuredHeading(), shouldIgnoreHeadingCandidate() (+1 more)

### Community 12 - "jobs.ts"
Cohesion: 0.25
Nodes (4): cloneJob(), GenerationJobRecord, JobPersistence, persistLater()

### Community 13 - "openaiTextToSpeech.ts"
Cohesion: 0.43
Nodes (7): buildInputText(), encodeBase64(), estimateSpeechDurationMs(), getDefaultOpenAITtsVoice(), OpenAITextToSpeechConfig, synthesizeShortAudioWithOpenAI(), synthesizeSpeechBytes()

### Community 14 - "generateShortsPackFromSource"
Cohesion: 0.33
Nodes (7): buildShortIdeaOutlinePrompt(), buildShortIdeaStoryboardPrompt(), buildShortMetaPrompt(), generateShortsPackFromSource(), getRawShortClipSources(), isShortIdeaValid(), normalizeIdeaDurationSec()

## Knowledge Gaps
- **30 isolated node(s):** `ArticleImageKind`, `ArticleImage`, `FetchedArticle`, `ARTICLE_CONTAINER_SELECTORS`, `SceneMedia` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `trimText()` connect `trimText` to `shortsMedia.ts`, `constants.ts`, `generation.ts`, `articleMedia.ts`, `generatePackFromSource`, `generateShortsPackFromSource`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Why does `slugify()` connect `shortsMedia.ts` to `trimText`, `generation.ts`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `clampText()` connect `trimText` to `shortsMedia.ts`, `constants.ts`, `generation.ts`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `ArticleImageKind`, `ArticleImage`, `FetchedArticle` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `shortsMedia.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13015873015873017 - nodes in this community are weakly interconnected._
- **Should `constants.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1038961038961039 - nodes in this community are weakly interconnected._
- **Should `generation.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._