import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import * as WebBrowser from "expo-web-browser";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { ResizeMode, Video } from "expo-av";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, MaterialIcons } from "@expo/vector-icons";

import { learningPacks } from "./data/learningContent";
import { useRootAppController } from "./hooks/useRootAppController";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8788";
const GEMINI_LOGO_URL =
  "https://unpkg.com/@lobehub/icons-static-png@latest/light/gemini-color.png";
const OPENAI_BLOSSOM_ICON = require("../assets/openai-blossom.png");
const APP_DISPLAY_NAME = "SnapMind";
const CHAT_ENTRY_SIDE_INSET = 20;
const CHAT_ENTRY_BOTTOM_OFFSET = 8;
const DEFAULT_STUDIO_TITLE = "";
const STORAGE_KEYS = {
  generatedPacks: "clip-note/generated-packs",
  progressByPack: "clip-note/progress-by-pack",
  chatByIdea: "clip-note/chat-by-idea",
  appLanguage: "clip-note/app-language",
  hiddenPackIds: "clip-note/hidden-pack-ids",
};
const APP_LANGUAGE_OPTIONS = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
];
const BASE_PACK_IDS = new Set(learningPacks.map((pack) => pack.id));
const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "hwp",
  "hwpx",
  "pptx",
  "ppt",
  "xlsx",
  "xls",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "bmp",
  "tiff",
  "tif",
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "html",
  "htm",
  "xml",
  "rtf",
]);
const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/x-hwp",
  "application/haansofthwp",
  "application/hwp+zip",
  "application/vnd.hancom.hwpx",
  "application/json",
  "application/xml",
  "application/rtf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);
const BINARY_UPLOAD_EXTENSIONS = new Set([
  "pdf", "docx", "hwp", "hwpx", "pptx", "ppt", "xlsx", "xls",
  "jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif",
  "txt", "md", "markdown", "csv", "html", "htm", "xml", "rtf",
]);

const palette = {
  background: "#FCFBF7",
  surface: "#F7F4ED",
  raised: "#FFFDFA",
  ink: "#321007",
  muted: "#7A6452",
  line: "#E7DDCF",
  accent: "#C98706",
  accentSoft: "#F1E2C4",
  success: "#1FA95C",
  danger: "#D35E3C",
  shadow: "#52210B",
};

function withAlpha(color, alpha) {
  return `${color}${alpha}`;
}

function renderRichText(text, baseStyle) {
  if (!text) return null;

  // Split by paragraphs first (double newline)
  const paragraphs = text.split(/\n\n+/);

  return paragraphs.map((para, pIdx) => {
    // Check if this paragraph is a $$ math block $$
    const mathMatch = para.trim().match(/^\$\$([\s\S]+?)\$\$$/);
    if (mathMatch) {
      return (
        <View key={pIdx} style={richStyles.mathBlock}>
          <Text style={richStyles.mathText}>{mathMatch[1].trim()}</Text>
        </View>
      );
    }

    // Parse inline formatting: **bold** and *italic*
    const parts = [];
    // Regex: match **bold**, *italic*, or plain text
    const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)/g;
    let lastIndex = 0;
    let match;
    const source = para;

    while ((match = regex.exec(source)) !== null) {
      // Add plain text before this match
      if (match.index > lastIndex) {
        parts.push({ text: source.slice(lastIndex, match.index), style: null });
      }
      if (match[1]) {
        // **bold**
        parts.push({ text: match[2], style: richStyles.bold });
      } else if (match[3]) {
        // *italic*
        parts.push({ text: match[4], style: richStyles.italic });
      }
      lastIndex = regex.lastIndex;
    }
    // Remaining plain text
    if (lastIndex < source.length) {
      parts.push({ text: source.slice(lastIndex), style: null });
    }

    return (
      <Text key={pIdx} style={[baseStyle, pIdx > 0 && { marginTop: 12 }]}>
        {parts.map((p, i) =>
          p.style ? (
            <Text key={i} style={p.style}>{p.text}</Text>
          ) : (
            p.text
          )
        )}
      </Text>
    );
  });
}

const richStyles = {
  bold: { fontWeight: "800" },
  italic: { fontStyle: "italic" },
  mathBlock: {
    backgroundColor: withAlpha(palette.surface, "CC"),
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    alignItems: "center",
  },
  mathText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 16,
    color: palette.ink,
    lineHeight: 24,
    textAlign: "center",
  },
};

function normalizeSourceText(text) {
  return text.replace(/\r\n/g, "\n").trim();
}

function getFileExtension(fileName) {
  const segments = fileName.split(".");
  return segments.length > 1 ? segments.at(-1).toLowerCase() : "";
}

function isSupportedSourceAsset(asset) {
  if (!asset) {
    return false;
  }

  if (asset.mimeType?.startsWith("text/")) {
    return true;
  }

  if (asset.mimeType && SUPPORTED_UPLOAD_MIME_TYPES.has(asset.mimeType)) {
    return true;
  }

  return SUPPORTED_UPLOAD_EXTENSIONS.has(getFileExtension(asset.name || ""));
}

function isPdfAsset(asset) {
  return (
    asset?.mimeType === "application/pdf" ||
    getFileExtension(asset?.name || "") === "pdf"
  );
}

function isBinaryAsset(asset) {
  return BINARY_UPLOAD_EXTENSIONS.has(getFileExtension(asset?.name || "")) ||
    SUPPORTED_UPLOAD_MIME_TYPES.has(asset?.mimeType);
}

function inferTitleFromFileName(fileName) {
  const title = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return title || DEFAULT_STUDIO_TITLE;
}

function formatFileSize(size) {
  if (!size || Number.isNaN(size)) {
    return "Size unknown";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getSourcePreview(sourceText) {
  if (sourceText.length <= 280) {
    return sourceText;
  }

  return `${sourceText.slice(0, 280).trim()}...`;
}

async function readSourceTextFromAsset(asset) {
  if (asset.file && typeof asset.file.text === "function") {
    return asset.file.text();
  }

  const response = await fetch(asset.uri);
  return response.text();
}

function getPackById(packs, packId) {
  return packs.find((pack) => pack.id === packId) || packs[0];
}

function getLocalizedBasePacks(lang) {
  return learningPacks.filter((pack) => !pack.lang || pack.lang === lang);
}

function mergePackLists(generatedPacks, lang) {
  const generatedIds = new Set(generatedPacks.map((pack) => pack.id));
  const basePacks = getLocalizedBasePacks(lang);
  return [...generatedPacks, ...basePacks.filter((pack) => !generatedIds.has(pack.id))];
}

function parseStoredValue(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.warn("Failed to parse persisted Clip-Note data.", error);
    return fallback;
  }
}

function getPackFormat(pack) {
  return pack?.format === "shorts" ? "shorts" : "cards";
}

function isShortsPack(pack) {
  return getPackFormat(pack) === "shorts";
}

function normalizeRequestedPackFormat(packFormat) {
  return packFormat === "cards" ? "cards" : "shorts";
}

function getIdeaShort(idea) {
  return idea?.short && typeof idea.short === "object" ? idea.short : null;
}

function getCompletedIdeaIds(progressByPack, packId) {
  return progressByPack[packId]?.completedIdeaIds || [];
}

function withPackTouch(progress, touchedAt = new Date().toISOString()) {
  return {
    ...(progress || {}),
    completedIdeaIds: progress?.completedIdeaIds || [],
    lastTouchedAt: touchedAt,
  };
}

function getPackLastTouchedAt(progressByPack, packId) {
  const rawValue = progressByPack[packId]?.lastTouchedAt;
  const parsedTime = rawValue ? Date.parse(rawValue) : NaN;
  return Number.isFinite(parsedTime) ? parsedTime : null;
}

function isPackFinished(pack, progressByPack) {
  const completedIdeaIds = getCompletedIdeaIds(progressByPack, pack.id);
  const hasPackReview = getPackReviewQuestions(pack).length > 0;
  const finishedIdeas = completedIdeaIds.length >= pack.ideas.length;

  if (!finishedIdeas) {
    return false;
  }

  if (!hasPackReview) {
    return true;
  }

  return hasPackReviewCompleted(progressByPack, pack.id);
}

function getHomeFeaturedPack(packs, progressByPack) {
  const readyPacks = packs.filter((pack) => pack.status === "ready");
  const incompleteReadyPacks = readyPacks.filter((pack) => !isPackFinished(pack, progressByPack));
  const touchedIncompleteReadyPacks = incompleteReadyPacks
    .map((pack) => ({
      pack,
      lastTouchedAt: getPackLastTouchedAt(progressByPack, pack.id),
      completedCount: getCompletedIdeaIds(progressByPack, pack.id).length,
    }))
    .filter((entry) => entry.lastTouchedAt);

  if (touchedIncompleteReadyPacks.length > 0) {
    touchedIncompleteReadyPacks.sort((left, right) => {
      if (right.lastTouchedAt !== left.lastTouchedAt) {
        return right.lastTouchedAt - left.lastTouchedAt;
      }

      return right.completedCount - left.completedCount;
    });

    return touchedIncompleteReadyPacks[0].pack;
  }

  const startedIncompleteReadyPack = incompleteReadyPacks.find(
    (pack) => getCompletedIdeaIds(progressByPack, pack.id).length > 0
  );

  if (startedIncompleteReadyPack) {
    return startedIncompleteReadyPack;
  }

  return incompleteReadyPacks[0] || readyPacks[0] || packs[0];
}

function isIdeaUnlocked(index, completedIdeaIds) {
  return index <= completedIdeaIds.length;
}

function getNextIdea(pack, completedIdeaIds) {
  return pack.ideas.find((idea) => !completedIdeaIds.includes(idea.id)) || null;
}

function hasPackReviewCompleted(progressByPack, packId) {
  return Boolean(progressByPack[packId]?.packReview?.completedAt);
}

function getPackReviewResult(progressByPack, packId) {
  const packReview = progressByPack[packId]?.packReview;

  if (!packReview || typeof packReview !== "object") {
    return null;
  }

  const score = Number(packReview.score);
  const totalQuestions = Number(packReview.totalQuestions);

  if (!Number.isFinite(score) || !Number.isFinite(totalQuestions) || totalQuestions <= 0) {
    return null;
  }

  return {
    score,
    totalQuestions,
    completedAt: packReview.completedAt || null,
  };
}

function getCompactTitle(title, maxWords = 4) {
  const fallback = String(title || "").replace(/\s+/g, " ").trim();

  if (!fallback) {
    return "";
  }

  let cleaned = fallback
    .replace(/^\d+\s*[\].):\-]?\s*/u, "")
    .replace(/\s*[\(\[（][^)\]）]{1,40}[\)\]）]\s*/gu, " ")
    .replace(/\s+[—–-]\s+.*$/u, "")
    .replace(/\s*[:|]\s*.*$/u, "")
    .replace(/,\s+.*$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    cleaned = fallback;
  }

  if (cleaned.includes(" ")) {
    cleaned = cleaned.split(" ").slice(0, maxWords).join(" ");
  }

  return cleaned || fallback;
}

function shuffleOptions(options, correctIndex) {
  const safeIndex = Math.max(0, Math.min(options.length - 1, correctIndex));
  const indexed = options.map((option, i) => ({ option, isCorrect: i === safeIndex }));

  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }

  return {
    options: indexed.map((entry) => entry.option),
    correctIndex: indexed.findIndex((entry) => entry.isCorrect),
  };
}

function getPracticeQuestions(idea) {
  if (Array.isArray(idea?.quiz?.questions) && idea.quiz.questions.length > 0) {
    return idea.quiz.questions.map((question, index) => {
      const options = Array.isArray(question.options) ? question.options.slice(0, 3) : [];
      const correctIdx = Math.max(0, Math.min(2, Number(question.correctIndex || 0)));
      const shuffled = shuffleOptions(options, correctIdx);

      return {
        id: question.id || `${idea.id}-quiz-${index + 1}`,
        question: question.question || "",
        options: shuffled.options,
        correctIndex: shuffled.correctIndex,
        explanation: question.explanation || "",
      };
    });
  }

  const rawPractice = idea?.practice || {};
  const rawQuestions =
    Array.isArray(rawPractice.questions) && rawPractice.questions.length > 0
      ? rawPractice.questions
      : rawPractice.question
        ? [rawPractice]
        : [];

  return rawQuestions.map((question, index) => {
    const options = Array.isArray(question.options) ? question.options.slice(0, 3) : [];
    const correctIdx = Math.max(0, Math.min(2, Number(question.correctIndex || 0)));
    const shuffled = shuffleOptions(options, correctIdx);

    return {
      id: question.id || `${idea.id}-practice-${index + 1}`,
      question: question.question || "",
      options: shuffled.options,
      correctIndex: shuffled.correctIndex,
      explanation: question.explanation || "",
    };
  });
}

function normalizeQuizQuestion(question, fallbackId) {
  const options = Array.isArray(question?.options)
    ? question.options
        .map((option) => String(option || "").trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const correctIdx = Math.max(0, Math.min(options.length - 1, Number(question?.correctIndex || 0)));
  const shuffled = shuffleOptions(options, correctIdx);

  return {
    id: question?.id || fallbackId,
    question: String(question?.question || "").trim(),
    options: shuffled.options,
    correctIndex: shuffled.correctIndex,
    explanation: String(question?.explanation || "").trim(),
  };
}

function getPackReviewQuestions(pack) {
  if (isShortsPack(pack)) {
    return [];
  }

  const providedQuestions = Array.isArray(pack?.packReview?.questions)
    ? pack.packReview.questions
        .map((question, index) =>
          normalizeQuizQuestion(question, `${pack.id || "pack"}-review-${index + 1}`)
        )
        .filter((question) => question.question && question.options.length === 3)
    : [];

  const selectedQuestions = providedQuestions.slice(0, 10);
  const selectedIds = new Set(selectedQuestions.map((question) => question.id));
  const selectedTexts = new Set(selectedQuestions.map((question) => question.question));
  const allQuestions = pack.ideas.flatMap((idea) =>
    getPracticeQuestions(idea).map((question) => ({
      ...question,
      id: `${pack.id || "pack"}-${question.id}`,
    }))
  );

  pack.ideas.forEach((idea, ideaIndex) => {
    const ideaQuestions = getPracticeQuestions(idea);
    if (!ideaQuestions.length || selectedQuestions.length >= 10) {
      return;
    }

    const preferredQuestion = ideaQuestions[ideaIndex % ideaQuestions.length] || ideaQuestions[0];
    const normalized = normalizeQuizQuestion(
      preferredQuestion,
      `${pack.id || "pack"}-${idea.id}-review-${ideaIndex + 1}`
    );

    if (!normalized.question || normalized.options.length !== 3 || selectedIds.has(normalized.id) || selectedTexts.has(normalized.question)) {
      return;
    }

    selectedIds.add(normalized.id);
    selectedTexts.add(normalized.question);
    selectedQuestions.push(normalized);
  });

  for (const question of allQuestions) {
    if (selectedQuestions.length >= 10) {
      break;
    }

    const normalized = normalizeQuizQuestion(question, question.id);
    if (!normalized.question || normalized.options.length !== 3 || selectedIds.has(normalized.id) || selectedTexts.has(normalized.question)) {
      continue;
    }

    selectedIds.add(normalized.id);
    selectedTexts.add(normalized.question);
    selectedQuestions.push(normalized);
  }

  return selectedQuestions.slice(0, 10);
}

function getIdeaChatMessages(chatByIdea, packId, ideaId) {
  return chatByIdea[packId]?.[ideaId] || [];
}

function createChatMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content: String(content || "").trim(),
    createdAt: new Date().toISOString(),
  };
}

function buildIdeaContext(pack, idea) {
  if (isShortsPack(pack)) {
    const short = getIdeaShort(idea);

    return {
      packFormat: "shorts",
      packTitle: pack.title,
      ideaTitle: idea.title,
      hook: short?.hook || "",
      learningGoal: short?.learningGoal || "",
      targetPlatform: short?.targetPlatform || "",
      videoStyle: short?.videoStyle || "",
      captionStyle: short?.captionStyle || "",
      musicCue: short?.musicCue || "",
      narrationScript: short?.narrationScript || "",
      shortScenes: Array.isArray(short?.scenes)
        ? short.scenes.map((scene) => ({
            headline: scene.headline,
            body: scene.body,
            narration: scene.narration,
            callouts: [...(scene.callouts || [])],
            captionLines: [...(scene.captionLines || [])],
            emphasisWords: [...(scene.emphasisWords || [])],
            motionHint: scene.motionHint || "",
            transitionHint: scene.transitionHint || "",
          }))
        : [],
      practiceQuestions: getPracticeQuestions(idea).map((question) => ({
        question: question.question,
        options: [...(question.options || [])],
        explanation: question.explanation,
      })),
      summaryBullets: [],
      reflectionPrompt: "",
      lessonCards: [],
    };
  }

  return {
    packFormat: "cards",
    packTitle: pack.title,
    ideaTitle: idea.title,
    lessonCards: idea.lessonCards.map((card) => ({
      eyebrow: card.eyebrow,
      title: card.title,
      body: card.body,
      support: card.support,
    })),
    summaryBullets: [...(idea.summaryBullets || [])],
    reflectionPrompt: idea.reflectionPrompt,
    practiceQuestions: getPracticeQuestions(idea).map((question) => ({
      question: question.question,
      options: [...(question.options || [])],
      explanation: question.explanation,
    })),
  };
}

function getShortAudio(short) {
  return short?.tts && typeof short.tts === "object" ? short.tts : null;
}

function getShortVideo(short) {
  return short?.video && typeof short.video === "object" ? short.video : null;
}

function getShortSceneImage(scene) {
  return scene?.image && typeof scene.image === "object" ? scene.image : null;
}

function getShortAudioSegments(short) {
  const tts = getShortAudio(short);
  return Array.isArray(tts?.segments)
    ? [...tts.segments]
        .map((segment, index) => ({
          id: segment.id || `segment-${index + 1}`,
          sceneId: segment.sceneId || "",
          order: Math.max(1, Number(segment.order || index + 1)),
          text: String(segment.text || "").trim(),
          startMs: Math.max(0, Number(segment.startMs || 0)),
          endMs: Math.max(0, Number(segment.endMs || 0)),
        }))
        .sort((left, right) => left.order - right.order)
    : [];
}

function getShortSceneActiveIndex(short, currentTimeSec) {
  const scenes = Array.isArray(short?.scenes) ? short.scenes : [];
  const segments = getShortAudioSegments(short);

  if (!scenes.length) {
    return 0;
  }

  if (!segments.length) {
    return 0;
  }

  const currentTimeMs = Math.max(0, Math.round(Number(currentTimeSec || 0) * 1000));
  const matchedSegmentIndex = segments.findIndex((segment, index) => {
    const nextSegment = segments[index + 1];
    const endMs = segment.endMs || nextSegment?.startMs || Number.MAX_SAFE_INTEGER;
    return currentTimeMs >= segment.startMs && currentTimeMs < endMs;
  });

  if (matchedSegmentIndex >= 0) {
    const sceneIndex = scenes.findIndex((scene) => scene.id === segments[matchedSegmentIndex].sceneId);
    return sceneIndex >= 0 ? sceneIndex : matchedSegmentIndex;
  }

  return scenes.length - 1;
}

function formatAudioTimeLabel(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getShortActiveSegment(segments, currentTimeMs) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return null;
  }

  const targetMs = Math.max(0, Number(currentTimeMs || 0));
  const matchedSegment = segments.find((segment, index) => {
    const nextSegment = segments[index + 1];
    const startMs = Math.max(0, Number(segment?.startMs || 0));
    const fallbackEndMs = nextSegment?.startMs || Number.MAX_SAFE_INTEGER;
    const endMs = Math.max(startMs, Number(segment?.endMs || fallbackEndMs));
    return targetMs >= startMs && targetMs < endMs;
  });

  return matchedSegment || null;
}

function chunkSubtitleText(text, maxLength = 26) {
  const normalizedText = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedText) {
    return [];
  }

  const sentenceParts = normalizedText
    .split(/(?<=[.!?。！？])/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const queue = sentenceParts.length ? sentenceParts : [normalizedText];
  const chunks = [];

  queue.forEach((part) => {
    if (part.length <= maxLength) {
      chunks.push(part);
      return;
    }

    if (!part.includes(" ")) {
      for (let index = 0; index < part.length; index += maxLength) {
        chunks.push(part.slice(index, index + maxLength));
      }
      return;
    }

    const words = part.split(" ").filter(Boolean);
    let currentChunk = "";

    words.forEach((word) => {
      const candidate = currentChunk ? `${currentChunk} ${word}` : word;

      if (candidate.length <= maxLength) {
        currentChunk = candidate;
        return;
      }

      if (currentChunk) {
        chunks.push(currentChunk);
      }

      if (word.length <= maxLength) {
        currentChunk = word;
        return;
      }

      for (let index = 0; index < word.length; index += maxLength) {
        chunks.push(word.slice(index, index + maxLength));
      }
      currentChunk = "";
    });

    if (currentChunk) {
      chunks.push(currentChunk);
    }
  });

  return chunks.filter(Boolean);
}

function getShortSubtitleLine(segment, currentTimeMs) {
  if (!segment?.text) {
    return "";
  }

  const chunks = chunkSubtitleText(segment.text, 20);
  if (chunks.length <= 2) {
    return chunks.join("\n");
  }

  const startMs = Math.max(0, Number(segment.startMs || 0));
  const endMs = Math.max(startMs + 1, Number(segment.endMs || startMs + 1));
  const progress = clampNumber((Math.max(startMs, Number(currentTimeMs || 0)) - startMs) / (endMs - startMs), 0, 0.9999);
  const chunkIndex = Math.min(chunks.length - 1, Math.floor(progress * chunks.length));
  const windowStart = Math.min(Math.max(0, chunks.length - 2), chunkIndex);
  return chunks.slice(windowStart, windowStart + 2).join("\n");
}

const APP_UI_COPY = {
  en: {
    languageKicker: "Language",
    languageTitle: "Choose app language",
    languageBody: "Switch the app interface between Korean and English.",
    homeKicker: "Create with AI",
    homeTitle: "Turn your own material into a learning pack.",
    homeBody:
      "Start from pasted text or a document upload, then turn it into either a card-based lesson pack or a vertical short with scenes, audio, and a quiz.",
    keyIdeas: "Key ideas",
    timePerIdea: "Time per idea",
    startIdea(title) {
      return title ? `Start ${title}` : "Open pack";
    },
    startStudy: "Start studying",
    openPack: "Open pack",
    aiStudioKicker: "AI studio",
    aiStudioTitle: "Generate a pack from your own source",
    aiStudioBody:
      "Upload notes, an article excerpt, or a chapter summary as a file and choose whether it becomes a card pack or a vertical short.",
    studioStepUpload: "Upload a source file",
    studioStepGenerate: "Generate ideas, short scenes, and quiz",
    studioStepOpen: "Open the generated pack in the app",
    openAiStudio: "Open AI Studio",
    libraryKicker: "Library",
    libraryTitle: "Pack shelf",
    libraryBody: "Generated packs show up here next to the seeded examples.",
    libraryCompleted(completed, total) {
      return `${completed}/${total} completed`;
    },
    comingSoon: "Coming soon",
    quickCreateCta: "Create new",
    quickCreateTitle: "Create a new pack",
    quickCreateBody:
      "Choose the fastest way to start. You can still edit the title and other details on the next screen.",
    packFormatTitle: "Choose the output style",
    packFormatBody:
      "Cards turn the source into lesson cards and review. Shorts turn it into a vertical storyboard, narration, and quiz.",
    packFormatShortsTitle: "Short video",
    packFormatShortsBody: "Scenes, TTS, images, and a quiz for a vertical lesson short.",
    packFormatCardsTitle: "Card pack",
    packFormatCardsBody: "Lesson cards, review prompts, and practice questions for step-by-step study.",
    packFormatShortsChip: "SHORTS",
    packFormatCardsChip: "CARDS",
    quickCreateTextTitle: "Paste text",
    quickCreateTextBody: "Start from notes, excerpts, or chapter text.",
    quickCreateFileTitle: "Upload a file",
    quickCreateFileBody: "Use PDF, DOCX, HWP, or text-based files such as .txt, .md, .csv, or .html.",
    quickCreateAdvanced: "Open full studio",
    ideasDone(completed, total) {
      return `${completed}/${total} ideas done`;
    },
    studioTopTitle: "Create a new pack",
    studioTopCaption: "Add source material",
    backendTargetKicker: "Backend target",
    backendTargetTitle: "Generate a new learning pack",
    backendTargetBody:
      "The app sends your source to the backend, which returns either lesson cards or a short-video storyboard with audio and quiz data.",
    apiBaseUrl: "API base URL",
    apiBaseUrlHint: "Use your Mac's local IP instead of localhost when testing on a real phone.",
    packTitle: "Pack title",
    packTitlePlaceholder: "Enter a pack title",
    author: "Author",
    authorPlaceholder: "Author",
    category: "Category",
    categoryPlaceholder: "Category",
    sourceText: "Source text",
    sourceTextPlaceholder: "Paste source text here",
    sourceTextHint() {
      return "Paste notes, excerpts, or a short passage. More text usually gives better results, but short input also works.";
    },
    sourceFile: "Source file",
    ready: "Ready",
    chooseSourceDocument: "Choose a source document",
    pdfBackendExtracted(fileSize) {
      return `${fileSize} · PDF text will be extracted on the backend`;
    },
    textFileLoaded(fileSize, characterCount) {
      return `${fileSize} · ${characterCount.toLocaleString()} characters`;
    },
    supportedUploadHint: "Upload .pdf, .docx, .hwp, .txt, .md, .csv, .json, .html, .xml, or .rtf",
    uploadLargeFileWarning: "Very large files may result in some content being omitted.",
    ocrLanguageHint: "Scanned PDFs and images support Korean and English only.",
    pdfUpload: "PDF upload",
    preview: "Preview",
    pdfPreviewBody:
      "This PDF will be uploaded to the backend, converted to text, and then used to generate the learning pack.",
    chooseAnotherFile: "Choose another file",
    removeFile: "Remove file",
    fileHint() {
      return "Short excerpts also work. Results are usually better when the file has enough readable text.";
    },
    couldNotGeneratePack: "Could not generate the pack",
    generatingPack: "SnapMind Generating...",
    generatingPackHint: "This may take 10+ minutes depending on length.",
    generatingPackEta: (secs) => {
      const mins = Math.ceil(secs / 60);
      return mins <= 1 ? "About 1 min estimated" : `About ${mins} min estimated`;
    },
    longContentWarning: "For very long documents, some content may be omitted from the generated pack.",
    generatePack: "Generate pack",
    noFileSelected: "No file was selected.",
    unsupportedFile:
      "Upload a supported file such as .pdf, .docx, .hwp, .txt, .md, .csv, .json, .html, .xml, or .rtf.",
    selectedFileEmpty: "The selected file is empty.",
    couldNotReadFile: "Could not read the selected file.",
    uploadBeforeGenerate: "Paste source text or upload a file before generating a pack.",
    backendRouteNotFound(url) {
      return `Backend route not found at ${url}. Check EXPO_PUBLIC_API_URL.`;
    },
    generationTimeout:
      "Generation is taking longer than expected. The server may still be working, so please wait a little and try again.",
    generationFailed: "Generation failed.",
    generationFailedShort: "Generation failed",
    retry: "Retry",
    pasteTextTitle: "Paste copied text",
    pasteTextBody: "Paste the text you want to study below",
    pasteTextPlaceholder: "Paste text here",
    addButton: "Add",
    detailDescription: "Description",
    detailPrompt: "Ready to understand one idea at a time?",
    mainIdeas: "Main ideas",
    mainIdeasBody:
      "Ideas unlock step by step so the pack stays manageable while you study.",
    deletePack: "Delete",
    deletePackConfirmTitle: "Delete pack",
    deletePackConfirmMessage: "Are you sure you want to delete this pack? This cannot be undone.",
    deletePackCancel: "Cancel",
    deletePackConfirm: "Delete",
  },
  ko: {
    languageKicker: "언어 설정",
    languageTitle: "앱 언어 고르기",
    languageBody: "앱 인터페이스를 한국어와 영어 중에서 바꿀 수 있어요.",
    homeKicker: "AI로 만들기",
    homeTitle: "내 자료를 바로 학습 팩으로 바꾸기",
    homeBody:
      "텍스트를 붙여넣거나 파일을 올린 뒤, 카드형 학습 팩이나 쇼츠형 짧은 강의 중 원하는 흐름으로 바로 만들 수 있어요.",
    keyIdeas: "핵심 아이디어",
    timePerIdea: "아이디어당 시간",
    startIdea(title) {
      return title ? `${title} 시작하기` : "팩 열기";
    },
    startStudy: "공부 시작하기",
    openPack: "팩 열기",
    aiStudioKicker: "AI 스튜디오",
    aiStudioTitle: "내 자료로 팩 만들기",
    aiStudioBody:
      "노트, 글 일부, 챕터 요약 파일을 올리고 카드형으로 만들지 쇼츠형으로 만들지 고를 수 있어요.",
    studioStepUpload: "원문 파일 업로드",
    studioStepGenerate: "아이디어, 쇼츠 장면, 퀴즈 생성",
    studioStepOpen: "생성된 팩을 앱에서 열기",
    openAiStudio: "AI 스튜디오 열기",
    libraryKicker: "라이브러리",
    libraryTitle: "팩 보관함",
    libraryBody: "생성한 팩이 기본 예시 팩과 함께 여기에 보여요.",
    libraryCompleted(completed, total) {
      return `${completed}/${total} 완료`;
    },
    comingSoon: "준비 중",
    quickCreateCta: "새로 만들기",
    quickCreateTitle: "새 팩 만들기",
    quickCreateBody:
      "가장 빠른 시작 방법을 골라보세요. 제목이나 세부 정보는 다음 화면에서 바꿀 수 있어요.",
    packFormatTitle: "결과 형식 고르기",
    packFormatBody:
      "카드형은 레슨 카드와 복습 중심으로 만들고, 쇼츠형은 세로 영상용 장면과 내레이션, 퀴즈 중심으로 만들어요.",
    packFormatShortsTitle: "쇼츠형",
    packFormatShortsBody: "장면, TTS, 이미지, 퀴즈로 세로형 짧은 강의를 만들어요.",
    packFormatCardsTitle: "카드형",
    packFormatCardsBody: "레슨 카드, 복습 포인트, 연습 문제로 차근차근 공부해요.",
    packFormatShortsChip: "쇼츠",
    packFormatCardsChip: "카드",
    quickCreateTextTitle: "텍스트 붙여넣기",
    quickCreateTextBody: "노트, 글 일부, 챕터 발췌문으로 바로 시작해요.",
    quickCreateFileTitle: "파일 업로드",
    quickCreateFileBody: "PDF, DOCX, HWP 또는 .txt, .md, .csv, .html 같은 텍스트 파일로 시작해요.",
    quickCreateAdvanced: "전체 스튜디오 열기",
    ideasDone(completed, total) {
      return `${completed}/${total} 아이디어 완료`;
    },
    studioTopTitle: "새 팩 만들기",
    studioTopCaption: "원문 추가",
    backendTargetKicker: "백엔드 연결",
    backendTargetTitle: "새 학습 팩 만들기",
    backendTargetBody:
      "앱이 원문을 백엔드로 보내면, 백엔드가 카드형 학습 데이터나 쇼츠형 강의 스토리보드와 오디오, 퀴즈 데이터로 바꿔줘요.",
    apiBaseUrl: "API 주소",
    apiBaseUrlHint: "실기기 테스트에서는 localhost 대신 맥의 로컬 IP를 쓰는 게 안전해요.",
    packTitle: "팩 제목",
    packTitlePlaceholder: "팩 제목 입력",
    author: "저자",
    authorPlaceholder: "저자",
    category: "카테고리",
    categoryPlaceholder: "카테고리",
    sourceText: "원문 텍스트",
    sourceTextPlaceholder: "원문 텍스트를 여기에 붙여넣어 주세요",
    sourceTextHint() {
      return "노트나 발췌문처럼 짧은 텍스트도 가능해요. 다만 텍스트가 많을수록 결과는 더 안정적일 수 있어요.";
    },
    sourceFile: "원문 파일",
    ready: "준비됨",
    chooseSourceDocument: "원문 문서 선택",
    pdfBackendExtracted(fileSize) {
      return `${fileSize} · PDF 텍스트는 백엔드에서 추출돼요`;
    },
    textFileLoaded(fileSize, characterCount) {
      return `${fileSize} · ${characterCount.toLocaleString()}자`;
    },
    supportedUploadHint: ".pdf, .docx, .hwp, .txt, .md, .csv, .json, .html, .xml, .rtf 업로드 가능",
    uploadLargeFileWarning: "너무 많은 분량의 파일을 업로드하면 일부 내용이 누락될 수 있습니다.",
    ocrLanguageHint: "스캔된 PDF·이미지는 한국어, 영어만 지원됩니다.",
    pdfUpload: "PDF 업로드",
    preview: "미리보기",
    pdfPreviewBody:
      "이 PDF는 백엔드로 업로드된 뒤 텍스트로 변환되고, 그 텍스트로 학습 팩을 만들게 됩니다.",
    chooseAnotherFile: "다른 파일 고르기",
    removeFile: "파일 제거",
    fileHint() {
      return "짧은 발췌문도 가능해요. 다만 읽을 수 있는 텍스트가 많을수록 결과는 더 안정적일 수 있어요.";
    },
    couldNotGeneratePack: "팩을 생성하지 못했어요",
    generatingPack: "SnapMind 생성 중...",
    generatingPackHint: "분량에 따라 10분 이상 걸릴 수 있어요.",
    generatingPackEta: (secs) => {
      const mins = Math.ceil(secs / 60);
      return mins <= 1 ? "약 1분 예상" : `약 ${mins}분 예상`;
    },
    longContentWarning: "분량이 너무 긴 경우 일부 내용이 빠질 수 있습니다.",
    generatePack: "팩 생성하기",
    noFileSelected: "선택된 파일이 없어요.",
    unsupportedFile:
      ".pdf, .docx, .hwp, .txt, .md, .csv, .json, .html, .xml, .rtf 같은 지원 파일을 올려주세요.",
    selectedFileEmpty: "선택한 파일이 비어 있어요.",
    couldNotReadFile: "선택한 파일을 읽지 못했어요.",
    uploadBeforeGenerate: "팩을 만들기 전에 원문 텍스트를 붙여넣거나 파일을 먼저 올려주세요.",
    backendRouteNotFound(url) {
      return `${url}에서 백엔드 경로를 찾지 못했어요. EXPO_PUBLIC_API_URL을 확인해주세요.`;
    },
    generationTimeout:
      "생성이 예상보다 오래 걸리고 있어요. 서버가 아직 작업 중일 수 있으니 잠시 후 다시 확인해주세요.",
    generationFailed: "팩 생성에 실패했어요.",
    generationFailedShort: "생성 실패",
    retry: "다시 시도",
    pasteTextTitle: "복사한 텍스트 붙여넣기",
    pasteTextBody: "학습할 텍스트를 아래에 붙여넣으세요",
    pasteTextPlaceholder: "여기에 텍스트 붙여넣기",
    addButton: "생성하기",
    detailDescription: "설명",
    detailPrompt: "이제 한 아이디어씩 차근차근 이해해볼까요?",
    mainIdeas: "핵심 아이디어",
    mainIdeasBody: "이전 아이디어를 끝내면 다음이 열리도록 해서 부담 없이 이어서 볼 수 있어요.",
    deletePack: "삭제",
    deletePackConfirmTitle: "팩 삭제",
    deletePackConfirmMessage: "이 팩을 삭제할까요? 되돌릴 수 없어요.",
    deletePackCancel: "취소",
    deletePackConfirm: "삭제",
  },
};

const LESSON_UI_COPY = {
  en: {
    summary: "Summary",
    summaryHeading: "Key recap",
    reflection: "Reflection",
    maybeLater: "Maybe later",
    takeQuiz: "Take the quiz",
    finishIdea: "Finish idea",
    shortLesson: "Short lesson",
    hookLabel: "Hook",
    learningGoalLabel: "Learning goal",
    videoPreparing: "Preparing video...",
    videoUnavailable: "Video is unavailable for this short right now.",
    playVideo: "Play video",
    pauseVideo: "Pause video",
    playAudio: "Play audio",
    pauseAudio: "Pause audio",
    previousScene: "Previous scene",
    nextScene: "Next scene",
    startQuiz: "Start quiz",
    showSubtitles: "Show subtitles",
    hideSubtitles: "Hide subtitles",
    audioPreparing: "Preparing audio...",
    audioUnavailable: "Audio is unavailable for this short right now.",
    continueWithoutAudio: "Continue without audio",
    continueWithoutVideo: "Continue without video",
    swipeUpForNextShort: "Swipe up for the next short",
    swipeDownForPreviousShort: "Swipe down to revisit the previous short",
    lectureComplete: "Short complete",
    lectureCompleteBody: "The short lecture is finished. Take the quiz to lock it in.",
    sceneLabel(index, total) {
      return `Scene ${index} of ${total}`;
    },
    practice: "Practice",
    practiceQuestion: "Practice question",
    practiceComingSoon: "Practice coming soon",
    practiceComingSoonBody: "This idea does not have quiz questions yet.",
    previous: "Previous",
    nextQuestion: "Next question",
    aiTutorTitle: "AI Tutor",
    aiDockTitle: "Ask ChatGPT",
    aiDockHint: "Get a simpler explanation, a quick example, or help with the quiz.",
    groundedInIdea: "Explains this idea simply",
    askTitle: "Ask about what feels unclear",
    askBody: "Try asking for a simpler explanation, an example, or how to apply this idea.",
    askPlaceholder: "Ask about this idea",
    thinking: "Thinking...",
    answerError: "Could not get an answer right now.",
    correct: "Exactly.",
    almost: "Close, but not quite.",
    strongUnderstanding: "Strong understanding",
    strongUnderstandingBody: "You cleared every check in this idea.",
    reviewRetry: "Review the explanations, then retry the weaker questions if needed.",
    userLabel: "You",
    tutorLabel: "AI tutor",
    quickExplainLabel: "Simpler",
    quickExampleLabel: "Example",
    quickWhyLabel: "Why it matters",
    quickConnectLabel: "Big picture",
    quickRememberLabel: "Remember this",
    quickQuestionLabel: "Solve this",
    quickChoicesLabel: "Compare options",
    quickExplainPrompt(title) {
      return title ? `Explain "${title}" in simpler terms.` : "Explain this in simpler terms.";
    },
    quickExamplePrompt(title) {
      return title ? `Give me a short example of "${title}".` : "Give me a short example.";
    },
    quickWhyPrompt(title) {
      return title ? `Why does "${title}" matter here?` : "Why does this matter?";
    },
    quickConnectPrompt(title) {
      return title
        ? `How does "${title}" connect to the bigger picture in this idea?`
        : "How does this connect to the bigger picture in this idea?";
    },
    quickRememberPrompt(title) {
      return title
        ? `What are the 2 or 3 things I should remember from "${title}"?`
        : "What are the 2 or 3 things I should remember here?";
    },
    quickQuestionPrompt(question) {
      return question
        ? `How should I approach this quiz question? "${question}"`
        : "How should I approach this quiz question?";
    },
    quickChoicesPrompt(question) {
      return question
        ? `Help me compare the answer choices for this question: "${question}"`
        : "Help me compare the answer choices for this question.";
    },
    finalReview: "Final review",
    finalReviewHeading: "Whole-pack check",
    finalReviewBody:
      "You finished every idea. Use this last quiz to check whether the full picture still holds together.",
    finalReviewReady: "Take the final review",
    finishFinalReview: "See result",
    finalReviewRetry: "Retry final review",
    finalReviewComplete: "Pack complete",
    finalReviewPending: "One more check",
    finalReviewScore(score, total) {
      return `Final review: ${score}/${total}`;
    },
    finalReviewResult(score, total) {
      return `You finished the whole pack and landed ${score}/${total} on the final review.`;
    },
    continueWith(title) {
      return `Continue with ${title}`;
    },
    startReading: "Start Reading",
    continueReading: "Continue Reading",
    backHome: "Back to home",
    reviewPack: "Review the full pack",
    niceWork: "Nice work",
    completionBody:
      "You learned and practiced something new. The next idea is ready whenever you are.",
    cardLabel(index, total) {
      return `Card ${index} of ${total}`;
    },
    questionLabel(index, total) {
      return `Question ${index} of ${total}`;
    },
    practiceLabel(index, total) {
      return `Practice ${index} of ${total}`;
    },
    correctCount(correct, total) {
      return `${correct}/${total} correct`;
    },
  },
  ko: {
    summary: "요약",
    summaryHeading: "핵심 요약",
    reflection: "돌아보기",
    maybeLater: "나중에",
    takeQuiz: "퀴즈 풀기",
    finishIdea: "아이디어 마치기",
    shortLesson: "쇼츠 강의",
    hookLabel: "후킹 포인트",
    learningGoalLabel: "이번 목표",
    videoPreparing: "영상 준비 중...",
    videoUnavailable: "이 쇼츠 영상은 지금 사용할 수 없어요.",
    playVideo: "영상 재생",
    pauseVideo: "영상 멈춤",
    playAudio: "오디오 재생",
    pauseAudio: "오디오 멈춤",
    previousScene: "이전 장면",
    nextScene: "다음 장면",
    startQuiz: "퀴즈 시작",
    showSubtitles: "자막 켜기",
    hideSubtitles: "자막 끄기",
    audioPreparing: "오디오 준비 중...",
    audioUnavailable: "이 쇼츠의 오디오는 지금 사용할 수 없어요.",
    continueWithoutAudio: "오디오 없이 계속",
    continueWithoutVideo: "영상 없이 계속",
    swipeUpForNextShort: "위로 넘겨 다음 쇼츠 보기",
    swipeDownForPreviousShort: "아래로 넘겨 이전 쇼츠 다시 보기",
    lectureComplete: "쇼츠를 다 들었어요",
    lectureCompleteBody: "짧은 강의를 끝냈어요. 이제 퀴즈로 바로 확인해보세요.",
    sceneLabel(index, total) {
      return `장면 ${index}/${total}`;
    },
    practice: "퀴즈",
    practiceQuestion: "퀴즈 문제",
    practiceComingSoon: "퀴즈 준비 중",
    practiceComingSoonBody: "이 아이디어에는 아직 퀴즈가 없어요.",
    previous: "이전",
    nextQuestion: "다음 문제",
    aiTutorTitle: "AI 튜터",
    aiDockTitle: "ChatGPT에게 물어보기",
    aiDockHint: "쉽게 설명, 예시, 문제 풀이 도움을 바로 받아보세요.",
    groundedInIdea: "이 아이디어를 쉽게 풀어 설명해요",
    askTitle: "헷갈리는 부분을 물어보세요",
    askBody: "더 쉽게 설명해달라거나, 예시나 활용법을 물어보면 좋아요.",
    askPlaceholder: "이 아이디어에 대해 질문해보세요",
    thinking: "생각 중...",
    answerError: "지금은 답변을 가져오지 못했어요.",
    correct: "정확해요.",
    almost: "조금만 더 보완하면 돼요.",
    strongUnderstanding: "잘 이해했어요",
    strongUnderstandingBody: "이 아이디어의 확인 문제를 모두 통과했어요.",
    reviewRetry: "해설을 다시 보고 헷갈린 문제를 한 번 더 풀어보세요.",
    userLabel: "나",
    tutorLabel: "AI 튜터",
    quickExplainLabel: "쉽게 설명",
    quickExampleLabel: "예시",
    quickWhyLabel: "왜 중요한지",
    quickConnectLabel: "전체 흐름",
    quickRememberLabel: "기억할 핵심",
    quickQuestionLabel: "문제 풀이",
    quickChoicesLabel: "보기 비교",
    quickExplainPrompt(title) {
      return title ? `"${title}"를 더 쉽게 설명해줘.` : "지금 배우는 내용을 더 쉽게 설명해줘.";
    },
    quickExamplePrompt(title) {
      return title ? `"${title}"에 대한 짧은 예시를 들어줘.` : "짧은 예시를 들어줘.";
    },
    quickWhyPrompt(title) {
      return title ? `"${title}"가 왜 중요한지 알려줘.` : "왜 중요한지 알려줘.";
    },
    quickConnectPrompt(title) {
      return title
        ? `"${title}"가 이 아이디어의 전체 흐름에서 어디에 연결되는지 설명해줘.`
        : "이 아이디어가 전체 흐름에서 어디에 연결되는지 설명해줘.";
    },
    quickRememberPrompt(title) {
      return title
        ? `"${title}"에서 꼭 기억할 핵심 2~3가지를 짚어줘.`
        : "꼭 기억할 핵심 2~3가지를 짚어줘.";
    },
    quickQuestionPrompt(question) {
      return question
        ? `이 문제를 풀 때 무엇부터 보면 되는지 설명해줘. 문제: "${question}"`
        : "이 문제를 풀 때 무엇부터 보면 되는지 설명해줘.";
    },
    quickChoicesPrompt(question) {
      return question
        ? `이 문제의 보기들을 어떻게 비교하면 되는지 설명해줘. 문제: "${question}"`
        : "이 문제의 보기들을 어떻게 비교하면 되는지 설명해줘.";
    },
    finalReview: "종합 퀴즈",
    finalReviewHeading: "전체 이해도 확인",
    finalReviewBody:
      "모든 아이디어를 끝냈어요. 마지막 퀴즈로 전체 흐름까지 제대로 잡혔는지 확인해보세요.",
    finalReviewReady: "종합 퀴즈 풀기",
    finishFinalReview: "결과 보기",
    finalReviewRetry: "종합 퀴즈 다시 풀기",
    finalReviewComplete: "팩 완료",
    finalReviewPending: "마지막 확인만 남았어요",
    finalReviewScore(score, total) {
      return `종합 퀴즈 ${score}/${total}`;
    },
    finalReviewResult(score, total) {
      return `전체 팩을 끝냈고, 종합 퀴즈에서 ${score}/${total}를 맞혔어요.`;
    },
    continueWith(title) {
      return `${title} 이어서 보기`;
    },
    startReading: "학습 시작",
    continueReading: "이어서 보기",
    backHome: "홈으로",
    reviewPack: "팩 전체 다시 보기",
    niceWork: "좋았어요",
    completionBody:
      "하나를 더 배우고 바로 연습까지 마쳤어요. 다음 아이디어도 이어서 볼 수 있어요.",
    cardLabel(index, total) {
      return `카드 ${index}/${total}`;
    },
    questionLabel(index, total) {
      return `문제 ${index}/${total}`;
    },
    practiceLabel(index, total) {
      return `퀴즈 ${index}/${total}`;
    },
    correctCount(correct, total) {
      return `${correct}/${total} 정답`;
    },
  },
  da: {
    keyIdeas: "Hovednøgler",
    timePerIdea: "Tid per ide",
    startIdea(title) {
      return title ? `Start ${title}` : "Åbn pakke";
    },
    startStudy: "Start at lære",
    summary: "Resume",
    summaryHeading: "Kort opsummering",
    reflection: "Refleksion",
    maybeLater: "Senere",
    takeQuiz: "Tag quizzen",
    finishIdea: "Afslut ide",
    shortLesson: "Kort lektion",
    hookLabel: "Hook",
    learningGoalLabel: "Læringsmål",
    videoPreparing: "Forbereder video...",
    videoUnavailable: "Video er ikke tilgængelig for denne korte lektion lige nu.",
    playVideo: "Afspil video",
    pauseVideo: "Pause video",
    playAudio: "Afspil lyd",
    pauseAudio: "Pause lyd",
    previousScene: "Forrige scene",
    nextScene: "Næste scene",
    startQuiz: "Start quiz",
    showSubtitles: "Vis undertekster",
    hideSubtitles: "Skjul undertekster",
    audioPreparing: "Forbereder lyd...",
    audioUnavailable: "Lyd er ikke tilgængelig for denne korte lektion lige nu.",
    continueWithoutAudio: "Fortsæt uden lyd",
    continueWithoutVideo: "Fortsæt uden video",
    swipeUpForNextShort: "Stryg op for naeste korte lektion",
    swipeDownForPreviousShort: "Stryg ned for at se den forrige korte lektion igen",
    lectureComplete: "Kort lektion færdig",
    lectureCompleteBody: "Den korte lektion er færdig. Tag quizzen for at fastholde det vigtigste.",
    sceneLabel(index, total) {
      return `Scene ${index} af ${total}`;
    },
    practice: "Quiz",
    practiceQuestion: "Quizsporgsmal",
    practiceComingSoon: "Quiz kommer snart",
    practiceComingSoonBody: "Denne ide har ikke spørgsmål endnu.",
    previous: "Forrige",
    nextQuestion: "Naeste sporgsmal",
    aiTutorTitle: "AI tutor",
    aiDockTitle: "Sporg AI",
    aiDockHint: "Fa en enklere forklaring, et eksempel eller quizhjaelp med det samme.",
    groundedInIdea: "Forklarer denne ide enkelt",
    askTitle: "Sporg om det, der er uklart",
    askBody: "Bed om en enklere forklaring, et eksempel eller hvordan ideen bruges.",
    askPlaceholder: "Sporg om denne ide",
    thinking: "Taenker...",
    answerError: "Kunne ikke hente et svar lige nu.",
    correct: "Lige præcis.",
    almost: "Tæt på, men ikke helt.",
    strongUnderstanding: "Stærk forståelse",
    strongUnderstandingBody: "Du klarede alle tjek i denne ide.",
    reviewRetry: "Gennemga forklaringerne og prov de svaerere spørgsmål igen.",
    userLabel: "Dig",
    tutorLabel: "AI tutor",
    quickExplainLabel: "Forklar enklere",
    quickExampleLabel: "Eksempel",
    quickWhyLabel: "Hvorfor vigtigt",
    quickConnectLabel: "Helheden",
    quickRememberLabel: "Husk dette",
    quickQuestionLabel: "Los opgaven",
    quickChoicesLabel: "Sammenlign svar",
    quickExplainPrompt(title) {
      return title ? `Forklar "${title}" enklere.` : "Forklar dette enklere.";
    },
    quickExamplePrompt(title) {
      return title ? `Giv et kort eksempel pa "${title}".` : "Giv et kort eksempel.";
    },
    quickWhyPrompt(title) {
      return title ? `Hvorfor er "${title}" vigtigt her?` : "Hvorfor er dette vigtigt?";
    },
    quickConnectPrompt(title) {
      return title
        ? `Hvordan haenger "${title}" sammen med helheden i denne ide?`
        : "Hvordan haenger dette sammen med helheden i denne ide?";
    },
    quickRememberPrompt(title) {
      return title
        ? `Hvilke 2 eller 3 ting skal jeg huske fra "${title}"?`
        : "Hvilke 2 eller 3 ting skal jeg huske herfra?";
    },
    quickQuestionPrompt(question) {
      return question
        ? `Hvordan skal jeg gribe dette quizsporgsmal an? "${question}"`
        : "Hvordan skal jeg gribe dette quizsporgsmal an?";
    },
    quickChoicesPrompt(question) {
      return question
        ? `Hjaelp mig med at sammenligne svarmulighederne til dette sporgsmal: "${question}"`
        : "Hjaelp mig med at sammenligne svarmulighederne til dette sporgsmal.";
    },
    finalReview: "Samlet quiz",
    finalReviewHeading: "Tjek hele pakken",
    finalReviewBody:
      "Du er færdig med alle ideer. Tag den sidste quiz og se, om helheden stadig hænger sammen.",
    finalReviewReady: "Tag den samlede quiz",
    finishFinalReview: "Se resultat",
    finalReviewRetry: "Tag quizzen igen",
    finalReviewComplete: "Pakken er gennemført",
    finalReviewPending: "En sidste kontrol",
    finalReviewScore(score, total) {
      return `Samlet quiz: ${score}/${total}`;
    },
    finalReviewResult(score, total) {
      return `Du har gennemført hele pakken og fik ${score}/${total} i den samlede quiz.`;
    },
    continueWith(title) {
      return `Fortsæt med ${title}`;
    },
    startReading: "Begynd at læse",
    continueReading: "Fortsæt med at læse",
    backHome: "Til forsiden",
    reviewPack: "Gennemga hele pakken",
    niceWork: "Flot arbejde",
    completionBody:
      "Du lærte noget nyt og fik øvet det med det samme. Den næste ide er klar, når du er.",
    cardLabel(index, total) {
      return `Kort ${index} af ${total}`;
    },
    questionLabel(index, total) {
      return `Sporgsmal ${index} af ${total}`;
    },
    practiceLabel(index, total) {
      return `Quiz ${index} af ${total}`;
    },
    correctCount(correct, total) {
      return `${correct}/${total} rigtige`;
    },
  },
};

function inferLessonLanguage(text) {
  const sample = String(text || "").trim();

  if (!sample) {
    return "en";
  }

  const hangulCount = (sample.match(/[가-힣]/gu) || []).length;

  if (hangulCount >= 2) {
    return "ko";
  }

  const lowerSample = sample.toLowerCase();

  if (/[æøå]/iu.test(lowerSample)) {
    return "da";
  }

  if (/\b(og|ikke|med|der|som|til|fra|eller)\b/u.test(lowerSample)) {
    return "da";
  }

  return "en";
}

function getPackSampleText(pack) {
  return [
    pack?.title,
    pack?.subtitle,
    pack?.description,
    pack?.heroLine,
    ...(pack?.ideas || []).flatMap((idea) => [
      idea?.title,
      idea?.teaser,
      idea?.short?.hook,
      idea?.short?.learningGoal,
      idea?.short?.narrationScript,
      ...(idea?.short?.scenes || []).flatMap((scene) => [
        scene?.headline,
        scene?.body,
        scene?.narration,
        ...(scene?.callouts || []),
      ]),
      ...(idea?.summaryBullets || []),
      idea?.reflectionPrompt,
    ]),
    ...getPackReviewQuestions(pack).flatMap((question) => [
      question.question,
      ...(question.options || []),
      question.explanation,
    ]),
  ]
    .filter(Boolean)
    .join(" ");
}

function getPackDisplaySubtitle(pack) {
  const title = String(getCompactTitle(pack?.title, 6) || pack?.title || "").trim();

  if (!title) {
    return String(pack?.subtitle || "").trim();
  }

  const languageCode = inferLessonLanguage(getPackSampleText(pack));

  if (languageCode === "ko") {
    return isShortsPack(pack) ? `${title} 쇼츠로 이해하기` : `${title}를 쉽게 이해하기`;
  }

  if (languageCode === "da") {
    return isShortsPack(pack) ? `Forstå ${title} i korte lektioner` : `Forstå ${title}`;
  }

  return isShortsPack(pack) ? `Learn ${title} as short lessons` : `Understanding ${title}`;
}

function getLessonSampleText(pack, idea) {
  return [
    pack?.title,
    idea?.title,
    idea?.short?.hook,
    idea?.short?.learningGoal,
    idea?.short?.narrationScript,
    ...(idea?.short?.scenes || []).flatMap((scene) => [
      scene?.headline,
      scene?.body,
      scene?.narration,
      ...(scene?.callouts || []),
    ]),
    ...(idea?.summaryBullets || []),
    idea?.reflectionPrompt,
    ...(idea?.lessonCards || []).flatMap((card) => [
      card?.eyebrow,
      card?.title,
      card?.body,
      card?.support,
    ]),
    ...getPracticeQuestions(idea).flatMap((question) => [
      question.question,
      ...(question.options || []),
      question.explanation,
    ]),
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeReflectionPromptForDisplay(prompt, languageCode) {
  const cleaned = String(prompt || "").replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return "";
  }

  if (languageCode === "ko") {
    return cleaned
      .replace(/하나씩\s*(적어\s*보세요|적어보세요|써\s*보세요|써보세요)/gu, "하나씩 떠올려 보세요")
      .replace(
        /하나씩\s*(소리\s*내어\s*말해\s*보세요|소리내어말해보세요|말해\s*보세요|말해보세요)/gu,
        "하나씩 떠올려 보세요"
      )
      .replace(
        /(적어\s*보세요|적어보세요|써\s*보세요|써보세요|기록해\s*보세요|기록해보세요|메모해\s*보세요|메모해보세요|소리\s*내어\s*말해\s*보세요|소리내어말해보세요|말해\s*보세요|말해보세요)/gu,
        "생각해 보세요"
      );
  }

  if (languageCode === "en") {
    return cleaned
      .replace(/\b(write down|jot down|type out)\b/giu, "think through")
      .replace(/\b(say out loud|say aloud|speak aloud)\b/giu, "think through")
      .replace(/\bwrite\b/giu, "think about")
      .replace(/\blist\b/giu, "think through");
  }

  if (languageCode === "da") {
    return cleaned
      .replace(/\b(skriv ned|noter)\b/giu, "tænk over")
      .replace(/\b(sig det højt|sig højt)\b/giu, "tænk over")
      .replace(/\bskriv\b/giu, "tænk over");
  }

  return cleaned;
}

function getAppUiText(appLanguage) {
  return APP_UI_COPY[appLanguage] || APP_UI_COPY.ko;
}

function getLessonUiText(pack, idea, preferredLanguage) {
  if (preferredLanguage && LESSON_UI_COPY[preferredLanguage]) {
    return LESSON_UI_COPY[preferredLanguage];
  }

  const languageCode = inferLessonLanguage(getLessonSampleText(pack, idea));
  return LESSON_UI_COPY[languageCode] || LESSON_UI_COPY.en;
}

function getPackUiText(pack, preferredLanguage) {
  if (preferredLanguage && LESSON_UI_COPY[preferredLanguage]) {
    return LESSON_UI_COPY[preferredLanguage];
  }

  const languageCode = inferLessonLanguage(getPackSampleText(pack));
  return LESSON_UI_COPY[languageCode] || LESSON_UI_COPY.en;
}

const DELETE_SWIPE_THRESHOLD = 80;
const SHORT_CLIP_SWIPE_THRESHOLD = 72;

function SwipeableLibraryCard({ isDeletable, onDelete, children }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        isDeletable && gesture.dx < -5 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 0.5,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx < 0) {
          translateX.setValue(Math.max(gesture.dx, -DELETE_SWIPE_THRESHOLD - 20));
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -DELETE_SWIPE_THRESHOLD / 2) {
          Animated.spring(translateX, {
            toValue: -DELETE_SWIPE_THRESHOLD,
            useNativeDriver: true,
          }).start();
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const closeSwipe = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  return (
    <View style={styles.swipeableWrapper}>
      <Pressable
        onPress={() => {
          closeSwipe();
          onDelete();
        }}
        style={styles.swipeDeleteBg}
      >
        <Feather color="#FFF" name="trash-2" size={22} />
      </Pressable>
      <Animated.View
        {...panResponder.panHandlers}
        style={{ transform: [{ translateX }] }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

function serializeChatMessagesForApi(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function SurfaceButton({ label, onPress, icon, secondary, disabled, loading, style, labelStyle }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.primaryButton,
        secondary && styles.secondaryButton,
        (disabled || loading) && styles.disabledButton,
        style,
      ]}
    >
      <View style={styles.primaryButtonRow}>
        {loading ? (
          <ActivityIndicator color={secondary ? palette.ink : "#FFF8EA"} />
        ) : icon ? (
          <MaterialIcons
            color={secondary ? palette.ink : "#FFF8EA"}
            name={icon}
            size={20}
          />
        ) : null}
        <Text
          style={[
            styles.primaryButtonLabel,
            secondary && styles.secondaryButtonLabel,
            (disabled || loading) && styles.disabledButtonLabel,
            labelStyle,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function SectionHeader({ kicker, title, body }) {
  return (
    <View style={styles.sectionHeader}>
      {kicker ? <Text style={styles.sectionKicker}>{kicker}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {body ? <Text style={styles.sectionBody}>{body}</Text> : null}
    </View>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statCardTop}>
        <Text style={styles.statLabel}>{label}</Text>
        <MaterialIcons color={palette.accent} name={icon} size={24} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function LanguagePicker({ appLanguage, appText, onChangeLanguage, compact }) {
  return (
      <View style={[styles.languageCard, compact && styles.languageCardCompact]}>
      {compact ? null : (
        <SectionHeader
          kicker={appText.languageKicker}
          title={appText.languageTitle}
          body={appText.languageBody}
        />
      )}
      <View style={[styles.languageToggleRow, compact && styles.languageToggleRowCompact]}>
        {APP_LANGUAGE_OPTIONS.map((option) => {
          const isActive = option.code === appLanguage;

          return (
            <Pressable
              key={option.code}
              accessibilityRole="button"
              onPress={() => onChangeLanguage(option.code)}
              style={[
                styles.languageChip,
                compact && styles.languageChipCompact,
                isActive && styles.languageChipActive,
              ]}
            >
              <Text
                style={[
                  styles.languageChipLabel,
                  compact && styles.languageChipLabelCompact,
                  isActive && styles.languageChipLabelActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PackFormatPicker({ appText, selectedPackFormat, onChange, compact = false }) {
  return (
    <View style={[styles.packFormatCard, compact && styles.packFormatCardCompact]}>
      {compact ? null : (
        <>
          <Text style={styles.packFormatLabel}>{appText.packFormatTitle}</Text>
          <Text style={styles.packFormatBody}>{appText.packFormatBody}</Text>
        </>
      )}

      <View style={[styles.packFormatRow, compact && styles.packFormatRowCompact]}>
        {[
          {
            value: "shorts",
            label: appText.packFormatShortsTitle,
            body: appText.packFormatShortsBody,
            icon: "smart-display",
          },
          {
            value: "cards",
            label: appText.packFormatCardsTitle,
            body: appText.packFormatCardsBody,
            icon: "style",
          },
        ].map((option) => {
          const isActive = selectedPackFormat === option.value;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              onPress={() => onChange(option.value)}
              style={[
                styles.packFormatOption,
                compact && styles.packFormatOptionCompact,
                isActive && styles.packFormatOptionActive,
              ]}
            >
              <View style={[styles.packFormatIconWrap, isActive && styles.packFormatIconWrapActive]}>
                <MaterialIcons
                  color={isActive ? "#FFF8EA" : palette.accent}
                  name={option.icon}
                  size={18}
                />
              </View>
              <View style={styles.packFormatTextWrap}>
                <Text style={[styles.packFormatOptionTitle, isActive && styles.packFormatOptionTitleActive]}>
                  {option.label}
                </Text>
                <Text style={[styles.packFormatOptionBody, isActive && styles.packFormatOptionBodyActive]}>
                  {option.body}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function CreatePackSheet({
  appText,
  onChangePackFormat,
  onClose,
  onOpenMode,
  onDismiss,
  selectedPackFormat,
  visible,
}) {
  return (
    <Modal animationType="fade" onDismiss={onDismiss} onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.createSheetOverlay}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.createSheetBackdrop} />
        <SafeAreaView style={styles.createSheetSafeArea}>
          <View style={styles.createSheetCard}>
            <View style={styles.createSheetHandle} />
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.createSheetClose}>
              <Feather color={palette.ink} name="x" size={24} />
            </Pressable>

            <Text style={{ fontSize: 11, color: palette.warning || "#b8860b", textAlign: "center", marginBottom: 8 }}>{appText.uploadLargeFileWarning}</Text>

            <PackFormatPicker
              appText={appText}
              compact
              onChange={onChangePackFormat}
              selectedPackFormat={selectedPackFormat}
            />

            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenMode("file")}
              style={styles.createSheetPillButton}
            >
              <MaterialIcons color={palette.accent} name="upload-file" size={22} />
              <Text style={styles.createSheetPillLabel}>{appText.quickCreateFileTitle}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenMode("text")}
              style={styles.createSheetPillButton}
            >
              <MaterialIcons color={palette.accent} name="content-paste" size={22} />
              <Text style={styles.createSheetPillLabel}>{appText.quickCreateTextTitle}</Text>
            </Pressable>

            <Text style={{ fontSize: 11, color: palette.muted, textAlign: "center", marginTop: 12 }}>{appText.ocrLanguageHint}</Text>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function ProfileMenu({ appLanguage, appText, onChangeLanguage, onClose, onLogout, user, visible }) {
  if (!visible) {
    return null;
  }

  const displayName = user?.user_metadata?.full_name || user?.email || "";
  const email = user?.email || "";

  return (
    <View pointerEvents="box-none" style={styles.profileMenuLayer}>
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.profileMenuBackdrop} />
      <View style={styles.profileMenuCard}>
        {/* User info */}
        <View style={styles.profileMenuUserRow}>
          {user?.user_metadata?.avatar_url ? (
            <Image source={{ uri: user.user_metadata.avatar_url }} style={styles.profileMenuAvatar} />
          ) : (
            <View style={[styles.profileMenuAvatar, { backgroundColor: palette.line, alignItems: "center", justifyContent: "center" }]}>
              <Feather color={palette.muted} name="user" size={16} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            {displayName ? <Text style={styles.profileMenuName}>{displayName}</Text> : null}
            {email ? <Text style={styles.profileMenuEmail}>{email}</Text> : null}
          </View>
        </View>

        {/* Language */}
        <Text style={styles.profileMenuLabel}>{appText.languageKicker}</Text>
        <View style={styles.profileMenuLanguageRow}>
          {APP_LANGUAGE_OPTIONS.map((option) => {
            const isActive = option.code === appLanguage;

            return (
              <Pressable
                key={option.code}
                accessibilityRole="button"
                onPress={() => {
                  onChangeLanguage(option.code);
                  onClose();
                }}
                style={[styles.profileMenuLanguageChip, isActive && styles.profileMenuLanguageChipActive]}
              >
                <Text
                  style={[
                    styles.profileMenuLanguageLabel,
                    isActive && styles.profileMenuLanguageLabelActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Logout */}
        <Pressable
          accessibilityRole="button"
          onPress={() => { onClose(); onLogout(); }}
          style={styles.profileMenuLogoutRow}
        >
          <Feather color={palette.danger} name="log-out" size={16} />
          <Text style={styles.profileMenuLogoutText}>{appLanguage === "ko" ? "로그아웃" : "Log out"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BookCover({ pack, compact }) {
  return (
    <View
      style={[
        styles.coverCard,
        compact && styles.coverCardCompact,
        { backgroundColor: pack.accent },
      ]}
    >
      <View style={styles.coverGlow} />
      <View style={styles.coverTitleWrap}>
        <Text
          numberOfLines={compact ? 5 : 6}
          style={[styles.coverTitle, compact && styles.coverTitleCompact]}
        >
          {pack.title}
        </Text>
      </View>
    </View>
  );
}

function ProgressPills({ total, activeIndex }) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: total }).map((_, index) => {
        const isActive = index === activeIndex;
        const isDone = index < activeIndex;

        return (
          <View
            key={`pill-${index}`}
            style={[
              styles.progressPill,
              isDone && styles.progressPillDone,
              isActive && styles.progressPillActive,
            ]}
          />
        );
      })}
    </View>
  );
}

function IdeaRow({ idea, state, onPress }) {
  const isLocked = state === "locked";
  const isCompleted = state === "completed";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isLocked}
      onPress={onPress}
      style={[styles.ideaRow, isLocked && styles.ideaRowLocked]}
    >
      <View style={styles.ideaRowLeft}>
        <View style={styles.ideaRowIconShell}>
          <MaterialIcons color={palette.accent} name={idea.icon} size={22} />
        </View>
        <View style={styles.ideaRowText}>
          <Text
            numberOfLines={2}
            style={[styles.ideaRowTitle, isLocked && styles.ideaRowTitleLocked]}
          >
            {idea.title}
          </Text>
          <Text style={styles.ideaRowTeaser}>{idea.teaser}</Text>
        </View>
      </View>

      {isCompleted ? (
        <MaterialIcons color={palette.success} name="check-circle" size={28} />
      ) : isLocked ? (
        <MaterialIcons color={palette.ink} name="lock-outline" size={26} />
      ) : (
        <Feather color={palette.ink} name="chevron-right" size={24} />
      )}
    </Pressable>
  );
}

function AnimatedProgressBar({ progress }) {
  const animatedWidth = useRef(new Animated.Value(Math.max(5, progress * 100))).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: Math.max(5, progress * 100),
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  return (
    <View style={styles.progressBarTrack}>
      <Animated.View
        style={[
          styles.progressBarFill,
          { width: animatedWidth.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) },
        ]}
      />
    </View>
  );
}

function ShortsSeekBar({
  bubbleLabel,
  disabled,
  onScrubEnd,
  onScrubStart,
  onScrubUpdate,
  progress,
  showBubble,
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const normalizedProgress = clampNumber(Number(progress || 0), 0, 1);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !disabled && trackWidth > 0 && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) < 6),
        onPanResponderGrant: (event) => {
          if (disabled || trackWidth <= 0) {
            return;
          }

          const nextProgress = clampNumber(event.nativeEvent.locationX / trackWidth, 0, 1);
          onScrubStart?.(nextProgress);
        },
        onPanResponderMove: (event) => {
          if (disabled || trackWidth <= 0) {
            return;
          }

          const nextProgress = clampNumber(event.nativeEvent.locationX / trackWidth, 0, 1);
          onScrubUpdate?.(nextProgress);
        },
        onPanResponderRelease: (event) => {
          if (disabled || trackWidth <= 0) {
            return;
          }

          const nextProgress = clampNumber(event.nativeEvent.locationX / trackWidth, 0, 1);
          onScrubEnd?.(nextProgress);
        },
        onPanResponderTerminate: (event) => {
          if (disabled || trackWidth <= 0) {
            return;
          }

          const nextProgress = clampNumber(event.nativeEvent.locationX / trackWidth, 0, 1);
          onScrubEnd?.(nextProgress);
        },
      }),
    [disabled, onScrubEnd, onScrubStart, onScrubUpdate, trackWidth]
  );

  const thumbOffset = trackWidth > 0 ? normalizedProgress * trackWidth : 0;

  return (
    <View
      {...panResponder.panHandlers}
      onLayout={(event) => {
        setTrackWidth(event.nativeEvent.layout.width);
      }}
      style={styles.shortSeekTrack}
    >
      <View style={styles.shortSeekTrackBase} />
      <View style={[styles.shortSeekTrackFill, { width: `${normalizedProgress * 100}%` }]} />
      <View
        style={[
          styles.shortSeekThumb,
          {
            left: clampNumber(thumbOffset - 7, 0, Math.max(0, trackWidth - 14)),
          },
        ]}
      />
      {showBubble ? (
        <View
          pointerEvents="none"
          style={[
            styles.shortSeekBubble,
            {
              left: clampNumber(thumbOffset - 32, 0, Math.max(0, trackWidth - 64)),
            },
          ]}
        >
          <Text style={styles.shortSeekBubbleText}>{bubbleLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ─── Login Screen ─── */
function LoginScreen({ onGoogleLogin, loading, appLanguage }) {
  const isKo = appLanguage === "ko";
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={loginStyles.container}>
        <View style={loginStyles.hero}>
          <Text style={loginStyles.appName}>{APP_DISPLAY_NAME}</Text>
          <Text style={loginStyles.tagline}>
            {isKo ? "내 자료를 학습 팩으로 바꾸세요" : "Turn your material into learning packs"}
          </Text>
        </View>
        <View style={loginStyles.bottomSection}>
          <Pressable
            style={({ pressed }) => [
              loginStyles.googleButton,
              pressed && { opacity: 0.85 },
            ]}
            onPress={onGoogleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={palette.ink} size="small" />
            ) : (
              <>
                <Image
                  source={{ uri: "https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" }}
                  style={loginStyles.googleIcon}
                />
                <Text style={loginStyles.googleButtonText}>
                  {isKo ? "Google로 계속하기" : "Continue with Google"}
                </Text>
              </>
            )}
          </Pressable>
          <Text style={loginStyles.disclaimer}>
            {isKo
              ? "계속 진행하면 서비스 이용약관에 동의하게 됩니다."
              : "By continuing, you agree to our Terms of Service."}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({ packs, progressByPack, onOpenPack, onRemovePack, onUpdateTitle, onOpenStudio, appLanguage, onChangeLanguage, pendingGeneration, onDismissPending, user, onLogout }) {
  const appText = getAppUiText(appLanguage);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [editingPackId, setEditingPackId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [selectedPackFormat, setSelectedPackFormat] = useState("shorts");
  const pendingModeRef = useRef(null);

  function handleOpenCreateMode(mode, packFormat = selectedPackFormat) {
    const nextPackFormat = normalizeRequestedPackFormat(packFormat);
    setIsProfileMenuOpen(false);
    if (mode === "file") {
      pendingModeRef.current = { mode: "file", packFormat: nextPackFormat };
      setIsCreateSheetOpen(false);
      return;
    }
    setIsCreateSheetOpen(false);
    onOpenStudio(mode, null, nextPackFormat);
  }

  async function handleSheetDismiss() {
    if (pendingModeRef.current?.mode !== "file") {
      return;
    }
    const nextPackFormat = pendingModeRef.current.packFormat || "shorts";
    pendingModeRef.current = null;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        onOpenStudio("file", result.assets[0], nextPackFormat);
      }
    } catch {
      // ignore
    }
  }

  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 0 }} />
      <View style={styles.screenFill}>
        <ScrollView contentContainerStyle={styles.homeScreenContent} showsVerticalScrollIndicator={false}>
          <View style={styles.homeTopBar}>
            <Text style={styles.homeAppName}>{APP_DISPLAY_NAME}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsProfileMenuOpen((current) => !current)}
            >
              {user?.user_metadata?.avatar_url ? (
                <Image source={{ uri: user.user_metadata.avatar_url }} style={styles.homeProfileAvatar} />
              ) : (
                <View style={[styles.homeProfileAvatar, { backgroundColor: palette.line, alignItems: "center", justifyContent: "center" }]}>
                  <Feather color={palette.muted} name="user" size={16} />
                </View>
              )}
            </Pressable>
          </View>

          {pendingGeneration && (
            <View style={styles.pendingGenCard}>
              {pendingGeneration.status === "loading" ? (
                <>
                  <ActivityIndicator color={palette.accent} size="small" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.pendingGenTitle}>{appText.generatingPack}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={onDismissPending} style={{ marginLeft: 8 }}>
                    <Feather color={palette.muted} name="x" size={18} />
                  </Pressable>
                </>
              ) : (
                <>
                  <MaterialIcons color={palette.danger} name="error-outline" size={24} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pendingGenTitle}>{appText.generationFailedShort}</Text>
                    <Text style={styles.pendingGenError}>{pendingGeneration.error}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={pendingGeneration.retryFn}>
                    <Text style={styles.pendingGenRetry}>{appText.retry}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={onDismissPending}>
                    <Feather color={palette.muted} name="x" size={18} />
                  </Pressable>
                </>
              )}
            </View>
          )}

          {packs.map((pack) => {
            const isReady = pack.status === "ready";
            const completed = getCompletedIdeaIds(progressByPack, pack.id).length;
            const isDeletable = true;

            return (
              <Pressable
                key={pack.id}
                accessibilityRole="button"
                disabled={!isReady}
                onPress={() => onOpenPack(pack.id)}
                style={styles.libraryCard}
              >
                {isDeletable && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={(e) => {
                      e.stopPropagation();
                      Alert.alert(
                        appText.deletePackConfirmTitle,
                        appText.deletePackConfirmMessage,
                        [
                          { text: appText.deletePackCancel, style: "cancel" },
                          {
                            text: appText.deletePackConfirm,
                            style: "destructive",
                            onPress: () => onRemovePack(pack.id),
                          },
                        ]
                      );
                    }}
                    style={styles.libraryDeleteCorner}
                  >
                    <Feather color={palette.muted} name="trash-2" size={14} />
                  </Pressable>
                )}
                <BookCover compact pack={pack} />
                <View style={styles.libraryText}>
                  <View style={styles.libraryMetaRow}>
                    <Text style={styles.libraryCategory}>{pack.category}</Text>
                    <View style={styles.libraryFormatBadge}>
                      <Text style={styles.libraryFormatBadgeText}>
                        {getPackFormat(pack) === "shorts"
                          ? appText.packFormatShortsChip
                          : appText.packFormatCardsChip}
                      </Text>
                    </View>
                  </View>
                  {editingPackId === pack.id ? (
                    <TextInput
                      autoFocus
                      value={editTitle}
                      onChangeText={setEditTitle}
                      onBlur={() => {
                        const trimmed = editTitle.trim();
                        if (trimmed && trimmed !== pack.title && onUpdateTitle) {
                          onUpdateTitle(pack.id, trimmed);
                        }
                        setEditingPackId(null);
                      }}
                      onSubmitEditing={() => {
                        const trimmed = editTitle.trim();
                        if (trimmed && trimmed !== pack.title && onUpdateTitle) {
                          onUpdateTitle(pack.id, trimmed);
                        }
                        setEditingPackId(null);
                      }}
                      style={[styles.libraryTitle, styles.libraryTitleInput]}
                      returnKeyType="done"
                    />
                  ) : (
                    <View style={styles.libraryTitleRow}>
                      <Text numberOfLines={2} style={styles.libraryTitle}>
                        {getCompactTitle(pack.title)}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={(e) => {
                          e.stopPropagation();
                          setEditTitle(pack.title);
                          setEditingPackId(pack.id);
                        }}
                      >
                        <Feather color={palette.muted} name="edit-2" size={15} />
                      </Pressable>
                    </View>
                  )}
                  <Text style={styles.librarySubtitle}>{getPackDisplaySubtitle(pack)}</Text>
                  {isReady ? (
                    <View style={styles.libraryProgressBar}>
                      <View
                        style={[
                          styles.libraryProgressFill,
                          { width: `${pack.ideas.length > 0 ? (completed / pack.ideas.length) * 100 : 0}%` },
                        ]}
                      />
                      <Text style={styles.libraryProgressText}>
                        {completed}/{pack.ideas.length}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.libraryProgress}>{appText.comingSoon}</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View pointerEvents="box-none" style={styles.homeCreateDockWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setIsProfileMenuOpen(false);
              setIsCreateSheetOpen(true);
            }}
            style={styles.homeCreateDock}
          >
            <View style={styles.homeCreateDockRow}>
              <MaterialIcons color="#FFFCF8" name="add" size={22} />
              <Text style={styles.homeCreateDockLabel}>{appText.quickCreateCta}</Text>
            </View>
          </Pressable>
        </View>

        <ProfileMenu
          appLanguage={appLanguage}
          appText={appText}
          onChangeLanguage={onChangeLanguage}
          onClose={() => setIsProfileMenuOpen(false)}
          onLogout={onLogout}
          user={user}
          visible={isProfileMenuOpen}
        />

        <CreatePackSheet
          appText={appText}
          onChangePackFormat={setSelectedPackFormat}
          onClose={() => setIsCreateSheetOpen(false)}
          onDismiss={handleSheetDismiss}
          onOpenMode={(mode) => handleOpenCreateMode(mode, selectedPackFormat)}
          selectedPackFormat={selectedPackFormat}
          visible={isCreateSheetOpen}
        />
      </View>
    </View>
  );
}

function StudioScreen({
  onBack,
  onChangePackFormat,
  onStartGenerate,
  appLanguage,
  entryMode,
  initialAsset,
  packFormat,
}) {
  const appText = getAppUiText(appLanguage);
  const requestedPackFormat = normalizeRequestedPackFormat(packFormat);
  const [title, setTitle] = useState(DEFAULT_STUDIO_TITLE);
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceText, setSourceText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPickingSourceFile, setIsPickingSourceFile] = useState(false);
  const sourceTextInputRef = useRef(null);
  const autoEntryHandledRef = useRef(false);
  const sourceFilePickerInFlightRef = useRef(false);

  async function processPickedAsset(asset) {
    setError("");
    try {
      if (!isSupportedSourceAsset(asset)) {
        throw new Error(appText.unsupportedFile);
      }

      const binaryUpload = isBinaryAsset(asset);
      let text = "";

      if (!binaryUpload) {
        text = normalizeSourceText(await readSourceTextFromAsset(asset));
      }

      if (!binaryUpload && !text) {
        throw new Error(appText.selectedFileEmpty);
      }

      setSourceFile({
        asset,
        characterCount: text.length,
        isBinary: binaryUpload,
        mimeType: asset.mimeType || "text/plain",
        name: asset.name || appText.chooseSourceDocument,
        size: asset.size,
      });
      setSourceText(text);
      setTitle((currentTitle) => {
        if (currentTitle.trim() && currentTitle !== DEFAULT_STUDIO_TITLE) {
          return currentTitle;
        }
        return inferTitleFromFileName(asset.name || "");
      });
    } catch (pickError) {
      setError(pickError.message || appText.couldNotReadFile);
    }
  }

  function handleChangeSourceText(nextText) {
    setError("");
    if (sourceFile) {
      setSourceFile(null);
    }
    setSourceText(nextText);
  }

  async function handlePickSourceFile() {
    if (sourceFilePickerInFlightRef.current) {
      return;
    }

    sourceFilePickerInFlightRef.current = true;
    setIsPickingSourceFile(true);
    setError("");

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });

      if (result.canceled) {
        if (entryMode === "file") {
          onBack();
        }
        return;
      }

      const asset = result.assets?.[0];

      if (!asset) {
        throw new Error(appText.noFileSelected);
      }

      if (!isSupportedSourceAsset(asset)) {
        throw new Error(appText.unsupportedFile);
      }

      const binaryUpload = isBinaryAsset(asset);
      let text = "";

      if (!binaryUpload) {
        text = normalizeSourceText(await readSourceTextFromAsset(asset));
      }

      if (!binaryUpload && !text) {
        throw new Error(appText.selectedFileEmpty);
      }

      setSourceFile({
        asset,
        characterCount: text.length,
        isBinary: binaryUpload,
        mimeType: asset.mimeType || "text/plain",
        name: asset.name || appText.chooseSourceDocument,
        size: asset.size,
      });
      setSourceText(text);
      setTitle((currentTitle) => {
        if (currentTitle.trim() && currentTitle !== DEFAULT_STUDIO_TITLE) {
          return currentTitle;
        }

        return inferTitleFromFileName(asset.name || "");
      });
    } catch (pickError) {
      if (String(pickError?.message || "").includes("Different document picking in progress")) {
        return;
      }

      setError(pickError.message || appText.couldNotReadFile);
    } finally {
      sourceFilePickerInFlightRef.current = false;
      setIsPickingSourceFile(false);
    }
  }

  function handleClearSourceFile() {
    setError("");
    if (sourceFile && !sourceFile.isBinary) {
      setSourceText("");
    }
    setSourceFile(null);
  }

  useEffect(() => {
    if (autoEntryHandledRef.current) {
      return;
    }

    if (entryMode === "text") {
      autoEntryHandledRef.current = true;
      requestAnimationFrame(() => {
        sourceTextInputRef.current?.focus?.();
      });
      return;
    }

    if (entryMode === "file") {
      autoEntryHandledRef.current = true;
      if (initialAsset) {
        processPickedAsset(initialAsset);
      }
      return;
    }
  }, [entryMode]);

  const fileAutoGenerateRef = useRef(false);

  useEffect(() => {
    if (entryMode === "file" && sourceFile && !loading && !fileAutoGenerateRef.current) {
      fileAutoGenerateRef.current = true;
      handleGenerate(sourceFile, sourceText);
    }
  }, [entryMode, sourceFile]);

  function handleGenerate(overrideSourceFile, overrideSourceText) {
    const effectiveSourceFile = overrideSourceFile || sourceFile;
    const effectiveSourceText = overrideSourceText !== undefined ? overrideSourceText : sourceText;
    const normalizedSourceText = normalizeSourceText(effectiveSourceText);

    if (!normalizedSourceText && !effectiveSourceFile?.isBinary) {
      setError(appText.uploadBeforeGenerate);
      return;
    }

    onStartGenerate({
      title,
      sourceText: effectiveSourceText,
      sourceFile: effectiveSourceFile,
      packFormat: requestedPackFormat,
    });
  }

  if (entryMode === "text") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" onPress={onBack} style={styles.roundButton}>
              <Feather color={palette.ink} name="chevron-left" size={24} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable accessibilityRole="button" onPress={onBack} style={styles.roundButton}>
              <Feather color={palette.ink} name="x" size={24} />
            </Pressable>
          </View>

          <View style={styles.pasteScreenCenter}>
            <View style={styles.pasteScreenIcon}>
              <MaterialIcons color={palette.accent} name="notes" size={32} />
            </View>
            <Text style={styles.pasteScreenTitle}>{appText.pasteTextTitle}</Text>
            <Text style={styles.pasteScreenBody}>{appText.pasteTextBody}</Text>
          </View>

          <TextInput
            multiline
            onChangeText={handleChangeSourceText}
            placeholder={appText.pasteTextPlaceholder}
            placeholderTextColor={withAlpha(palette.muted, "A0")}
            ref={sourceTextInputRef}
            style={[styles.input, styles.inputMultiline, { minHeight: 160 }]}
            textAlignVertical="top"
            value={sourceText}
          />

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>{appText.couldNotGeneratePack}</Text>
              <Text style={styles.errorBody}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.longContentWarning}>{appText.longContentWarning}</Text>

          <PackFormatPicker
            appText={appText}
            onChange={onChangePackFormat}
            selectedPackFormat={requestedPackFormat}
          />

          <SurfaceButton
            disabled={!sourceText.trim()}
            icon="auto-awesome"
            label={loading ? appText.generatingPack : appText.addButton}
            loading={loading}
            onPress={handleGenerate}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (entryMode === "file") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.roundButton}>
            <Feather color={palette.ink} name="chevron-left" size={24} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.roundButton}>
            <Feather color={palette.ink} name="x" size={24} />
          </Pressable>
        </View>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
          {loading ? (
            <>
              <ActivityIndicator color={palette.accent} size="large" />
              <Text style={[styles.pasteScreenBody, { marginTop: 16 }]}>{appText.generatingPack}</Text>
            </>
          ) : (
            <>
              <View style={styles.pasteScreenIcon}>
                <MaterialIcons color={palette.accent} name="upload-file" size={32} />
              </View>
              <View style={styles.studioFormatInlineBadge}>
                <Text style={styles.studioFormatInlineBadgeText}>
                  {requestedPackFormat === "shorts"
                    ? appText.packFormatShortsChip
                    : appText.packFormatCardsChip}
                </Text>
              </View>
              <Text style={styles.pasteScreenTitle}>{appText.quickCreateFileTitle}</Text>
              <Text style={[styles.pasteScreenBody, { marginBottom: 8 }]}>{appText.quickCreateFileBody}</Text>
              <Text style={[styles.pasteScreenBody, { marginBottom: 24, fontSize: 12, color: palette.muted }]}>{appText.ocrLanguageHint}</Text>
              <SurfaceButton label={appText.chooseSourceDocument} icon="upload-file" onPress={handlePickSourceFile} />
              {error ? (
                <View style={[styles.errorCard, { marginTop: 16, width: "100%" }]}>
                  <Text style={styles.errorTitle}>{appText.couldNotGeneratePack}</Text>
                  <Text style={styles.errorBody}>{error}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.roundButton}>
            <Feather color={palette.ink} name="chevron-left" size={24} />
          </Pressable>
          <View style={styles.topBarTitleWrap}>
            <Text style={styles.topBarTitle}>{appText.studioTopTitle}</Text>
          </View>
          <View style={styles.topBarSpacer} />
        </View>

        <SectionHeader title={appText.studioTopTitle} body={appText.quickCreateBody} />

        <PackFormatPicker
          appText={appText}
          onChange={onChangePackFormat}
          selectedPackFormat={requestedPackFormat}
        />

        <View style={styles.formGroup}>
          <View style={styles.formLabelRow}>
            <Text style={styles.inputLabel}>{appText.sourceText}</Text>
            {sourceText.trim() ? <Text style={styles.fileReadyBadge}>{appText.ready}</Text> : null}
          </View>
          <TextInput
            multiline
            onChangeText={handleChangeSourceText}
            placeholder={appText.sourceTextPlaceholder}
            placeholderTextColor={withAlpha(palette.muted, "A0")}
            ref={sourceTextInputRef}
            style={[styles.input, styles.inputMultiline]}
            textAlignVertical="top"
            value={sourceText}
          />
          <Text style={styles.fieldHint}>{appText.sourceTextHint()}</Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>{appText.couldNotGeneratePack}</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.longContentWarning}>{appText.longContentWarning}</Text>

        <SurfaceButton
          disabled={!sourceFile && !sourceText.trim()}
          icon="auto-awesome"
          label={loading ? appText.generatingPack : appText.generatePack}
          loading={loading}
          onPress={handleGenerate}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailScreen({ pack, progressByPack, onBack, onStartIdea, onStartPackReview, onUpdateTitle, appLanguage }) {
  const completedIdeaIds = getCompletedIdeaIds(progressByPack, pack.id);
  const nextIdea = getNextIdea(pack, completedIdeaIds) || null;
  const hasPackReview = getPackReviewQuestions(pack).length > 0;
  const packReviewCompleted = hasPackReviewCompleted(progressByPack, pack.id);
  const uiText = getPackUiText(pack, appLanguage);
  const appText = getAppUiText(appLanguage);
  const isFirstIdea = completedIdeaIds.length === 0;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(pack.title);
  const detailCtaTitle = nextIdea
    ? getCompactTitle(nextIdea.title)
    : hasPackReview && !packReviewCompleted
      ? uiText.finalReviewReady
      : null;
  const detailCtaAction = nextIdea
    ? (isFirstIdea ? uiText.startReading : uiText.continueReading)
    : hasPackReview && !packReviewCompleted
      ? uiText.reviewPack
      : null;

  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 0 }} />
      <ScrollView contentContainerStyle={[styles.detailScreenContent, (nextIdea || (hasPackReview && !packReviewCompleted)) && { paddingBottom: 140 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.roundButton}>
            <Feather color={palette.ink} name="chevron-left" size={24} />
          </Pressable>
          <Pressable style={styles.topBarTitleWrap} onPress={() => { setEditTitle(pack.title); setIsEditingTitle(true); }}>
            {isEditingTitle ? (
              <TextInput
                autoFocus
                value={editTitle}
                onChangeText={setEditTitle}
                onBlur={() => {
                  const trimmed = editTitle.trim();
                  if (trimmed && trimmed !== pack.title && onUpdateTitle) {
                    onUpdateTitle(trimmed);
                  }
                  setIsEditingTitle(false);
                }}
                onSubmitEditing={() => {
                  const trimmed = editTitle.trim();
                  if (trimmed && trimmed !== pack.title && onUpdateTitle) {
                    onUpdateTitle(trimmed);
                  }
                  setIsEditingTitle(false);
                }}
                style={[styles.topBarTitle, styles.topBarTitleInput]}
                returnKeyType="done"
              />
            ) : (
              <Text numberOfLines={2} style={styles.topBarTitle}>
                {getCompactTitle(pack.title)}
              </Text>
            )}
            <Text style={styles.topBarCaption}>{pack.category}</Text>
          </Pressable>
          <View style={styles.topBarSpacer} />
        </View>

        <View style={styles.heroCard}>
          <BookCover pack={pack} />

          <View style={styles.progressBarWrapper}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${(completedIdeaIds.length / pack.ideas.length) * 100}%`,
                  },
                ]}
              />
              <Text style={styles.progressText}>
                {completedIdeaIds.length}/{pack.ideas.length}
              </Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>{getPackDisplaySubtitle(pack)}</Text>
          <Text style={styles.heroDescription}>{pack.description}</Text>

        </View>

        {pack.ideas.map((idea, index) => {
          let state = "locked";
          if (completedIdeaIds.includes(idea.id)) {
            state = "completed";
          } else if (isIdeaUnlocked(index, completedIdeaIds)) {
            state = "unlocked";
          }

          const prevSection = index > 0 ? pack.ideas[index - 1].section : null;
          const showSectionHeader = idea.section && idea.section !== prevSection;

          return (
            <React.Fragment key={`${idea.id}-${index}`}>
              {showSectionHeader && (
                <View style={styles.ideaSectionHeader}>
                  <View style={styles.ideaSectionLine} />
                  <Text style={styles.ideaSectionLabel}>{idea.section}</Text>
                </View>
              )}
              <IdeaRow
                idea={idea}
                onPress={() => onStartIdea(pack.id, idea.id)}
                state={state}
              />
            </React.Fragment>
          );
        })}
      </ScrollView>

      {(nextIdea || (hasPackReview && !packReviewCompleted)) ? (
        <View style={styles.detailCtaWrapper}>
          <Text numberOfLines={1} style={styles.detailCtaTopTitle}>
            {detailCtaTitle}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (nextIdea) {
                onStartIdea(pack.id, nextIdea.id);
              } else if (hasPackReview && !packReviewCompleted) {
                onStartPackReview(pack.id);
              }
            }}
            style={styles.detailCtaButton}
          >
            <Text numberOfLines={1} style={styles.detailCtaButtonLabel}>
              {detailCtaAction}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ShortsLessonScreen({
  pack,
  idea,
  chatMessages = [],
  onClose,
  onFinish,
  onUpdateChat = () => {},
  appLanguage,
}) {
  const { height: windowHeight } = useWindowDimensions();
  const clips = Array.isArray(idea?.clips) && idea.clips.length > 0 ? idea.clips : null;
  const totalClips = clips ? clips.length : 1;
  const [clipIndex, setClipIndex] = useState(0);
  const short = clips ? clips[clipIndex] || clips[0] : getIdeaShort(idea);
  const shortVideo = getShortVideo(short);
  const uiText = getLessonUiText(pack, idea, appLanguage);
  const scenes = Array.isArray(short?.scenes) ? short.scenes : [];
  const quizQuestions = useMemo(() => getPracticeQuestions(idea), [idea?.id]);
  const ideaContext = useMemo(() => buildIdeaContext(pack, idea), [pack, idea]);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioError, setAudioError] = useState("");
  const [isFetchingAudio, setIsFetchingAudio] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoError, setVideoError] = useState("");
  const [isFetchingVideo, setIsFetchingVideo] = useState(false);
  const [videoStatus, setVideoStatus] = useState(null);
  const [sceneImageUrlsById, setSceneImageUrlsById] = useState({});
  const [isQuizUnlocked, setIsQuizUnlocked] = useState(false);
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [isClipFinished, setIsClipFinished] = useState(false);
  const [isSubtitleEnabled, setIsSubtitleEnabled] = useState(false);
  const [scrubPreviewMs, setScrubPreviewMs] = useState(null);
  const [selectedAnswersByQuestion, setSelectedAnswersByQuestion] = useState({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [streamingReplyText, setStreamingReplyText] = useState("");
  const [isAssistantStreaming, setIsAssistantStreaming] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const hasAutoplayAttemptedRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  const videoRef = useRef(null);
  const chatScrollRef = useRef(null);
  const chatRequestTokenRef = useRef(0);
  const chatTypingTimerRef = useRef(null);
  const player = useAudioPlayer(audioUrl ? { uri: audioUrl } : null, {
    updateInterval: 100,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);
  const audioSegments = useMemo(() => getShortAudioSegments(short), [idea?.id, clipIndex, short?.tts?.audioPath]);
  const hasBundledVideo = typeof shortVideo?.localAsset === "number";
  const resolvedVideoSource = hasBundledVideo ? shortVideo.localAsset : videoUrl ? { uri: videoUrl } : null;
  const hasPlayableVideo = Boolean(resolvedVideoSource);
  const videoStartOffsetMs = hasPlayableVideo ? Math.max(0, Number(shortVideo?.startMs || 0)) : 0;
  const playbackCurrentTimeSec = hasPlayableVideo
    ? Math.max(0, Number(videoStatus?.positionMillis || 0)) / 1000
    : status?.currentTime || 0;
  const playbackDurationSec = hasPlayableVideo
    ? Math.max(0, Number(videoStatus?.durationMillis || shortVideo?.durationMs || 0)) / 1000
    : status?.duration || (short?.tts?.durationMs || 0) / 1000;
  const effectivePlaybackTimeMs =
    scrubPreviewMs !== null ? Math.max(0, Number(scrubPreviewMs || 0)) : Math.max(0, Math.round(playbackCurrentTimeSec * 1000) - videoStartOffsetMs);
  const activeSceneIndex = useMemo(
    () => getShortSceneActiveIndex(short, effectivePlaybackTimeMs / 1000),
    [effectivePlaybackTimeMs, short]
  );
  const activeScene = scenes[activeSceneIndex] || scenes[0] || null;
  const activeSceneImageUrl = activeScene?.id ? sceneImageUrlsById[activeScene.id] || "" : "";
  const activeSubtitleSegment = useMemo(
    () => getShortActiveSegment(audioSegments, effectivePlaybackTimeMs),
    [audioSegments, effectivePlaybackTimeMs]
  );
  const displayedSubtitleText = isSubtitleEnabled
    ? getShortSubtitleLine(activeSubtitleSegment, effectivePlaybackTimeMs)
    : "";
  const clipDurationMs = Math.max(1, Number(shortVideo?.durationMs || short?.tts?.durationMs || 0));
  const clipProgress = clipDurationMs > 0 ? clampNumber(effectivePlaybackTimeMs / clipDurationMs, 0, 1) : 0;
  const displayedProgress =
    scrubPreviewMs !== null
      ? clampNumber(scrubPreviewMs / clipDurationMs, 0, 1)
      : clipProgress;
  const canGoToPreviousClip = Boolean(clips && clipIndex > 0);
  const canGoToNextClip = Boolean(clips && clipIndex < totalClips - 1);
  const clipSwipeHint = isClipFinished && canGoToNextClip ? uiText.swipeUpForNextShort : "";
  const shortVideoPosterSource =
    typeof shortVideo?.posterAsset === "number" ? shortVideo.posterAsset : undefined;
  const currentQuestion = quizQuestions[questionIndex] || null;
  const selectedAnswerIndex = currentQuestion ? selectedAnswersByQuestion[currentQuestion.id] : null;
  const hasAnsweredCurrentQuestion = selectedAnswerIndex !== null && selectedAnswerIndex !== undefined;
  const correctAnswerCount = quizQuestions.filter(
    (question) => selectedAnswersByQuestion[question.id] === question.correctIndex
  ).length;
  const answeredQuestionCount = quizQuestions.filter(
    (question) => selectedAnswersByQuestion[question.id] !== undefined
  ).length;
  const allPracticeQuestionsAnswered =
    quizQuestions.length > 0 && answeredQuestionCount === quizQuestions.length;
  const estimatedBottomInset = Platform.OS === "ios" && windowHeight >= 780 ? 34 : 0;
  const estimatedTopInset = Platform.OS === "ios" ? (windowHeight >= 780 ? 54 : 32) : 18;
  const chatTopOffset =
    keyboardHeight > 0
      ? Math.max(96, Math.round(windowHeight * 0.13))
      : Math.max(148, Math.round(windowHeight * 0.19));
  const chatBottomGap =
    keyboardHeight > 0 ? (Platform.OS === "ios" ? 8 : 6) : CHAT_ENTRY_BOTTOM_OFFSET;
  const chatKeyboardOffset =
    keyboardHeight > 0
      ? Math.max(
          0,
          keyboardHeight - (Platform.OS === "ios" ? estimatedBottomInset : 24)
        )
      : 0;
  const chatAvailableHeight = Math.max(
    0,
    windowHeight - chatTopOffset - chatBottomGap - chatKeyboardOffset
  );
  const chatTargetHeight =
    keyboardHeight > 0 ? Math.round(windowHeight * 0.46) : Math.round(windowHeight * 0.52);
  const chatMinimumHeight = keyboardHeight > 0 ? 260 : 320;
  const chatSheetHeight = Math.min(
    chatAvailableHeight,
    Math.max(chatMinimumHeight, chatTargetHeight)
  );

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(Math.max(0, Math.round(event.endCoordinates?.height || 0)));
      scrollChatToEnd(false);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const video = getShortVideo(short);

    setVideoUrl("");
    setVideoError("");
    setIsFetchingVideo(false);

    if (!video) {
      return () => {
        isMounted = false;
      };
    }

    if (typeof video.localAsset === "number") {
      return () => {
        isMounted = false;
      };
    }

    if (!video?.videoPath || video?.videoStatus !== "ready") {
      if (video?.videoStatus === "failed") {
        setVideoError(uiText.videoUnavailable);
      }
      return () => {
        isMounted = false;
      };
    }

    setIsFetchingVideo(true);

    fetch(`${API_BASE_URL}/api/media/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: video.videoPath,
        bucketName: video.bucketName,
      }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || uiText.videoUnavailable);
        }

        if (isMounted) {
          setVideoUrl(data.signedUrl || "");
          setVideoError(data.signedUrl ? "" : uiText.videoUnavailable);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setVideoError(error.message || uiText.videoUnavailable);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsFetchingVideo(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [idea?.id, short?.video?.videoPath, short?.video?.videoStatus, uiText.videoUnavailable]);

  useEffect(() => {
    let isMounted = true;
    const tts = getShortAudio(short);

    if (hasBundledVideo || Boolean(videoUrl) || (shortVideo?.videoPath && shortVideo?.videoStatus === "ready")) {
      setAudioUrl("");
      setAudioError("");
      setIsFetchingAudio(false);
      return () => {
        isMounted = false;
      };
    }

    setAudioUrl("");
    setAudioError("");
    setIsFetchingAudio(false);
    setVideoUrl("");
    setVideoError("");
    setIsFetchingVideo(false);
    setVideoStatus(null);
    setSceneImageUrlsById({});
    setIsQuizUnlocked(false);
    setIsQuizMode(false);
    setIsSubtitleEnabled(false);
    setScrubPreviewMs(null);
    setSelectedAnswersByQuestion({});
    setQuestionIndex(0);
    setChatInput("");
    setChatError("");
    setIsChatLoading(false);
    setIsChatOpen(false);
    setStreamingReplyText("");
    setIsAssistantStreaming(false);
    setKeyboardHeight(0);
    chatRequestTokenRef.current += 1;
    if (chatTypingTimerRef.current) {
      clearTimeout(chatTypingTimerRef.current);
      chatTypingTimerRef.current = null;
    }
    hasAutoplayAttemptedRef.current = false;

    if (!tts?.audioPath || tts?.audioStatus !== "ready") {
      if (tts?.audioStatus === "failed") {
        setAudioError(uiText.audioUnavailable);
      }
      return () => {
        isMounted = false;
      };
    }

    setIsFetchingAudio(true);

    fetch(`${API_BASE_URL}/api/media/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: tts.audioPath,
        bucketName: tts.bucketName,
      }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || uiText.audioUnavailable);
        }

        if (isMounted) {
          setAudioUrl(data.signedUrl || "");
          setAudioError(data.signedUrl ? "" : uiText.audioUnavailable);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setAudioError(error.message || uiText.audioUnavailable);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsFetchingAudio(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    hasBundledVideo,
    idea?.id,
    short?.tts?.audioPath,
    short?.tts?.audioStatus,
    shortVideo?.videoPath,
    shortVideo?.videoStatus,
    uiText.audioUnavailable,
    videoUrl,
  ]);

  useEffect(() => {
    let isMounted = true;
    const imageScenes = scenes.filter((scene) => {
      const image = getShortSceneImage(scene);
      return image?.imageStatus === "ready" && image?.imagePath;
    });

    setSceneImageUrlsById({});

    if (!imageScenes.length) {
      return () => {
        isMounted = false;
      };
    }

    Promise.all(
      imageScenes.map(async (scene) => {
        const image = getShortSceneImage(scene);
        const response = await fetch(`${API_BASE_URL}/api/media/sign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: image.imagePath,
            bucketName: image.bucketName,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.signedUrl) {
          throw new Error(data.error || "Failed to load a scene image.");
        }

        return [scene.id, data.signedUrl];
      })
    )
      .then((entries) => {
        if (!isMounted) {
          return;
        }

        setSceneImageUrlsById(Object.fromEntries(entries));
      })
      .catch(() => {
        if (isMounted) {
          setSceneImageUrlsById({});
        }
      });

    return () => {
      isMounted = false;
    };
  }, [idea?.id, scenes]);

  useEffect(() => {
    if (hasPlayableVideo || !audioUrl || !status?.isLoaded || hasAutoplayAttemptedRef.current) {
      return;
    }

    hasAutoplayAttemptedRef.current = true;
    player.play();
  }, [audioUrl, hasPlayableVideo, player, status?.isLoaded]);

  const changeClip = useCallback((nextIndex) => {
    if (!clips || nextIndex < 0 || nextIndex >= totalClips || nextIndex === clipIndex) {
      return;
    }

    if (hasPlayableVideo) {
      videoRef.current?.pauseAsync?.().catch(() => {});
    } else {
      player.pause();
    }

    const nextClip = clips[nextIndex];
    const nextClipVideo = getShortVideo(nextClip);
    const nextStartMs = Math.max(0, Number(nextClipVideo?.startMs || 0));

    setClipIndex(nextIndex);
    setIsClipFinished(false);
    setIsQuizMode(false);
    setScrubPreviewMs(null);

    if (!hasPlayableVideo) {
      return;
    }

    requestAnimationFrame(() => {
      if (!videoRef.current) {
        return;
      }

      videoRef.current
        .setPositionAsync(nextStartMs)
        .then(() => videoRef.current?.playAsync?.())
        .catch(() => {});
    });
  }, [clipIndex, clips, hasPlayableVideo, player, totalClips]);

  const clipSwipePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          totalClips > 1 &&
          Math.abs(gesture.dy) > SHORT_CLIP_SWIPE_THRESHOLD / 2 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy <= -SHORT_CLIP_SWIPE_THRESHOLD && canGoToNextClip) {
            changeClip(clipIndex + 1);
            return;
          }

          if (gesture.dy >= SHORT_CLIP_SWIPE_THRESHOLD && canGoToPreviousClip) {
            changeClip(clipIndex - 1);
          }
        },
      }),
    [canGoToNextClip, canGoToPreviousClip, changeClip, clipIndex, totalClips]
  );

  // Seek video to clip startMs when clip changes or video first loads
  useEffect(() => {
    if (!hasPlayableVideo || !videoRef.current || !videoStartOffsetMs) {
      return;
    }
    const posMs = Number(videoStatus?.positionMillis || 0);
    // Only seek if video is near the beginning (just loaded or clip just changed)
    if (posMs < videoStartOffsetMs - 500) {
      videoRef.current.setPositionAsync(videoStartOffsetMs).catch(() => {});
    }
  }, [hasPlayableVideo, videoStartOffsetMs, videoStatus?.isLoaded]);

  // Stop at the end of the current clip and wait for an explicit swipe to move on.
  useEffect(() => {
    if (!hasPlayableVideo || !videoStatus?.isPlaying || isClipFinished) {
      return;
    }

    const videoEndMs = Math.max(0, Number(shortVideo?.endMs || 0));
    if (!videoEndMs) {
      return;
    }

    const posMs = Number(videoStatus?.positionMillis || 0);
    if (posMs >= videoEndMs - 150) {
      setIsClipFinished(true);
      videoRef.current?.pauseAsync?.().catch(() => {});
      videoRef.current?.setPositionAsync(videoEndMs).catch(() => {});

      if (!canGoToNextClip) {
        setIsQuizUnlocked(true);
      }
    }
  }, [
    canGoToNextClip,
    hasPlayableVideo,
    isClipFinished,
    shortVideo?.endMs,
    videoStatus?.positionMillis,
    videoStatus?.isPlaying,
  ]);

  useEffect(() => {
    if (hasPlayableVideo) {
      if (videoStatus?.didJustFinish) {
        setIsClipFinished(true);
        if (!canGoToNextClip) {
          setIsQuizUnlocked(true);
        }
      }
      return;
    }

    if (status?.didJustFinish) {
      setIsClipFinished(true);
      if (!canGoToNextClip) {
        setIsQuizUnlocked(true);
      }
    }
  }, [canGoToNextClip, hasPlayableVideo, status?.didJustFinish, videoStatus?.didJustFinish]);

  useEffect(() => {
    if (!isChatOpen) {
      return;
    }

    scrollChatToEnd(false);
  }, [isChatOpen, chatMessages.length, isChatLoading, isAssistantStreaming, streamingReplyText]);

  useEffect(() => {
    return () => {
      if (chatTypingTimerRef.current) {
        clearTimeout(chatTypingTimerRef.current);
        chatTypingTimerRef.current = null;
      }
    };
  }, []);

  function scrollChatToEnd(animated = true) {
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollToEnd({ animated });
    });
  }

  function startStreamingAssistantReply(reply, baseMessages, requestToken) {
    if (chatTypingTimerRef.current) {
      clearTimeout(chatTypingTimerRef.current);
      chatTypingTimerRef.current = null;
    }

    setStreamingReplyText("");
    setIsAssistantStreaming(true);

    let visibleLength = 0;
    const totalLength = reply.length;
    const baseStep =
      totalLength > 900 ? 18 : totalLength > 600 ? 14 : totalLength > 320 ? 10 : 6;

    const stepReply = () => {
      if (chatRequestTokenRef.current !== requestToken) {
        return;
      }

      const nextLength = Math.min(totalLength, visibleLength + baseStep);
      visibleLength = nextLength;
      setStreamingReplyText(reply.slice(0, nextLength));
      scrollChatToEnd(false);

      if (nextLength >= totalLength) {
        onUpdateChat([...baseMessages, createChatMessage("assistant", reply)]);
        requestAnimationFrame(() => {
          if (chatRequestTokenRef.current === requestToken) {
            setStreamingReplyText("");
            setIsAssistantStreaming(false);
          }
        });
        chatTypingTimerRef.current = null;
        return;
      }

      const trailingCharacter = reply[nextLength - 1] || "";
      const delay = /[.!?。！？]/u.test(trailingCharacter) ? 48 : 18;
      chatTypingTimerRef.current = setTimeout(stepReply, delay);
    };

    chatTypingTimerRef.current = setTimeout(stepReply, 36);
  }

  function openChatSheet() {
    setChatError("");
    setIsChatOpen(true);
  }

  async function sendChatMessage(rawQuestion, options = {}) {
    const nextQuestion = String(rawQuestion || "").replace(/\s+/g, " ").trim();

    if (!nextQuestion || isChatLoading || isAssistantStreaming) {
      return;
    }

    if (options.clearComposer) {
      setChatInput("");
    }

    openChatSheet();

    const userMessage = createChatMessage("user", nextQuestion);
    const nextMessages = [...chatMessages, userMessage];

    onUpdateChat(nextMessages);
    setChatError("");
    setIsChatLoading(true);
    setStreamingReplyText("");
    setIsAssistantStreaming(false);

    const requestToken = chatRequestTokenRef.current + 1;
    chatRequestTokenRef.current = requestToken;

    try {
      const response = await fetch(`${API_BASE_URL}/api/idea-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ideaContext,
          messages: serializeChatMessagesForApi(nextMessages),
        }),
      });

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || uiText.answerError);
      }

      const reply = String(data.reply || "").trim();

      if (!reply) {
        throw new Error(uiText.answerError);
      }

      if (chatRequestTokenRef.current === requestToken) {
        startStreamingAssistantReply(reply, nextMessages, requestToken);
      }
    } catch (error) {
      if (chatRequestTokenRef.current === requestToken) {
        if (chatTypingTimerRef.current) {
          clearTimeout(chatTypingTimerRef.current);
          chatTypingTimerRef.current = null;
        }
        setStreamingReplyText("");
        setIsAssistantStreaming(false);
        setChatError(error.message || uiText.answerError);
      }
    } finally {
      if (chatRequestTokenRef.current === requestToken) {
        setIsChatLoading(false);
      }
    }
  }

  async function handleSendChatMessage() {
    await sendChatMessage(chatInput, { clearComposer: true });
  }

  function renderActionRail() {
    return (
      <View
        pointerEvents="box-none"
        style={[
          styles.shortActionRail,
          { bottom: 64 + estimatedBottomInset },
        ]}
      >
        <View style={styles.shortActionRailStack}>
          <Pressable
            accessibilityLabel={appLanguage === "ko" ? "ChatGPT에게 물어보기" : "Ask ChatGPT"}
            accessibilityRole="button"
            hitSlop={10}
            onPress={openChatSheet}
            style={styles.shortActionItem}
          >
            <Image
              resizeMode="contain"
              source={OPENAI_BLOSSOM_ICON}
              style={styles.shortActionLogo}
            />
            <Text style={styles.shortActionLabel}>ChatGPT</Text>
          </Pressable>

          <Pressable
            accessibilityLabel={isSubtitleEnabled ? uiText.hideSubtitles : uiText.showSubtitles}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setIsSubtitleEnabled((current) => !current)}
            style={styles.shortActionItem}
          >
            <MaterialIcons
              color="#000000"
              name="subtitles"
              size={30}
              style={styles.shortActionIcon}
            />
            <Text style={styles.shortActionLabel}>Caption</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function seekToScene(nextIndex) {
    const targetScene = scenes[nextIndex];
    if (!targetScene) {
      return;
    }

    const targetSegment =
      audioSegments.find((segment) => segment.sceneId === targetScene.id) || audioSegments[nextIndex];

    if (targetSegment) {
      if (hasPlayableVideo && videoRef.current?.setPositionAsync) {
        videoRef.current.setPositionAsync(targetSegment.startMs).catch(() => {});
      } else {
        player.seekTo(targetSegment.startMs / 1000).catch(() => {});
      }
    }
  }

  function toggleShortPlayback() {
    if (isClipFinished) {
      setIsClipFinished(false);
      setScrubPreviewMs(null);

      if (hasPlayableVideo) {
        if (videoRef.current?.setPositionAsync) {
          videoRef.current
            .setPositionAsync(videoStartOffsetMs)
            .then(() => videoRef.current?.playAsync?.().catch(() => {}))
            .catch(() => {});
        }
      } else {
        player.seekTo(0).then(() => {
          player.play();
        }).catch(() => {
          player.play();
        });
      }
      return;
    }

    if (hasPlayableVideo) {
      if (videoStatus?.isPlaying) {
        videoRef.current?.pauseAsync?.();
      } else {
        videoRef.current?.playAsync?.();
      }
      return;
    }

    if (status?.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  async function seekShortPlayback(nextProgress) {
    const targetClipMs = Math.round(clampNumber(nextProgress, 0, 1) * clipDurationMs);

    if (hasPlayableVideo && videoRef.current?.setPositionAsync) {
      // Convert clip-local time to absolute video time
      await videoRef.current.setPositionAsync(targetClipMs + videoStartOffsetMs).catch(() => {});
      return;
    }

    await player.seekTo(targetClipMs / 1000).catch(() => {});
  }

  function handleScrubStart(nextProgress) {
    if (clipDurationMs <= 0) {
      return;
    }

    wasPlayingBeforeScrubRef.current = hasPlayableVideo ? Boolean(videoStatus?.isPlaying) : Boolean(status?.playing);

    if (wasPlayingBeforeScrubRef.current) {
      if (hasPlayableVideo) {
        videoRef.current?.pauseAsync?.();
      } else {
        player.pause();
      }
    }

    setScrubPreviewMs(Math.round(clampNumber(nextProgress, 0, 1) * clipDurationMs));
  }

  function handleScrubUpdate(nextProgress) {
    if (clipDurationMs <= 0) {
      return;
    }

    setScrubPreviewMs(Math.round(clampNumber(nextProgress, 0, 1) * clipDurationMs));
  }

  async function handleScrubEnd(nextProgress) {
    if (clipDurationMs <= 0) {
      return;
    }

    const shouldResume = wasPlayingBeforeScrubRef.current;
    await seekShortPlayback(nextProgress);
    setIsClipFinished(false);
    setScrubPreviewMs(null);

    if (shouldResume) {
      if (hasPlayableVideo) {
        videoRef.current?.playAsync?.();
      } else {
        player.play();
      }
    }
  }

  function openShortQuiz() {
    if (hasPlayableVideo) {
      videoRef.current?.pauseAsync?.();
    } else {
      player.pause();
    }

    setIsQuizMode(true);
  }

  function renderQuiz() {
    return (
      <View style={styles.shortQuizSection}>
        <View style={styles.practiceHeaderRow}>
          <Text style={styles.practiceHeaderLabel}>
            {uiText.questionLabel(questionIndex + 1, quizQuestions.length)}
          </Text>
          <Text style={styles.practiceHeaderScore}>
            {uiText.correctCount(correctAnswerCount, quizQuestions.length)}
          </Text>
        </View>

        {currentQuestion ? (
          <>
            <View style={styles.practiceQuestionCard}>
              <Text style={styles.practiceQuestion}>{currentQuestion.question}</Text>
            </View>

            <View style={styles.practiceOptionsStack}>
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedAnswerIndex === index;
                const isCorrect = index === currentQuestion.correctIndex;
                const showState = hasAnsweredCurrentQuestion && (isSelected || isCorrect);

                return (
                  <Pressable
                    key={`${currentQuestion.id}-${option}`}
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedAnswersByQuestion((current) => ({
                        ...current,
                        [currentQuestion.id]: index,
                      }));
                    }}
                    style={[
                      styles.optionCard,
                      isSelected && styles.optionCardSelected,
                      showState && isCorrect && styles.optionCardCorrect,
                      showState && isSelected && !isCorrect && styles.optionCardWrong,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                        showState && isCorrect && styles.optionTextCorrect,
                        showState && isSelected && !isCorrect && styles.optionTextWrong,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {hasAnsweredCurrentQuestion ? (
              <View style={styles.feedbackCard}>
                <Text style={styles.feedbackTitle}>
                  {selectedAnswerIndex === currentQuestion.correctIndex ? uiText.correct : uiText.almost}
                </Text>
                <Text style={styles.feedbackBody}>{currentQuestion.explanation}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <SurfaceButton icon="check" label={uiText.finishIdea} onPress={onFinish} />
        )}

        {currentQuestion ? (
          <View style={styles.practiceActionRow}>
            <SurfaceButton
              disabled={questionIndex === 0}
              label={uiText.previous}
              onPress={() => setQuestionIndex((current) => Math.max(0, current - 1))}
              secondary
              style={[styles.practiceActionButton, styles.practiceActionButtonSecondary]}
            />
            {questionIndex < quizQuestions.length - 1 ? (
              <SurfaceButton
                disabled={!hasAnsweredCurrentQuestion}
                label={uiText.nextQuestion}
                onPress={() => setQuestionIndex((current) => Math.min(quizQuestions.length - 1, current + 1))}
                style={[styles.practiceActionButton, styles.practiceActionButtonPrimary]}
              />
            ) : (
              <SurfaceButton
                disabled={!allPracticeQuestionsAnswered}
                icon="check"
                label={uiText.finishIdea}
                onPress={onFinish}
                style={[styles.practiceActionButton, styles.practiceActionButtonPrimary]}
              />
            )}
          </View>
        ) : null}
      </View>
    );
  }

  function renderShortPlayer() {
    return (
      <View style={styles.shortPlayerStage}>
        <View {...clipSwipePanResponder.panHandlers} style={styles.shortPlayerShell}>
          <Pressable
            accessibilityRole="button"
            onPress={toggleShortPlayback}
            style={styles.shortPlayerMediaTapZone}
          >
            {hasPlayableVideo ? (
              <Video
                isLooping={false}
                onPlaybackStatusUpdate={setVideoStatus}
                posterSource={shortVideoPosterSource}
                progressUpdateIntervalMillis={100}
                ref={videoRef}
                resizeMode={ResizeMode.COVER}
                shouldPlay
                source={resolvedVideoSource}
                style={styles.shortPlayerVideo}
                useNativeControls={false}
                usePoster={Boolean(shortVideoPosterSource)}
              />
            ) : activeSceneImageUrl ? (
              <View style={styles.shortPlayerStillFrame}>
                <Image
                  blurRadius={26}
                  resizeMode="cover"
                  source={{ uri: activeSceneImageUrl }}
                  style={styles.shortPlayerStillBackdrop}
                />
                <Image
                  resizeMode="contain"
                  source={{ uri: activeSceneImageUrl }}
                  style={styles.shortPlayerStillForeground}
                />
              </View>
            ) : shortVideoPosterSource ? (
              <View style={styles.shortPlayerStillFrame}>
                <Image
                  blurRadius={26}
                  resizeMode="cover"
                  source={shortVideoPosterSource}
                  style={styles.shortPlayerStillBackdrop}
                />
                <Image
                  resizeMode="contain"
                  source={shortVideoPosterSource}
                  style={styles.shortPlayerStillForeground}
                />
              </View>
            ) : (
              <View style={styles.shortPlayerPlaceholder}>
                <Text style={styles.shortPlayerPlaceholderText}>{idea.title}</Text>
              </View>
            )}

            {displayedSubtitleText ? (
              <View
                pointerEvents="none"
                style={[
                  styles.shortSubtitleOverlay,
                  { bottom: 120 + estimatedBottomInset },
                ]}
              >
                <Text style={styles.shortSubtitleText}>
                  {displayedSubtitleText}
                </Text>
              </View>
            ) : null}

            {isFetchingVideo || isFetchingAudio ? (
              <View style={styles.shortPlayerCenterOverlay}>
                <ActivityIndicator color="#FFF8EA" size="small" />
                <Text style={styles.shortPlayerOverlayText}>
                  {isFetchingVideo ? uiText.videoPreparing : uiText.audioPreparing}
                </Text>
              </View>
            ) : null}

            {!isFetchingVideo && videoError ? (
              <View style={styles.shortPlayerCenterOverlay}>
                <Text style={styles.shortPlayerErrorText}>{videoError}</Text>
                {!isQuizUnlocked ? (
                  <SurfaceButton
                    secondary
                    label={uiText.continueWithoutVideo}
                    onPress={() => setIsQuizUnlocked(true)}
                    style={styles.shortOverlayAction}
                  />
                ) : null}
              </View>
            ) : null}

            {!isFetchingAudio && !hasPlayableVideo && audioError ? (
              <View style={styles.shortPlayerCenterOverlay}>
                <Text style={styles.shortPlayerErrorText}>{audioError}</Text>
                {!isQuizUnlocked ? (
                  <SurfaceButton
                    secondary
                    label={uiText.continueWithoutAudio}
                    onPress={() => setIsQuizUnlocked(true)}
                    style={styles.shortOverlayAction}
                  />
                ) : null}
              </View>
            ) : null}
          </Pressable>

          {clipSwipeHint ? (
            <View
              pointerEvents="none"
              style={[
                styles.shortClipSwipeHintWrap,
                { bottom: 116 + estimatedBottomInset },
              ]}
            >
              <Text style={styles.shortClipSwipeHintText}>{clipSwipeHint}</Text>
            </View>
          ) : null}

          {isQuizUnlocked ? (
            <View
              style={[
                styles.shortPlayerQuizCtaWrap,
                { bottom: 96 + estimatedBottomInset },
              ]}
            >
              {quizQuestions.length ? (
                <SurfaceButton
                  icon="quiz"
                  label={uiText.startQuiz}
                  onPress={openShortQuiz}
                  style={styles.shortPlayerQuizCta}
                />
              ) : (
                <SurfaceButton
                  icon="check"
                  label={uiText.finishIdea}
                  onPress={onFinish}
                  style={styles.shortPlayerQuizCta}
                />
              )}
            </View>
          ) : null}

          <View
            pointerEvents="box-none"
            style={[
              styles.shortPlayerBottomOverlay,
              { bottom: 44 + estimatedBottomInset },
            ]}
          >
            <ShortsSeekBar
              bubbleLabel={formatAudioTimeLabel(
                scrubPreviewMs !== null ? scrubPreviewMs / 1000 : effectivePlaybackTimeMs / 1000
              )}
              disabled={clipDurationMs <= 0}
              onScrubEnd={handleScrubEnd}
              onScrubStart={handleScrubStart}
              onScrubUpdate={handleScrubUpdate}
              progress={displayedProgress}
              showBubble={scrubPreviewMs !== null}
            />
          </View>

          <View
            pointerEvents="box-none"
            style={[
              styles.shortTopOverlay,
              { top: estimatedTopInset },
            ]}
          >
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.shortBackButton}>
              <Feather color="#000000" name="chevron-left" size={34} />
            </Pressable>
            {totalClips > 1 ? (
              <View style={styles.clipCounterBadge}>
                <Text style={styles.clipCounterText}>{clipIndex + 1}/{totalClips}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  function renderShortQuizMode() {
    return (
      <ScrollView
        contentContainerStyle={styles.shortQuizScreenContent}
        showsVerticalScrollIndicator={false}
        style={styles.shortQuizScreenScroll}
      >
        {renderQuiz()}
      </ScrollView>
    );
  }

  if (isQuizMode) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.lessonScreenShell}>
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" onPress={() => setIsQuizMode(false)} style={styles.roundButton}>
              <Feather color={palette.ink} name="chevron-left" size={24} />
            </Pressable>
            <View style={styles.topBarTitleWrap}>
              <Text numberOfLines={2} style={styles.topBarTitle}>
                {uiText.startQuiz}
              </Text>
            </View>
            <View style={styles.topBarSpacer} />
          </View>
          {renderShortQuizMode()}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.shortFullscreenRoot}>
      <StatusBar style="light" />
      <View style={styles.lessonScreenShell}>
        {renderShortPlayer()}
        {!isChatOpen ? renderActionRail() : null}

        {isChatOpen ? (
          <View style={styles.chatOverlay}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsChatOpen(false)}
              style={styles.chatBackdrop}
            />

            <View
              style={[
                styles.chatSheet,
                {
                  height: chatSheetHeight,
                  marginBottom: chatBottomGap + chatKeyboardOffset,
                  marginTop: chatTopOffset,
                },
              ]}
            >
              <View style={styles.chatSheetHandle} />

              <View style={styles.chatSheetHeader}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsChatOpen(false)}
                  style={styles.chatCloseButton}
                >
                  <Feather color={palette.ink} name="x" size={20} />
                </Pressable>
              </View>

              <ScrollView
                ref={chatScrollRef}
                contentContainerStyle={[
                  styles.chatMessagesContent,
                  chatMessages.length === 0 && styles.chatMessagesContentEmpty,
                ]}
                onContentSizeChange={() => scrollChatToEnd()}
                showsVerticalScrollIndicator={false}
                style={styles.chatMessagesScroll}
              >
                {chatMessages.length === 0 ? (
                  <View style={styles.chatEmptyState}>
                    <MaterialIcons color={palette.accent} name="forum" size={24} />
                    <Text style={styles.chatEmptyTitle}>
                      {appLanguage === "ko" ? "ChatGPT에게 물어보기" : "Ask ChatGPT"}
                    </Text>
                    <Text style={styles.chatEmptyBody}>{uiText.askBody}</Text>
                  </View>
                ) : null}

                {chatMessages.map((message) => {
                  const isUser = message.role === "user";

                  return (
                    <View
                      key={message.id}
                      style={[
                        styles.chatMessageBubble,
                        isUser ? styles.chatMessageBubbleUser : styles.chatMessageBubbleAssistant,
                      ]}
                    >
                      <Text style={styles.chatMessageText}>{message.content}</Text>
                    </View>
                  );
                })}

                {streamingReplyText ? (
                  <View style={[styles.chatMessageBubble, styles.chatMessageBubbleAssistant]}>
                    <Text style={styles.chatMessageText}>{streamingReplyText}</Text>
                  </View>
                ) : null}
              </ScrollView>

              {chatError ? <Text style={styles.chatErrorText}>{chatError}</Text> : null}

              <View style={styles.chatComposer}>
                <TextInput
                  multiline
                  onChangeText={setChatInput}
                  onSubmitEditing={handleSendChatMessage}
                  placeholder={uiText.askPlaceholder}
                  placeholderTextColor={withAlpha(palette.muted, "8C")}
                  style={styles.chatInput}
                  value={chatInput}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!chatInput.trim() || isChatLoading || isAssistantStreaming}
                  onPress={handleSendChatMessage}
                  style={[
                    styles.chatSendButton,
                    (!chatInput.trim() || isChatLoading || isAssistantStreaming) &&
                      styles.chatSendButtonDisabled,
                  ]}
                >
                  {isChatLoading || isAssistantStreaming ? (
                    <ActivityIndicator color="#FFF8EA" size="small" />
                  ) : (
                    <Feather color="#FFF8EA" name="arrow-up" size={18} />
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function LessonScreen({
  pack,
  packId,
  idea,
  chatMessages,
  onClose,
  onFinish,
  onUpdateChat,
  appLanguage,
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [practiceQuestionIndex, setPracticeQuestionIndex] = useState(0);
  const [isPracticeUnlocked, setIsPracticeUnlocked] = useState(false);
  const [selectedAnswersByQuestion, setSelectedAnswersByQuestion] = useState({});
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [streamingReplyText, setStreamingReplyText] = useState("");
  const [isAssistantStreaming, setIsAssistantStreaming] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const pagerRef = useRef(null);
  const chatScrollRef = useRef(null);
  const chatRequestTokenRef = useRef(0);
  const chatTypingTimerRef = useRef(null);
  const practiceOpenRequestRef = useRef(false);
  const practiceQuestions = useMemo(() => getPracticeQuestions(idea), [idea?.id]);
  const lessonLanguageCode = inferLessonLanguage(getLessonSampleText(pack, idea));
  const displayedReflectionPrompt = normalizeReflectionPromptForDisplay(
    idea.reflectionPrompt,
    lessonLanguageCode
  );
  const ideaContext = {
    ...buildIdeaContext(pack, idea),
    reflectionPrompt: displayedReflectionPrompt,
  };
  const uiText = getLessonUiText(pack, idea, appLanguage);
  const currentPracticeQuestion = practiceQuestions[practiceQuestionIndex] || null;
  const steps = [
    ...idea.lessonCards.map((card) => ({
      id: card.id,
      type: "lesson",
      card,
    })),
    {
      id: `${idea.id}-summary`,
      type: "summary",
    },
    ...(isPracticeUnlocked
      ? [
          {
            id: `${idea.id}-practice`,
            type: "practice",
          },
        ]
      : []),
  ];
  const activeStep = steps[currentStepIndex] || steps[0];
  const totalSteps = steps.length;
  const shouldShowFloatingTutorDock = activeStep.type === "lesson" && !isChatOpen;
  const selectedAnswerIndex = currentPracticeQuestion
    ? selectedAnswersByQuestion[currentPracticeQuestion.id]
    : null;
  const hasAnsweredCurrentQuestion = selectedAnswerIndex !== null && selectedAnswerIndex !== undefined;
  const answeredQuestionCount = practiceQuestions.filter(
    (question) => selectedAnswersByQuestion[question.id] !== undefined
  ).length;
  const correctAnswerCount = practiceQuestions.filter(
    (question) => selectedAnswersByQuestion[question.id] === question.correctIndex
  ).length;
  const hasMultiplePracticeQuestions = practiceQuestions.length > 1;
  const allPracticeQuestionsAnswered =
    practiceQuestions.length > 0 && answeredQuestionCount === practiceQuestions.length;

  useEffect(() => {
    setCurrentStepIndex(0);
    setPracticeQuestionIndex(0);
    setIsPracticeUnlocked(false);
    setSelectedAnswersByQuestion({});
    setChatInput("");
    setChatError("");
    setIsChatLoading(false);
    setIsChatOpen(false);
    setStreamingReplyText("");
    setIsAssistantStreaming(false);
    setKeyboardHeight(0);
    if (chatTypingTimerRef.current) {
      clearTimeout(chatTypingTimerRef.current);
      chatTypingTimerRef.current = null;
    }
    chatRequestTokenRef.current += 1;
  }, [idea.id, packId]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(Math.max(0, Math.round(event.endCoordinates?.height || 0)));
      scrollChatToEnd(false);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isPracticeUnlocked || !practiceOpenRequestRef.current) {
      return;
    }

    practiceOpenRequestRef.current = false;
    requestAnimationFrame(() => {
      scrollToStep(steps.length - 1);
    });
  }, [isPracticeUnlocked, steps.length]);

  function scrollChatToEnd(animated = true) {
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollToEnd({ animated });
    });
  }

  useEffect(() => {
    if (!isChatOpen) {
      return;
    }

    scrollChatToEnd(false);
  }, [isChatOpen, chatMessages.length, isChatLoading, isAssistantStreaming, streamingReplyText]);

  useEffect(() => {
    return () => {
      if (chatTypingTimerRef.current) {
        clearTimeout(chatTypingTimerRef.current);
        chatTypingTimerRef.current = null;
      }
    };
  }, []);

  function startStreamingAssistantReply(reply, baseMessages, requestToken) {
    if (chatTypingTimerRef.current) {
      clearTimeout(chatTypingTimerRef.current);
      chatTypingTimerRef.current = null;
    }

    setStreamingReplyText("");
    setIsAssistantStreaming(true);

    let visibleLength = 0;
    const totalLength = reply.length;
    const baseStep =
      totalLength > 900 ? 18 : totalLength > 600 ? 14 : totalLength > 320 ? 10 : 6;

    const stepReply = () => {
      if (chatRequestTokenRef.current !== requestToken) {
        return;
      }

      const nextLength = Math.min(totalLength, visibleLength + baseStep);
      visibleLength = nextLength;
      setStreamingReplyText(reply.slice(0, nextLength));
      scrollChatToEnd(false);

      if (nextLength >= totalLength) {
        onUpdateChat([...baseMessages, createChatMessage("assistant", reply)]);
        requestAnimationFrame(() => {
          if (chatRequestTokenRef.current === requestToken) {
            setStreamingReplyText("");
            setIsAssistantStreaming(false);
          }
        });
        chatTypingTimerRef.current = null;
        return;
      }

      const trailingCharacter = reply[nextLength - 1] || "";
      const delay = /[.!?。！？]/u.test(trailingCharacter) ? 48 : 18;
      chatTypingTimerRef.current = setTimeout(stepReply, delay);
    };

    chatTypingTimerRef.current = setTimeout(stepReply, 36);
  }

  function openChatSheet() {
    setChatError("");
    setIsChatOpen(true);
  }

  function scrollToStep(nextIndex) {
    if (nextIndex < 0 || nextIndex >= totalSteps) {
      return;
    }

    setCurrentStepIndex(nextIndex);

    if (viewportHeight > 0) {
      pagerRef.current?.scrollToOffset({
        animated: true,
        offset: nextIndex * viewportHeight,
      });
    }
  }

  function handleBack() {
    if (currentStepIndex === 0) {
      onClose();
      return;
    }

    scrollToStep(currentStepIndex - 1);
  }

  function handleMomentumEnd(event) {
    if (!viewportHeight) {
      return;
    }

    const nextIndex = Math.round(event.nativeEvent.contentOffset.y / viewportHeight);
    if (nextIndex !== currentStepIndex) {
      setCurrentStepIndex(nextIndex);
    }
  }

  async function sendChatMessage(rawQuestion, options = {}) {
    const nextQuestion = String(rawQuestion || "").replace(/\s+/g, " ").trim();

    if (!nextQuestion || isChatLoading || isAssistantStreaming) {
      return;
    }

    if (options.clearComposer) {
      setChatInput("");
    }

    openChatSheet();

    const userMessage = createChatMessage("user", nextQuestion);
    const nextMessages = [...chatMessages, userMessage];

    onUpdateChat(nextMessages);
    setChatError("");
    setIsChatLoading(true);
    setStreamingReplyText("");
    setIsAssistantStreaming(false);

    const requestToken = chatRequestTokenRef.current + 1;
    chatRequestTokenRef.current = requestToken;

    try {
      const response = await fetch(`${API_BASE_URL}/api/idea-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ideaContext,
          messages: serializeChatMessagesForApi(nextMessages),
        }),
      });

      let data = {};

      try {
        data = await response.json();
      } catch (parseError) {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || uiText.answerError);
      }

      const reply = String(data.reply || "").trim();

      if (!reply) {
        throw new Error(uiText.answerError);
      }

      if (chatRequestTokenRef.current === requestToken) {
        startStreamingAssistantReply(reply, nextMessages, requestToken);
      }
    } catch (error) {
      if (chatRequestTokenRef.current === requestToken) {
        if (chatTypingTimerRef.current) {
          clearTimeout(chatTypingTimerRef.current);
          chatTypingTimerRef.current = null;
        }
        setStreamingReplyText("");
        setIsAssistantStreaming(false);
        setChatError(error.message || uiText.answerError);
      }
    } finally {
      if (chatRequestTokenRef.current === requestToken) {
        setIsChatLoading(false);
      }
    }
  }

  async function handleSendChatMessage() {
    await sendChatMessage(chatInput, { clearComposer: true });
  }

  function renderTutorDock() {
    return (
      <View style={styles.aiDockSection}>
        <Pressable accessibilityRole="button" onPress={openChatSheet} style={styles.aiDockBar}>
          <View style={styles.aiDockBarIconShell}>
            <View style={styles.aiDockBarLogoCrop}>
              <Image
                resizeMode="cover"
                source={OPENAI_BLOSSOM_ICON}
                style={styles.aiDockBarLogo}
              />
            </View>
          </View>
          <View style={styles.aiDockBarText}>
            <Text style={styles.aiDockBarTitle}>{uiText.aiDockTitle}</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  function handleOpenPractice() {
    if (practiceQuestions.length === 0) {
      onFinish();
      return;
    }

    if (isPracticeUnlocked) {
      scrollToStep(steps.length - 1);
      return;
    }

    practiceOpenRequestRef.current = true;
    setIsPracticeUnlocked(true);
  }

  function renderStepPage(step, stepIndex) {
    if (step.type === "lesson") {
      const card = step.card;

      return (
        <View style={[styles.lessonStepPageContent, styles.lessonStepPageContentWithDock]}>
          <View style={styles.lessonStepContent}>
            <View style={styles.lessonCopyBlock}>
              <Text style={styles.lessonEyebrowLabel}>{card.eyebrow}</Text>
              <Text style={styles.lessonTitle}>{card.title}</Text>
              <View>{renderRichText(card.body, styles.lessonBody)}</View>
              <View style={{ marginTop: 8 }}>{renderRichText(card.support, styles.lessonSupport)}</View>
            </View>
          </View>
        </View>
      );
    }

    if (step.type === "summary") {
      return (
        <View style={[styles.lessonStepPageContent, styles.lessonStepPageContentWithDock]}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, gap: 16, justifyContent: "center" }}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{uiText.summaryHeading}</Text>
              {idea.summaryBullets.map((bullet) => (
                <View key={bullet} style={styles.summaryBulletRow}>
                  <Text style={styles.summaryBulletDot}>•</Text>
                  <Text style={styles.summaryBullet}>{bullet}</Text>
                </View>
              ))}
              <View style={styles.summaryDivider} />
              <Text style={styles.summaryPromptLabel}>{uiText.reflection}</Text>
              <Text style={styles.summaryPrompt}>{displayedReflectionPrompt}</Text>
            </View>
          </ScrollView>
          <View style={styles.lessonStepFooter}>
            {practiceQuestions.length > 0 ? (
              <SurfaceButton icon="quiz" label={uiText.takeQuiz} onPress={handleOpenPractice} />
            ) : (
              <SurfaceButton label={uiText.finishIdea} onPress={onFinish} />
            )}
          </View>
        </View>
      );
    }

    return (
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.practiceStepScrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        style={styles.stepScrollViewport}
      >
        <View style={styles.practiceStepContent}>
          {currentPracticeQuestion ? (
            <>
              <View style={styles.practiceHeaderRow}>
                <Text style={styles.practiceHeaderLabel}>
                  {hasMultiplePracticeQuestions
                    ? uiText.questionLabel(practiceQuestionIndex + 1, practiceQuestions.length)
                    : uiText.practiceQuestion}
                </Text>
                <Text style={styles.practiceHeaderScore}>
                  {uiText.correctCount(correctAnswerCount, practiceQuestions.length)}
                </Text>
              </View>

              <View style={styles.practiceQuestionCard}>
                <Text style={styles.practiceQuestion}>{currentPracticeQuestion.question}</Text>
              </View>

              <View style={styles.practiceOptionsStack}>
                {currentPracticeQuestion.options.map((option, index) => {
                  const isSelected = selectedAnswerIndex === index;
                  const isCorrect = index === currentPracticeQuestion.correctIndex;
                  const showState = hasAnsweredCurrentQuestion && (isSelected || isCorrect);

                  return (
                    <Pressable
                      key={`${currentPracticeQuestion.id}-${option}`}
                      accessibilityRole="button"
                      onPress={() => {
                        setSelectedAnswersByQuestion((current) => ({
                          ...current,
                          [currentPracticeQuestion.id]: index,
                        }));
                      }}
                      style={[
                        styles.optionCard,
                        isSelected && styles.optionCardSelected,
                        showState && isCorrect && styles.optionCardCorrect,
                        showState && isSelected && !isCorrect && styles.optionCardWrong,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                          showState && isCorrect && styles.optionTextCorrect,
                          showState && isSelected && !isCorrect && styles.optionTextWrong,
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {hasAnsweredCurrentQuestion ? (
                <View style={styles.feedbackCard}>
                  <Text style={styles.feedbackTitle}>
                    {selectedAnswerIndex === currentPracticeQuestion.correctIndex
                      ? uiText.correct
                      : uiText.almost}
                  </Text>
                  <Text style={styles.feedbackBody}>{currentPracticeQuestion.explanation}</Text>
                </View>
              ) : null}

              {allPracticeQuestionsAnswered ? (
                <View style={styles.practiceScoreCard}>
                  <Text style={styles.practiceScoreTitle}>
                    {correctAnswerCount === practiceQuestions.length
                      ? uiText.strongUnderstanding
                      : uiText.correctCount(correctAnswerCount, practiceQuestions.length)}
                  </Text>
                  <Text style={styles.practiceScoreBody}>
                    {correctAnswerCount === practiceQuestions.length
                      ? uiText.strongUnderstandingBody
                      : uiText.reviewRetry}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.feedbackCard}>
              <Text style={styles.feedbackTitle}>{uiText.practiceComingSoon}</Text>
              <Text style={styles.feedbackBody}>{uiText.practiceComingSoonBody}</Text>
            </View>
          )}
        </View>

        <View style={styles.lessonStepFooter}>
          {hasMultiplePracticeQuestions ? (
            <View style={styles.practiceActionRow}>
              <SurfaceButton
                disabled={practiceQuestionIndex === 0}
                label={uiText.previous}
                onPress={() => setPracticeQuestionIndex((current) => Math.max(0, current - 1))}
                secondary
                style={[styles.practiceActionButton, styles.practiceActionButtonSecondary]}
              />
              {practiceQuestionIndex < practiceQuestions.length - 1 ? (
                <SurfaceButton
                  disabled={!hasAnsweredCurrentQuestion}
                  label={uiText.nextQuestion}
                  onPress={() =>
                    setPracticeQuestionIndex((current) =>
                      Math.min(practiceQuestions.length - 1, current + 1)
                    )
                  }
                  style={[styles.practiceActionButton, styles.practiceActionButtonPrimary]}
                />
              ) : (
                <SurfaceButton
                  disabled={!allPracticeQuestionsAnswered}
                  icon="arrow-forward"
                  label={uiText.finishIdea}
                  onPress={onFinish}
                  style={[styles.practiceActionButton, styles.practiceActionButtonPrimary]}
                />
              )}
            </View>
          ) : (
            <SurfaceButton
              disabled={!hasAnsweredCurrentQuestion}
              icon="arrow-forward"
              label={uiText.finishIdea}
              onPress={onFinish}
            />
          )}
        </View>
      </ScrollView>
    );
  }

  const estimatedBottomInset = Platform.OS === "ios" && windowHeight >= 780 ? 34 : 0;
  const chatTopOffset =
    keyboardHeight > 0
      ? Math.max(96, Math.round(windowHeight * 0.13))
      : Math.max(148, Math.round(windowHeight * 0.19));
  const chatBottomGap =
    keyboardHeight > 0 ? (Platform.OS === "ios" ? 8 : 6) : CHAT_ENTRY_BOTTOM_OFFSET;
  const chatKeyboardOffset =
    keyboardHeight > 0
      ? Math.max(
          0,
          keyboardHeight - (Platform.OS === "ios" ? estimatedBottomInset : 24)
        )
      : 0;
  const chatAvailableHeight = Math.max(
    0,
    windowHeight - chatTopOffset - chatBottomGap - chatKeyboardOffset
  );
  const chatTargetHeight =
    keyboardHeight > 0 ? Math.round(windowHeight * 0.46) : Math.round(windowHeight * 0.52);
  const chatMinimumHeight = keyboardHeight > 0 ? 260 : 320;
  const chatSheetHeight = Math.min(
    chatAvailableHeight,
    Math.max(chatMinimumHeight, chatTargetHeight)
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.lessonScreenShell}>
        <View style={styles.lessonFlowScreen}>
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" onPress={handleBack} style={styles.roundButton}>
              <Feather color={palette.ink} name="chevron-left" size={24} />
            </Pressable>
            <View style={styles.topBarTitleWrap}>
              <Text numberOfLines={2} style={[styles.topBarTitle, styles.lessonScreenTitle]}>
                {idea.title}
              </Text>
            </View>
            <View style={styles.topBarSpacer} />
          </View>

          <ProgressPills activeIndex={currentStepIndex} total={totalSteps} />

          <View
            onLayout={(event) => {
              const nextHeight = Math.round(event.nativeEvent.layout.height);
              if (nextHeight && nextHeight !== viewportHeight) {
                setViewportHeight(nextHeight);
              }
            }}
            style={styles.lessonPagerViewport}
          >
            {viewportHeight ? (
              <FlatList
                ref={pagerRef}
                bounces={false}
                data={steps}
                decelerationRate="fast"
                key={idea.id}
                keyExtractor={(item) => item.id}
                onMomentumScrollEnd={handleMomentumEnd}
                pagingEnabled
                renderItem={({ item, index }) => (
                  <View style={[styles.lessonStepPage, { height: viewportHeight }]}>
                    {renderStepPage(item, index)}
                  </View>
                )}
                showsVerticalScrollIndicator={false}
              />
            ) : null}
          </View>
        </View>

        {shouldShowFloatingTutorDock ? (
          <View pointerEvents="box-none" style={styles.lessonFloatingDockWrap}>
            {renderTutorDock()}
          </View>
        ) : null}

        {isChatOpen ? (
          <View style={styles.chatOverlay}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsChatOpen(false)}
              style={styles.chatBackdrop}
            />

            <View
              style={[
                styles.chatSheet,
                {
                  height: chatSheetHeight,
                  marginBottom: chatBottomGap + chatKeyboardOffset,
                  marginTop: chatTopOffset,
                },
              ]}
            >
              <View style={styles.chatSheetHandle} />

              <View style={styles.chatSheetHeader}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsChatOpen(false)}
                  style={styles.chatCloseButton}
                >
                  <Feather color={palette.ink} name="x" size={20} />
                </Pressable>
              </View>

              <ScrollView
                ref={chatScrollRef}
                contentContainerStyle={[
                  styles.chatMessagesContent,
                  chatMessages.length === 0 && styles.chatMessagesContentEmpty,
                ]}
                onContentSizeChange={() => scrollChatToEnd()}
                showsVerticalScrollIndicator={false}
                style={styles.chatMessagesScroll}
              >
                {chatMessages.length === 0 ? (
                  <View style={styles.chatEmptyState}>
                    <MaterialIcons color={palette.accent} name="forum" size={24} />
                    <Text style={styles.chatEmptyTitle}>{uiText.askTitle}</Text>
                    <Text style={styles.chatEmptyBody}>{uiText.askBody}</Text>
                  </View>
                ) : null}

                {chatMessages.map((message) => {
                  const isUser = message.role === "user";

                  return (
                    <View
                      key={message.id}
                      style={[
                        styles.chatMessageBubble,
                        isUser ? styles.chatMessageBubbleUser : styles.chatMessageBubbleAssistant,
                      ]}
                    >
                      <Text style={styles.chatMessageText}>{message.content}</Text>
                    </View>
                  );
                })}

                {(isChatLoading || isAssistantStreaming) ? (
                  <View style={[styles.chatMessageBubble, styles.chatMessageBubbleAssistant]}>
                    {streamingReplyText ? (
                      <Text style={styles.chatMessageText}>
                        {streamingReplyText}
                        <Text style={styles.chatTypingCursor}>▍</Text>
                      </Text>
                    ) : (
                      <View style={styles.chatLoadingRow}>
                        <ActivityIndicator color={palette.accent} size="small" />
                        <Text style={styles.chatLoadingText}>{uiText.thinking}</Text>
                      </View>
                    )}
                  </View>
                ) : null}
              </ScrollView>

              {chatError ? (
                <View style={styles.chatErrorCard}>
                  <Text style={styles.chatErrorText}>{chatError}</Text>
                </View>
              ) : null}

              <View style={styles.chatComposer}>
                <TextInput
                  multiline
                  onChangeText={setChatInput}
                  onFocus={() => scrollChatToEnd(false)}
                  placeholder={uiText.askPlaceholder}
                  placeholderTextColor={withAlpha(palette.muted, "90")}
                  style={styles.chatInput}
                  value={chatInput}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!chatInput.trim() || isChatLoading || isAssistantStreaming}
                  onPress={handleSendChatMessage}
                  style={[
                    styles.chatSendButton,
                    (!chatInput.trim() || isChatLoading || isAssistantStreaming) &&
                      styles.chatSendButtonDisabled,
                  ]}
                >
                  <Feather color="#FFF8EA" name="arrow-up" size={18} />
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
      {isChatOpen && estimatedBottomInset > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.chatSafeAreaDimmer,
            {
              height: estimatedBottomInset,
            },
          ]}
        />
      ) : null}
    </SafeAreaView>
  );
}

function SummaryScreen({ idea, onBack, onClose, onPractice }) {
  const totalSteps = idea.lessonCards.length + 2;
  const activeIndex = idea.lessonCards.length;
  const lessonLanguageCode = inferLessonLanguage(
    [
      idea?.title,
      ...(idea?.summaryBullets || []),
      idea?.reflectionPrompt,
      ...(idea?.lessonCards || []).flatMap((card) => [card?.eyebrow, card?.title, card?.body]),
    ]
      .filter(Boolean)
      .join(" ")
  );
  const displayedReflectionPrompt = normalizeReflectionPromptForDisplay(
    idea.reflectionPrompt,
    lessonLanguageCode
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.roundButton}>
            <Feather color={palette.ink} name="chevron-left" size={24} />
          </Pressable>
          <View style={styles.topBarTitleWrap}>
            <Text style={styles.topBarTitle}>{idea.title}</Text>
            <Text style={styles.topBarCaption}>Summary</Text>
          </View>
          <View style={styles.topBarActions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.roundButton}>
              <Feather color={palette.ink} name="x" size={22} />
            </Pressable>
          </View>
        </View>

        <ProgressPills activeIndex={activeIndex} total={totalSteps} />

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{idea.title} distorts judgment when:</Text>
          {idea.summaryBullets.map((bullet) => (
            <View key={bullet} style={styles.summaryBulletRow}>
              <Text style={styles.summaryBulletDot}>•</Text>
              <Text style={styles.summaryBullet}>{bullet}</Text>
            </View>
          ))}
          <View style={styles.summaryDivider} />
          <Text style={styles.summaryPromptLabel}>Reflection</Text>
          <Text style={styles.summaryPrompt}>{displayedReflectionPrompt}</Text>
        </View>

        <SurfaceButton icon="quiz" label="Try practice" onPress={onPractice} />
      </ScrollView>
    </SafeAreaView>
  );
}

function PracticeScreen({
  idea,
  onBack,
  onClose,
  onSelectAnswer,
  onFinish,
  selectedAnswerIndex,
}) {
  const practiceQuestions = useMemo(() => getPracticeQuestions(idea), [idea?.id]);
  const practiceQuestion = practiceQuestions[0] || null;
  const totalSteps = idea.lessonCards.length + 2;
  const activeIndex = idea.lessonCards.length + 1;
  const hasAnswered = selectedAnswerIndex !== null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.roundButton}>
            <Feather color={palette.ink} name="chevron-left" size={24} />
          </Pressable>
          <View style={styles.topBarTitleWrap}>
            <Text style={styles.topBarTitle}>{idea.title}</Text>
            <Text style={styles.topBarCaption}>Practice</Text>
          </View>
          <View style={styles.topBarActions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.roundButton}>
              <Feather color={palette.ink} name="x" size={22} />
            </Pressable>
          </View>
        </View>

        <ProgressPills activeIndex={activeIndex} total={totalSteps} />

        <View style={styles.practiceQuestionCard}>
          <Text style={styles.practiceQuestion}>
            {practiceQuestion?.question || "Practice question"}
          </Text>
        </View>

        <View style={styles.mascotShell}>
          <View style={styles.mascotBubble}>
            <MaterialIcons color="#FFF4DE" name="local-fire-department" size={54} />
          </View>
        </View>

        {(practiceQuestion?.options || []).map((option, index) => {
          const isSelected = selectedAnswerIndex === index;
          const isCorrect = index === practiceQuestion?.correctIndex;
          const showState = hasAnswered && (isSelected || isCorrect);

          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              onPress={() => onSelectAnswer(index)}
              style={[
                styles.optionCard,
                isSelected && styles.optionCardSelected,
                showState && isCorrect && styles.optionCardCorrect,
                showState && isSelected && !isCorrect && styles.optionCardWrong,
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  isSelected && styles.optionTextSelected,
                  showState && isCorrect && styles.optionTextCorrect,
                  showState && isSelected && !isCorrect && styles.optionTextWrong,
                ]}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}

        {hasAnswered ? (
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackTitle}>
              {selectedAnswerIndex === practiceQuestion?.correctIndex
                ? "Exactly."
                : "Close, but not quite."}
            </Text>
            <Text style={styles.feedbackBody}>
              {practiceQuestion?.explanation || "Review the lesson and compare the choices again."}
            </Text>
          </View>
        ) : null}

        <SurfaceButton
          icon="arrow-forward"
          disabled={!hasAnswered}
          label="Finish idea"
          onPress={onFinish}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function PackReviewScreen({ pack, onBack, onClose, onFinish, appLanguage }) {
  const uiText = getPackUiText(pack, appLanguage);
  const reviewQuestions = useMemo(() => getPackReviewQuestions(pack), [pack?.id]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswersByQuestion, setSelectedAnswersByQuestion] = useState({});
  const currentQuestion = reviewQuestions[questionIndex] || null;
  const selectedAnswerIndex = currentQuestion ? selectedAnswersByQuestion[currentQuestion.id] : null;
  const hasAnsweredCurrentQuestion =
    selectedAnswerIndex !== null && selectedAnswerIndex !== undefined;
  const correctAnswerCount = reviewQuestions.filter(
    (question) => selectedAnswersByQuestion[question.id] === question.correctIndex
  ).length;
  const answeredQuestionCount = reviewQuestions.filter(
    (question) => selectedAnswersByQuestion[question.id] !== undefined
  ).length;
  const allQuestionsAnswered =
    reviewQuestions.length > 0 && answeredQuestionCount === reviewQuestions.length;

  useEffect(() => {
    setQuestionIndex(0);
    setSelectedAnswersByQuestion({});
  }, [pack.id]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.roundButton}>
            <Feather color={palette.ink} name="chevron-left" size={24} />
          </Pressable>
          <View style={styles.topBarTitleWrap}>
            <Text numberOfLines={2} style={styles.topBarTitle}>
              {getCompactTitle(pack.title, 3)}
            </Text>
            <Text style={styles.topBarCaption}>{uiText.finalReview}</Text>
          </View>
          <View style={styles.topBarActions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.roundButton}>
              <Feather color={palette.ink} name="x" size={22} />
            </Pressable>
          </View>
        </View>

        <ProgressPills activeIndex={questionIndex} total={Math.max(reviewQuestions.length, 1)} />

        {currentQuestion ? (
          <>
            <View style={styles.practiceHeaderRow}>
              <Text style={styles.practiceHeaderLabel}>
                {uiText.questionLabel(questionIndex + 1, reviewQuestions.length)}
              </Text>
              <Text style={styles.practiceHeaderScore}>
                {uiText.correctCount(correctAnswerCount, reviewQuestions.length)}
              </Text>
            </View>

            <View style={styles.practiceQuestionCard}>
              <Text style={styles.practiceQuestion}>{currentQuestion.question}</Text>
            </View>

            <View style={styles.practiceOptionsStack}>
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedAnswerIndex === index;
                const isCorrect = index === currentQuestion.correctIndex;
                const showState = hasAnsweredCurrentQuestion && (isSelected || isCorrect);

                return (
                  <Pressable
                    key={`${currentQuestion.id}-${option}`}
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedAnswersByQuestion((current) => ({
                        ...current,
                        [currentQuestion.id]: index,
                      }));
                    }}
                    style={[
                      styles.optionCard,
                      isSelected && styles.optionCardSelected,
                      showState && isCorrect && styles.optionCardCorrect,
                      showState && isSelected && !isCorrect && styles.optionCardWrong,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                        showState && isCorrect && styles.optionTextCorrect,
                        showState && isSelected && !isCorrect && styles.optionTextWrong,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {hasAnsweredCurrentQuestion ? (
              <View style={styles.feedbackCard}>
                <Text style={styles.feedbackTitle}>
                  {selectedAnswerIndex === currentQuestion.correctIndex
                    ? uiText.correct
                    : uiText.almost}
                </Text>
                <Text style={styles.feedbackBody}>{currentQuestion.explanation}</Text>
              </View>
            ) : null}

            {allQuestionsAnswered ? (
              <View style={styles.practiceScoreCard}>
                <Text style={styles.practiceScoreTitle}>
                  {uiText.finalReviewScore(correctAnswerCount, reviewQuestions.length)}
                </Text>
                <Text style={styles.practiceScoreBody}>
                  {correctAnswerCount === reviewQuestions.length
                    ? uiText.strongUnderstandingBody
                    : uiText.reviewRetry}
                </Text>
              </View>
            ) : null}

            <View style={styles.practiceActionRow}>
              <SurfaceButton
                disabled={questionIndex === 0}
                label={uiText.previous}
                onPress={() => setQuestionIndex((current) => Math.max(0, current - 1))}
                secondary
                style={[styles.practiceActionButton, styles.practiceActionButtonSecondary]}
              />
              {questionIndex < reviewQuestions.length - 1 ? (
                <SurfaceButton
                  disabled={!hasAnsweredCurrentQuestion}
                  label={uiText.nextQuestion}
                  onPress={() =>
                    setQuestionIndex((current) => Math.min(reviewQuestions.length - 1, current + 1))
                  }
                  style={[styles.practiceActionButton, styles.practiceActionButtonPrimary]}
                />
              ) : (
                <SurfaceButton
                  disabled={!allQuestionsAnswered}
                  icon="check"
                  label={uiText.finishFinalReview}
                  onPress={() =>
                    onFinish({
                      score: correctAnswerCount,
                      totalQuestions: reviewQuestions.length,
                    })
                  }
                  style={[styles.practiceActionButton, styles.practiceActionButtonPrimary]}
                />
              )}
            </View>
          </>
        ) : (
          <>
            <View style={styles.feedbackCard}>
              <Text style={styles.feedbackTitle}>{uiText.finalReview}</Text>
              <Text style={styles.feedbackBody}>{uiText.finalReviewBody}</Text>
            </View>
            <SurfaceButton label={uiText.backHome} onPress={onClose} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CompletionScreen({
  pack,
  progressByPack,
  onBackHome,
  onReviewPack,
  onNextIdea,
  onTakePackReview,
  appLanguage,
}) {
  const completedIdeaIds = getCompletedIdeaIds(progressByPack, pack.id);
  const nextIdea = getNextIdea(pack, completedIdeaIds);
  const uiText = getPackUiText(pack, appLanguage);
  const packReviewCompleted = hasPackReviewCompleted(progressByPack, pack.id);
  const packReviewResult = getPackReviewResult(progressByPack, pack.id);
  const hasPackReview = getPackReviewQuestions(pack).length > 0;
  const shouldShowPackReview = !nextIdea && hasPackReview && !packReviewCompleted;
  const heroTitle = shouldShowPackReview
    ? uiText.finalReviewPending
    : !nextIdea && packReviewResult
      ? uiText.finalReviewComplete
      : uiText.niceWork;
  const heroBody = shouldShowPackReview
    ? uiText.finalReviewBody
    : !nextIdea && packReviewResult
      ? uiText.finalReviewResult(packReviewResult.score, packReviewResult.totalQuestions)
      : uiText.completionBody;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
        <View style={styles.completionHero}>
          <View style={styles.completionStar}>
            <MaterialIcons color="#FFEDD1" name="auto-awesome" size={64} />
          </View>
          <Text style={styles.completionTitle}>{heroTitle}</Text>
          <Text style={styles.completionBody}>{heroBody}</Text>
        </View>

        <View style={styles.completionList}>
          {pack.ideas.slice(0, 3).map((idea) => {
            const isDone = completedIdeaIds.includes(idea.id);
            const isNext = nextIdea?.id === idea.id;

            return (
              <View
                key={idea.id}
                style={[
                  styles.completionRow,
                  isDone && styles.completionRowDone,
                  isNext && styles.completionRowNext,
                ]}
              >
                <View style={styles.ideaRowLeft}>
                  <View style={styles.ideaRowIconShell}>
                    <MaterialIcons color={palette.accent} name={idea.icon} size={22} />
                  </View>
                  <View style={styles.ideaRowText}>
                    <Text numberOfLines={2} style={styles.ideaRowTitle}>
                      {idea.title}
                    </Text>
                  </View>
                </View>

                {isDone ? (
                  <MaterialIcons color={palette.success} name="check-circle" size={28} />
                ) : isNext ? (
                  <Feather color={palette.ink} name="chevron-right" size={22} />
                ) : (
                  <MaterialIcons color={palette.ink} name="lock-outline" size={24} />
                )}
              </View>
            );
          })}
        </View>

        {shouldShowPackReview ? (
          <SurfaceButton
            icon="quiz"
            label={uiText.finalReviewReady}
            onPress={onTakePackReview}
          />
        ) : nextIdea ? (
          <SurfaceButton
            icon="play-arrow"
            label={uiText.continueWith(getCompactTitle(nextIdea.title))}
            onPress={onNextIdea}
          />
        ) : (
          <SurfaceButton icon="home" label={uiText.backHome} onPress={onBackHome} />
        )}

        <SurfaceButton
          secondary
          icon="menu-book"
          label={uiText.reviewPack}
          onPress={onReviewPack}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function RootApp() {
  const {
    abortGenRef,
    activeIdea,
    activePack,
    activePackId,
    appLanguage,
    authLoading,
    chatByIdea,
    closeToPack,
    dismissPendingGeneration,
    finishIdea,
    finishPackReview,
    handleGoogleLogin,
    handleLogout,
    openIdea,
    openNextIdea,
    openPack,
    openPackReview,
    openStudio,
    packs,
    pendingGeneration,
    progressByPack,
    removeGeneratedPack,
    screen,
    session,
    setAppLanguage,
    setScreen,
    startBackgroundGenerate,
    studioEntryMode,
    studioPackFormat,
    studioPickedAsset,
    updateIdeaChat,
    updatePackTitle,
    setStudioPackFormat,
  } = useRootAppController({
    APP_UI_COPY,
    API_BASE_URL,
    BASE_PACK_IDS,
    STORAGE_KEYS,
    getCompletedIdeaIds,
    getNextIdea,
    getPackById,
    getPackReviewQuestions,
    learningPacks,
    mergePackLists,
    normalizeSourceText,
    withPackTouch,
  });

  if (authLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={palette.accent} size="large" />
      </SafeAreaView>
    );
  }

  if (!session) {
    return <LoginScreen onGoogleLogin={handleGoogleLogin} loading={false} appLanguage={appLanguage} />;
  }

  if (screen === "home") {
    return (
      <HomeScreen
        appLanguage={appLanguage}
        onChangeLanguage={setAppLanguage}
        onDismissPending={dismissPendingGeneration}
        onLogout={handleLogout}
        onOpenPack={openPack}
        onOpenStudio={openStudio}
        onRemovePack={removeGeneratedPack}
        onUpdateTitle={updatePackTitle}
        packs={packs}
        pendingGeneration={pendingGeneration}
        progressByPack={progressByPack}
        user={session?.user}
      />
    );
  }

  if (screen === "studio") {
    return (
      <StudioScreen
        appLanguage={appLanguage}
        entryMode={studioEntryMode}
        initialAsset={studioPickedAsset}
        onBack={() => setScreen("home")}
        onChangePackFormat={setStudioPackFormat}
        onStartGenerate={startBackgroundGenerate}
        packFormat={studioPackFormat}
      />
    );
  }

  if (screen === "detail") {
    return (
      <DetailScreen
        appLanguage={appLanguage}
        onBack={() => setScreen("home")}
        onStartIdea={openIdea}
        onStartPackReview={openPackReview}
        onUpdateTitle={(newTitle) => updatePackTitle(activePack.id, newTitle)}
        pack={activePack}
        progressByPack={progressByPack}
      />
    );
  }

  if (screen === "lesson") {
    if (isShortsPack(activePack)) {
      return (
        <ShortsLessonScreen
          appLanguage={appLanguage}
          chatMessages={getIdeaChatMessages(chatByIdea, activePackId, activeIdea.id)}
          idea={activeIdea}
          onClose={closeToPack}
          onFinish={finishIdea}
          onUpdateChat={(nextMessages) => updateIdeaChat(activePackId, activeIdea.id, nextMessages)}
          pack={activePack}
        />
      );
    }

    return (
      <LessonScreen
        appLanguage={appLanguage}
        chatMessages={getIdeaChatMessages(chatByIdea, activePackId, activeIdea.id)}
        idea={activeIdea}
        onClose={closeToPack}
        onFinish={finishIdea}
        onUpdateChat={(nextMessages) => updateIdeaChat(activePackId, activeIdea.id, nextMessages)}
        pack={activePack}
        packId={activePackId}
      />
    );
  }

  if (screen === "packReview") {
    return (
      <PackReviewScreen
        appLanguage={appLanguage}
        onBack={() => setScreen("completion")}
        onClose={() => setScreen("detail")}
        onFinish={finishPackReview}
        pack={activePack}
      />
    );
  }

  return (
    <CompletionScreen
      appLanguage={appLanguage}
      onBackHome={() => setScreen("home")}
      onNextIdea={openNextIdea}
      onReviewPack={() => setScreen("detail")}
      onTakePackReview={() => openPackReview(activePackId)}
      pack={activePack}
      progressByPack={progressByPack}
    />
  );
}

const loginStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 60,
  },
  hero: {
    alignItems: "center",
    gap: 12,
    marginTop: 60,
  },
  appName: {
    fontSize: 36,
    fontWeight: "900",
    color: palette.ink,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: palette.muted,
    textAlign: "center",
  },
  bottomSection: {
    alignItems: "center",
    gap: 16,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: palette.ink,
  },
  disclaimer: {
    fontSize: 12,
    color: palette.muted,
    textAlign: "center",
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  screenFill: {
    flex: 1,
  },
  screenContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
    gap: 18,
  },
  detailScreenContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 0,
    gap: 18,
  },
  homeScreenContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 0,
    gap: 18,
  },
  homeTopBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  homeAppName: {
    color: palette.ink,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  homeTopBarRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  profileMenuLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  profileMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  profileMenuCard: {
    backgroundColor: withAlpha("#FFFDF9", "F6"),
    borderColor: withAlpha(palette.line, "D8"),
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    position: "absolute",
    right: 20,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    top: 70,
    width: 240,
    elevation: 6,
  },
  profileMenuLabel: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  profileMenuLanguageRow: {
    flexDirection: "row",
    gap: 8,
  },
  profileMenuLanguageChip: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFBF6", "F0"),
    borderColor: withAlpha(palette.line, "D8"),
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  profileMenuLanguageChipActive: {
    backgroundColor: withAlpha(palette.accent, "18"),
    borderColor: withAlpha(palette.accent, "55"),
  },
  profileMenuLanguageLabel: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  profileMenuLanguageLabelActive: {
    color: palette.accent,
  },
  profileMenuUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(palette.line, "88"),
    marginBottom: 2,
  },
  profileMenuAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  profileMenuName: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.ink,
  },
  profileMenuEmail: {
    fontSize: 11,
    color: palette.muted,
    marginTop: 1,
  },
  profileMenuLogoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: withAlpha(palette.line, "88"),
    marginTop: 2,
  },
  profileMenuLogoutText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.danger,
  },
  sectionHeader: {
    gap: 6,
  },
  sectionKicker: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 38,
  },
  sectionBody: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  heroCard: {
    backgroundColor: withAlpha(palette.raised, "F4"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 32,
    borderWidth: 1,
    padding: 20,
    gap: 16,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 6,
  },
  heroTitle: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 31,
  },
  heroMeta: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  heroDescription: {
    color: palette.ink,
    fontSize: 16,
    lineHeight: 25,
  },
  statRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: withAlpha("#FFFBF6", "E8"),
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  statCardTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statLabel: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  statValue: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  progressBarWrapper: {
    width: "82%",
    alignSelf: "center",
  },
  progressBar: {
    height: 12,
    backgroundColor: withAlpha(palette.line, "AA"),
    borderRadius: 6,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  progressFill: {
    height: "100%",
    backgroundColor: palette.success,
    borderRadius: 6,
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  progressText: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: "700",
    zIndex: 10,
    textAlign: "center",
  },
  detailCtaWrapper: {
    position: "absolute",
    bottom: 32,
    left: 20,
    right: 20,
    backgroundColor: "#FFFBF6",
    borderRadius: 24,
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  detailCtaTopTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.ink,
    textAlign: "center",
    marginBottom: 10,
  },
  detailCtaButton: {
    backgroundColor: palette.ink,
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 16,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 52,
  },
  detailCtaButtonLabel: {
    color: "#FFFBF6",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  languageCard: {
    backgroundColor: withAlpha("#FFFCF8", "F0"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  languageCardCompact: {
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 0,
    padding: 0,
  },
  languageToggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  languageToggleRowCompact: {
    gap: 6,
    width: 150,
  },
  languageChip: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFBF6", "E8"),
    borderColor: withAlpha(palette.line, "D8"),
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  languageChipCompact: {
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  languageChipActive: {
    backgroundColor: withAlpha(palette.accent, "18"),
    borderColor: withAlpha(palette.accent, "55"),
  },
  languageChipLabel: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  languageChipLabelCompact: {
    fontSize: 12,
    fontWeight: "800",
  },
  languageChipLabelActive: {
    color: palette.accent,
  },
  packFormatCard: {
    backgroundColor: withAlpha("#FFFCF8", "F0"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  packFormatCardCompact: {
    backgroundColor: withAlpha("#FFFDF9", "F4"),
    borderRadius: 20,
    gap: 10,
    padding: 12,
  },
  packFormatLabel: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  packFormatBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  packFormatRow: {
    gap: 10,
  },
  packFormatRowCompact: {
    gap: 8,
  },
  packFormatOption: {
    alignItems: "flex-start",
    backgroundColor: withAlpha("#FFFBF6", "EE"),
    borderColor: withAlpha(palette.line, "D8"),
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  packFormatOptionCompact: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  packFormatOptionActive: {
    backgroundColor: withAlpha(palette.accent, "12"),
    borderColor: withAlpha(palette.accent, "55"),
  },
  packFormatIconWrap: {
    alignItems: "center",
    backgroundColor: withAlpha(palette.accent, "14"),
    borderRadius: 14,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  packFormatIconWrapActive: {
    backgroundColor: palette.accent,
  },
  packFormatTextWrap: {
    flex: 1,
    gap: 3,
  },
  packFormatOptionTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  packFormatOptionTitleActive: {
    color: palette.accent,
  },
  packFormatOptionBody: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  packFormatOptionBodyActive: {
    color: palette.ink,
  },
  homeProfileButton: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFBF6", "EE"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  homeProfileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: palette.line,
  },
  homeCreateDockWrap: {
    alignItems: "center",
    bottom: 40,
    left: 0,
    position: "absolute",
    right: 0,
  },
  homeCreateDock: {
    alignItems: "center",
    backgroundColor: palette.ink,
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 62,
    paddingHorizontal: 26,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  homeCreateDockRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  homeCreateDockLabel: {
    color: "#FFFCF8",
    fontSize: 19,
    fontWeight: "800",
  },
  createSheetOverlay: {
    backgroundColor: withAlpha("#1A130D", "66"),
    flex: 1,
    justifyContent: "flex-end",
  },
  createSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  createSheetSafeArea: {
    justifyContent: "flex-end",
  },
  createSheetCard: {
    backgroundColor: palette.raised,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  createSheetHandle: {
    alignSelf: "center",
    backgroundColor: withAlpha(palette.line, "E0"),
    borderRadius: 999,
    height: 6,
    width: 116,
  },
  createSheetClose: {
    alignItems: "center",
    alignSelf: "flex-end",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    marginTop: -2,
    width: 44,
  },
  createSheetHeader: {
    gap: 8,
    marginTop: 4,
  },
  createSheetTitle: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  createSheetBody: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  createSheetOption: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFCF8", "F2"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  createSheetOptionIcon: {
    alignItems: "center",
    backgroundColor: withAlpha(palette.accent, "16"),
    borderRadius: 18,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  createSheetOptionTextWrap: {
    flex: 1,
    gap: 4,
  },
  createSheetOptionTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "800",
  },
  createSheetOptionBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  createSheetPillButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: withAlpha(palette.line, "CC"),
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  createSheetPillLabel: {
    fontSize: 17,
    fontWeight: "600",
    color: palette.ink,
  },
  createSheetSecondaryButton: {
    marginTop: 4,
  },
  pasteScreenCenter: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 24,
  },
  pasteScreenIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: withAlpha(palette.accent, "20"),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  pasteScreenTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: palette.ink,
    textAlign: "center",
    marginBottom: 8,
  },
  studioFormatInlineBadge: {
    backgroundColor: withAlpha(palette.accent, "12"),
    borderColor: withAlpha(palette.accent, "36"),
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  studioFormatInlineBadgeText: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  pasteScreenBody: {
    fontSize: 15,
    color: palette.muted,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: palette.ink,
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 62,
    paddingHorizontal: 22,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.24,
    shadowRadius: 0,
    elevation: 6,
  },
  secondaryButton: {
    backgroundColor: withAlpha("#FFFBF6", "F2"),
    borderColor: withAlpha(palette.line, "CC"),
    borderWidth: 1,
    shadowOpacity: 0,
    elevation: 0,
  },
  disabledButton: {
    backgroundColor: withAlpha(palette.ink, "55"),
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryButtonLabel: {
    color: "#FFFCF8",
    fontSize: 18,
    fontWeight: "800",
  },
  secondaryButtonLabel: {
    color: palette.ink,
  },
  disabledButtonLabel: {
    color: withAlpha("#FFFCF8", "BB"),
  },
  studioPreviewCard: {
    backgroundColor: withAlpha("#FFFCF8", "E8"),
    borderRadius: 28,
    gap: 14,
    padding: 20,
  },
  studioPreviewRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  studioPreviewText: {
    color: palette.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  swipeableWrapper: {
    overflow: "hidden",
    borderRadius: 28,
  },
  swipeDeleteBg: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: palette.danger,
    alignItems: "center",
    justifyContent: "center",
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
  },
  libraryCard: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFCF8", "ED"),
    borderRadius: 28,
    flexDirection: "row",
    gap: 14,
    padding: 14,
    position: "relative",
  },
  libraryDeleteCorner: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(palette.ink, "0A"),
    alignItems: "center",
    justifyContent: "center",
  },
  libraryText: {
    flex: 1,
    gap: 4,
  },
  libraryMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  libraryCategory: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  libraryFormatBadge: {
    backgroundColor: withAlpha(palette.ink, "08"),
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  libraryFormatBadgeText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  libraryTitle: {
    color: palette.ink,
    fontSize: 19,
    fontWeight: "800",
  },
  libraryTitleInput: {
    borderBottomWidth: 1,
    borderBottomColor: palette.accent,
    paddingVertical: 2,
  },
  libraryTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  librarySubtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  libraryProgress: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  libraryProgressBar: {
    height: 10,
    backgroundColor: withAlpha(palette.line, "AA"),
    borderRadius: 5,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    marginTop: 4,
  },
  libraryProgressFill: {
    height: "100%",
    backgroundColor: palette.success,
    borderRadius: 5,
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  libraryProgressText: {
    color: palette.ink,
    fontSize: 9,
    fontWeight: "700",
    zIndex: 10,
    textAlign: "center",
  },
  libraryActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  libraryDeleteAction: {
    alignItems: "center",
    borderRadius: 18,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  libraryAction: {
    alignItems: "center",
    backgroundColor: withAlpha(palette.accent, "24"),
    borderRadius: 18,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  libraryActionDisabled: {
    backgroundColor: withAlpha(palette.ink, "0F"),
  },
  coverCard: {
    alignSelf: "center",
    borderRadius: 28,
    minHeight: 315,
    overflow: "hidden",
    paddingHorizontal: 22,
    paddingVertical: 20,
    width: "82%",
  },
  coverCardCompact: {
    alignSelf: "auto",
    borderRadius: 22,
    minHeight: 150,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: 112,
  },
  coverGlow: {
    backgroundColor: withAlpha("#FFF1C6", "60"),
    borderRadius: 180,
    height: 180,
    position: "absolute",
    right: -20,
    top: 90,
    width: 180,
  },
  coverTitleWrap: {
    flex: 1,
    justifyContent: "flex-start",
    paddingRight: 8,
  },
  coverTitle: {
    color: "#8F170D",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  coverTitleCompact: {
    fontSize: 16,
    letterSpacing: -0.3,
    lineHeight: 19,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  roundButton: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFBF6", "E8"),
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  topBarTitleWrap: {
    flex: 1,
    gap: 2,
  },
  topBarTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  topBarTitleInput: {
    borderBottomWidth: 1,
    borderBottomColor: palette.accent,
    paddingVertical: 2,
    minWidth: 120,
  },
  lessonScreenTitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  topBarCaption: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  topBarActions: {
    flexDirection: "row",
    gap: 10,
  },
  topBarSpacer: {
    width: 48,
  },
  infoCard: {
    backgroundColor: withAlpha("#FFFCF8", "EE"),
    borderRadius: 26,
    gap: 6,
    padding: 18,
  },
  infoCardLabel: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  infoCardValue: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  infoCardHint: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  formGroup: {
    gap: 8,
  },
  formLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  formRow: {
    flexDirection: "row",
    gap: 12,
  },
  formField: {
    flex: 1,
    gap: 8,
  },
  inputLabel: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  fileReadyBadge: {
    backgroundColor: withAlpha(palette.success, "18"),
    borderRadius: 999,
    color: palette.success,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: withAlpha("#FFFCF8", "EE"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 18,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputMultiline: {
    borderRadius: 22,
    minHeight: 164,
  },
  filePickerCard: {
    backgroundColor: withAlpha("#FFFCF8", "EE"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  filePickerCardActive: {
    borderColor: withAlpha(palette.accent, "88"),
    backgroundColor: withAlpha("#FFF9F3", "F4"),
  },
  filePickerCardDisabled: {
    opacity: 0.6,
  },
  filePickerTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  filePickerIcon: {
    alignItems: "center",
    backgroundColor: withAlpha(palette.accent, "16"),
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  filePickerTextWrap: {
    flex: 1,
    gap: 3,
  },
  filePickerTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  filePickerSubtitle: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  filePreviewCard: {
    backgroundColor: withAlpha("#FFFBF6", "F0"),
    borderRadius: 20,
    gap: 12,
    padding: 16,
  },
  filePreviewLabel: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  filePreviewText: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 23,
  },
  fileActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  fileActionButton: {
    backgroundColor: withAlpha("#FFFFFF", "E8"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fileActionButtonDisabled: {
    opacity: 0.6,
  },
  fileActionButtonLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  fieldHint: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: "#F9D9D3",
    borderColor: "#D35E3C",
    borderRadius: 24,
    borderWidth: 1,
    gap: 6,
    padding: 18,
  },
  errorTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "800",
  },
  errorBody: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  longContentWarning: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 8,
  },
  categoryChip: {
    alignSelf: "center",
    backgroundColor: withAlpha(palette.accent, "24"),
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  categoryChipText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  ideaSectionHeader: {
    marginTop: 20,
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  ideaSectionLine: {
    height: 1,
    backgroundColor: palette.line,
    marginBottom: 8,
  },
  ideaSectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.muted,
    letterSpacing: 0.3,
  },
  ideaRow: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFCF8", "EB"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  ideaRowLocked: {
    opacity: 0.78,
  },
  ideaRowLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
  },
  ideaRowIconShell: {
    alignItems: "center",
    backgroundColor: withAlpha(palette.accent, "18"),
    borderRadius: 999,
    height: 54,
    justifyContent: "center",
    width: 54,
  },
  ideaRowText: {
    flex: 1,
    gap: 3,
  },
  ideaRowTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  ideaRowTitleLocked: {
    color: withAlpha(palette.ink, "B0"),
  },
  ideaRowDuration: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  ideaRowTeaser: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19,
    paddingTop: 2,
  },
  progressRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  progressPill: {
    backgroundColor: withAlpha(palette.accent, "18"),
    borderRadius: 999,
    flex: 1,
    height: 10,
  },
  progressPillDone: {
    backgroundColor: withAlpha(palette.accent, "80"),
  },
  progressPillActive: {
    backgroundColor: palette.accent,
    flex: 1.4,
  },
  lessonFlowScreen: {
    flex: 1,
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  lessonScreenShell: {
    flex: 1,
    position: "relative",
  },
  lessonPagerViewport: {
    flex: 1,
  },
  lessonStepPage: {
    paddingTop: 8,
    paddingBottom: 0,
  },
  lessonStepPageContent: {
    flex: 1,
    gap: 18,
    justifyContent: "space-between",
  },
  lessonStepPageContentWithDock: {
    paddingBottom: 80,
  },
  stepScrollViewport: {
    flex: 1,
  },
  lessonStepContent: {
    flex: 1,
    gap: 16,
    justifyContent: "center",
  },
  practiceStepScrollContent: {
    flexGrow: 1,
    gap: 18,
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  practiceStepContent: {
    flexGrow: 1,
    gap: 16,
    justifyContent: "center",
  },
  lessonStepFooter: {
    gap: 12,
    width: "100%",
  },
  lessonFloatingDockWrap: {
    bottom: CHAT_ENTRY_BOTTOM_OFFSET,
    left: CHAT_ENTRY_SIDE_INSET,
    position: "absolute",
    right: CHAT_ENTRY_SIDE_INSET,
    zIndex: 2,
  },
  aiDockSection: {
    width: "100%",
  },
  aiDockBar: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFDF9", "F6"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 15,
    paddingVertical: 10,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 4,
  },
  aiDockBarIconShell: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  aiDockBarLogoCrop: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    height: 31,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: withAlpha("#000000", "26"),
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    width: 31,
  },
  aiDockBarLogo: {
    height: 27,
    width: 27,
  },
  aiDockBarText: {
    flex: 1,
    gap: 0,
  },
  aiDockBarTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  chatOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  chatSafeAreaDimmer: {
    backgroundColor: withAlpha("#321007", "66"),
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
  chatBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha("#321007", "66"),
  },
  chatSheet: {
    backgroundColor: withAlpha(palette.raised, "FC"),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: withAlpha(palette.line, "CC"),
    gap: 12,
    overflow: "hidden",
    paddingHorizontal: CHAT_ENTRY_SIDE_INSET,
    paddingTop: 10,
    paddingBottom: 10,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 10,
  },
  chatSheetHandle: {
    alignSelf: "center",
    backgroundColor: withAlpha(palette.line, "EE"),
    borderRadius: 999,
    height: 4,
    width: 48,
  },
  chatSheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  chatCloseButton: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFBF6", "EA"),
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  chatMessagesScroll: {
    flex: 1,
    minHeight: 0,
  },
  chatMessagesContent: {
    flexGrow: 1,
    gap: 10,
    paddingTop: 2,
    paddingBottom: 6,
  },
  chatMessagesContentEmpty: {
    justifyContent: "center",
  },
  chatEmptyState: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  chatEmptyTitle: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  chatEmptyBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 250,
    textAlign: "center",
  },
  chatMessageBubble: {
    borderRadius: 18,
    maxWidth: "90%",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chatMessageBubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: withAlpha("#FFFBF6", "F0"),
    borderColor: withAlpha(palette.line, "CC"),
    borderWidth: 1,
  },
  chatMessageBubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: withAlpha(palette.accentSoft, "B8"),
  },
  chatMessageText: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  chatTypingCursor: {
    color: palette.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  chatLoadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  chatLoadingText: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  chatErrorCard: {
    backgroundColor: "#F9D9D3",
    borderColor: "#D35E3C",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chatErrorText: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  chatComposer: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFDF9", "F6"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  chatInput: {
    backgroundColor: "transparent",
    color: palette.ink,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 96,
    minHeight: 24,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: "center",
  },
  chatSendButton: {
    alignItems: "center",
    backgroundColor: palette.ink,
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  chatSendButtonDisabled: {
    backgroundColor: withAlpha(palette.ink, "55"),
  },
  lessonCopyBlock: {
    flexShrink: 1,
    gap: 10,
  },
  lessonEyebrowLabel: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  lessonTitle: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
  },
  lessonBody: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "400",
    lineHeight: 27,
  },
  lessonSupport: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  summaryCard: {
    backgroundColor: withAlpha("#FFFCF8", "F0"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 34,
    borderWidth: 1,
    flexShrink: 1,
    gap: 14,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  summaryTitle: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
  },
  summaryBulletRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryBulletDot: {
    color: palette.ink,
    fontSize: 24,
    lineHeight: 30,
  },
  summaryBullet: {
    color: palette.ink,
    flex: 1,
    fontSize: 17,
    lineHeight: 25,
  },
  summaryDivider: {
    backgroundColor: withAlpha(palette.line, "BB"),
    height: 1,
    marginVertical: 4,
  },
  summaryPromptLabel: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  summaryPrompt: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24,
    paddingBottom: 4,
  },
  practiceQuestionCard: {
    backgroundColor: withAlpha("#FFFCF8", "F2"),
    borderRadius: 30,
    padding: 18,
  },
  practiceHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  practiceHeaderLabel: {
    color: palette.accent,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  practiceHeaderScore: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  practiceQuestion: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 32,
    textAlign: "center",
  },
  mascotShell: {
    alignItems: "center",
  },
  mascotBubble: {
    alignItems: "center",
    backgroundColor: "#FF5624",
    borderRadius: 999,
    height: 112,
    justifyContent: "center",
    width: 112,
  },
  practiceOptionsStack: {
    gap: 10,
  },
  optionCard: {
    backgroundColor: withAlpha("#FFFCF8", "EE"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  optionCardSelected: {
    borderColor: palette.accent,
    borderWidth: 2,
  },
  optionCardCorrect: {
    backgroundColor: "#F5D58A",
    borderColor: "#E3AF1D",
  },
  optionCardWrong: {
    backgroundColor: "#F5D5CF",
    borderColor: palette.danger,
  },
  optionText: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 24,
    textAlign: "center",
  },
  optionTextSelected: {
    color: palette.ink,
  },
  optionTextCorrect: {
    color: palette.ink,
  },
  optionTextWrong: {
    color: palette.ink,
  },
  feedbackCard: {
    backgroundColor: withAlpha("#FFFCF8", "EE"),
    borderRadius: 26,
    gap: 10,
    padding: 18,
  },
  feedbackTitle: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: "800",
  },
  feedbackBody: {
    color: palette.ink,
    fontSize: 16,
    lineHeight: 24,
  },
  practiceScoreCard: {
    backgroundColor: withAlpha(palette.accentSoft, "55"),
    borderColor: withAlpha(palette.accent, "44"),
    borderRadius: 26,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  practiceScoreTitle: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: "800",
  },
  practiceScoreBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  practiceActionRow: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    width: "100%",
  },
  practiceActionButton: {
    flexBasis: 0,
    minHeight: 68,
  },
  practiceActionButtonPrimary: {
    flexGrow: 1.55,
  },
  practiceActionButtonSecondary: {
    flexGrow: 0.9,
  },
  completionHero: {
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    paddingBottom: 6,
  },
  completionStar: {
    alignItems: "center",
    backgroundColor: withAlpha(palette.accent, "25"),
    borderRadius: 999,
    height: 150,
    justifyContent: "center",
    width: 150,
  },
  completionTitle: {
    color: palette.ink,
    fontSize: 42,
    fontWeight: "900",
  },
  completionBody: {
    color: palette.ink,
    fontSize: 18,
    lineHeight: 28,
    maxWidth: 320,
    textAlign: "center",
  },
  completionList: {
    gap: 12,
  },
  completionRow: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFFCF8", "ED"),
    borderRadius: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  completionRowDone: {
    borderColor: withAlpha(palette.success, "60"),
    borderWidth: 2,
  },
  completionRowNext: {
    borderColor: withAlpha(palette.accent, "80"),
    borderWidth: 2,
  },
  pendingGenCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: withAlpha(palette.line, "CC"),
    backgroundColor: withAlpha(palette.accent, "08"),
  },
  pendingGenTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: palette.ink,
  },
  pendingGenSubtitle: {
    fontSize: 13,
    color: palette.muted,
    marginTop: 2,
  },
  pendingGenError: {
    fontSize: 13,
    color: palette.danger,
    marginTop: 2,
  },
  pendingGenRetry: {
    fontSize: 14,
    fontWeight: "600",
    color: palette.accent,
  },
  pendingGenBarTrack: {
    height: 16,
    borderRadius: 8,
    backgroundColor: withAlpha(palette.accent, "22"),
    overflow: "hidden",
    marginTop: 6,
    justifyContent: "center",
  },
  pendingGenBarFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 8,
    backgroundColor: palette.accent,
  },
  pendingGenBarPercent: {
    fontSize: 10,
    fontWeight: "700",
    color: palette.bg,
    textAlign: "center",
    zIndex: 1,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(palette.line, "AA"),
    overflow: "hidden",
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.accent,
  },
  shortHeroCard: {
    backgroundColor: withAlpha("#FFFDF9", "F4"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
    gap: 10,
  },
  shortHeroLabel: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  shortHeroTitle: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 31,
  },
  shortHeroGoalLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  shortHeroGoal: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 23,
  },
  shortStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  shortFullscreenRoot: {
    backgroundColor: "#050505",
    flex: 1,
  },
  shortPlayerStage: {
    flex: 1,
    paddingTop: 0,
  },
  shortPlayerShell: {
    backgroundColor: "#050505",
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },
  shortPlayerMediaTapZone: {
    flex: 1,
  },
  shortPlayerVideo: {
    backgroundColor: "#050505",
    flex: 1,
    width: "100%",
  },
  shortPlayerStillFrame: {
    backgroundColor: "#050505",
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },
  shortPlayerStillBackdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.92,
  },
  shortPlayerStillForeground: {
    flex: 1,
    width: "100%",
  },
  shortPlayerPlaceholder: {
    alignItems: "center",
    backgroundColor: "#050505",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  shortPlayerPlaceholderText: {
    color: "#FFF8EA",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  shortPlayerCenterOverlay: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: withAlpha("#0E0907", "CC"),
    borderRadius: 22,
    gap: 10,
    justifyContent: "center",
    left: 28,
    minWidth: 220,
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: "absolute",
    right: 28,
    top: "40%",
  },
  shortPlayerOverlayText: {
    color: "#FFF8EA",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  shortPlayerErrorText: {
    color: "#FFF8EA",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  shortOverlayAction: {
    minHeight: 50,
    width: "100%",
  },
  shortPlayerQuizCtaWrap: {
    bottom: 96,
    left: 20,
    position: "absolute",
    right: 20,
  },
  shortPlayerQuizCta: {
    minHeight: 54,
  },
  shortClipSwipeHintWrap: {
    alignItems: "center",
    left: 20,
    position: "absolute",
    right: 20,
    zIndex: 3,
  },
  shortClipSwipeHintText: {
    backgroundColor: withAlpha("#090705", "C6"),
    borderColor: withAlpha("#FFF8EA", "26"),
    borderRadius: 999,
    borderWidth: 1,
    color: "#FFF8EA",
    fontSize: 13,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 8,
    textAlign: "center",
  },
  shortPlayerBottomOverlay: {
    bottom: 0,
    left: 0,
    paddingHorizontal: 10,
    position: "absolute",
    right: 0,
    zIndex: 3,
  },
  shortPlayerMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  shortPlayerTimeLabel: {
    color: "#FFF8EA",
    fontSize: 13,
    fontWeight: "800",
  },
  shortSubtitleToggle: {
    alignItems: "center",
    backgroundColor: withAlpha("#0A0705", "88"),
    borderColor: withAlpha("#FFF8EA", "30"),
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  shortSubtitleToggleFloating: {
    position: "absolute",
    right: 12,
    zIndex: 3,
  },
  shortSubtitleToggleActive: {
    backgroundColor: "#FFF8EA",
    borderColor: "#FFF8EA",
  },
  shortSubtitleOverlay: {
    alignItems: "center",
    left: 16,
    position: "absolute",
    right: 16,
    zIndex: 2,
  },
  shortSubtitleText: {
    backgroundColor: withAlpha("#090705", "B8"),
    borderRadius: 14,
    color: "#FFF8EA",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
    maxWidth: "84%",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: "center",
  },
  shortTopOverlay: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 4,
  },
  shortBackButton: {
    alignSelf: "flex-start",
    backgroundColor: "transparent",
    borderWidth: 0,
    minHeight: 48,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  clipCounterBadge: {
    backgroundColor: withAlpha("#000000", "55"),
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  clipCounterText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  shortActionRail: {
    position: "absolute",
    right: 6,
    zIndex: 4,
  },
  shortActionRailStack: {
    alignItems: "center",
    gap: 48,
  },
  shortActionItem: {
    alignItems: "center",
    minWidth: 82,
    paddingVertical: 4,
  },
  shortActionLogo: {
    height: 30,
    width: 30,
    shadowColor: withAlpha("#FFFDFA", "D8"),
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  shortActionIcon: {
    textShadowColor: withAlpha("#FFFDFA", "D8"),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  shortActionLabel: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
    textShadowColor: withAlpha("#FFFDFA", "D8"),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  shortSeekTrack: {
    height: 18,
    justifyContent: "center",
    position: "relative",
  },
  shortSeekTrackBase: {
    backgroundColor: withAlpha("#FFF8EA", "52"),
    borderRadius: 999,
    height: 3,
    width: "100%",
  },
  shortSeekTrackFill: {
    backgroundColor: "#FF3B30",
    borderRadius: 999,
    height: 3,
    left: 0,
    position: "absolute",
    top: 7,
  },
  shortSeekThumb: {
    backgroundColor: "#FF3B30",
    borderRadius: 999,
    height: 14,
    position: "absolute",
    top: 2,
    width: 14,
  },
  shortSeekBubble: {
    alignItems: "center",
    backgroundColor: withAlpha("#120F0D", "F0"),
    borderRadius: 14,
    bottom: 22,
    height: 28,
    justifyContent: "center",
    paddingHorizontal: 10,
    position: "absolute",
    width: 64,
  },
  shortSeekBubbleText: {
    color: "#FFF8EA",
    fontSize: 12,
    fontWeight: "800",
  },
  shortQuizScreenScroll: {
    flex: 1,
  },
  shortQuizScreenContent: {
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  shortVideoShell: {
    backgroundColor: "#120A07",
    borderColor: withAlpha("#120A07", "22"),
    borderRadius: 32,
    borderWidth: 1,
    minHeight: 520,
    overflow: "hidden",
    position: "relative",
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
  },
  shortVideo: {
    aspectRatio: 9 / 16,
    backgroundColor: "#120A07",
    width: "100%",
  },
  shortVideoTopOverlay: {
    left: 0,
    paddingHorizontal: 18,
    paddingTop: 18,
    position: "absolute",
    right: 0,
    top: 0,
  },
  shortVideoSceneLabel: {
    alignSelf: "flex-start",
    backgroundColor: withAlpha("#FFF8EA", "E6"),
    borderRadius: 999,
    color: palette.ink,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  shortVideoIdeaTitle: {
    color: "#FFF8EA",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
    lineHeight: 26,
    marginTop: 12,
    textShadowColor: withAlpha("#120A07", "CC"),
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  shortSceneMeta: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  shortSceneCanvas: {
    backgroundColor: "#FFFDF9",
    borderColor: withAlpha(palette.line, "D4"),
    borderRadius: 32,
    borderWidth: 1,
    minHeight: 420,
    padding: 22,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
  },
  shortSceneVisualFrame: {
    backgroundColor: withAlpha(palette.surface, "C8"),
    borderColor: withAlpha(palette.line, "E6"),
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 18,
    overflow: "hidden",
  },
  shortSceneVisual: {
    aspectRatio: 9 / 12,
    width: "100%",
  },
  shortSceneCaptionOverlay: {
    backgroundColor: withAlpha("#140A05", "A6"),
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    bottom: 0,
    gap: 4,
    left: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: "absolute",
    right: 0,
  },
  shortSceneCaptionLine: {
    color: "#FFF8EA",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
    lineHeight: 25,
  },
  shortSceneVisualPlaceholder: {
    alignItems: "flex-start",
    backgroundColor: withAlpha(palette.accentSoft, "88"),
    borderColor: withAlpha(palette.accent, "33"),
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    marginBottom: 18,
    minHeight: 260,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  shortSceneVisualPlaceholderEyebrow: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  shortSceneVisualPlaceholderTitle: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  shortSceneVisualPlaceholderBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  shortSceneVisualPlaceholderCaptionWrap: {
    gap: 6,
    marginTop: 2,
  },
  shortSceneVisualPlaceholderCaption: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  shortSceneHeadline: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  shortSceneBodyWrap: {
    marginTop: 18,
  },
  shortSceneBody: {
    color: palette.ink,
    fontSize: 18,
    lineHeight: 28,
  },
  shortCalloutWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 20,
  },
  shortCalloutChip: {
    backgroundColor: withAlpha(palette.accent, "12"),
    borderColor: withAlpha(palette.accent, "30"),
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shortCalloutText: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "800",
  },
  shortEmphasisChip: {
    backgroundColor: withAlpha("#321007", "0C"),
    borderColor: withAlpha("#321007", "16"),
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shortEmphasisText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  shortSceneDirectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  shortSceneDirectorChip: {
    alignItems: "center",
    backgroundColor: withAlpha("#FFF8EA", "E0"),
    borderColor: withAlpha(palette.line, "D4"),
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  shortSceneDirectorText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  shortNarrationPreview: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 22,
  },
  shortControlsCard: {
    backgroundColor: withAlpha("#FFFBF6", "F0"),
    borderColor: withAlpha(palette.line, "CC"),
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  shortControlsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  shortControlButton: {
    flex: 1,
  },
  shortControlButtonPrimary: {
    flex: 1.2,
  },
  shortLoadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  shortLoadingText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  shortAudioError: {
    color: palette.danger,
    fontSize: 14,
    lineHeight: 21,
  },
  shortCompletionCard: {
    backgroundColor: withAlpha(palette.accent, "0C"),
    borderColor: withAlpha(palette.accent, "24"),
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  shortCompletionTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  shortCompletionBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  shortQuizSection: {
    gap: 14,
  },
});
