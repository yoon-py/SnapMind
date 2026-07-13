import {
  createSupabaseAudioStorageClient,
  resolveSupabaseAudioStorageConfig,
} from "./supabaseStorage";
import {
  resolveGeminiTextToSpeechConfig,
  synthesizeShortAudio,
} from "./geminiTextToSpeech";
import {
  buildShortSceneImagePrompt,
  generateShortSceneImage,
  resolveGeminiImageConfig,
} from "./geminiImage";
import {
  resolveOpenAITextToSpeechConfig,
  synthesizeShortAudioWithOpenAI,
} from "./openaiTextToSpeech";
import {
  generateOpenAIImage,
  resolveOpenAIImageConfig,
} from "./openaiImage";
import { slugify, trimText } from "./text";

export function buildShortAudioPath(packId: string, ideaId: string, extension = "wav") {
  return `packs/${slugify(packId, "pack")}/${slugify(ideaId, "idea")}.${extension}`;
}

export function buildShortClipAudioPath(packId: string, ideaId: string, clipId: string, extension = "wav") {
  return `packs/${slugify(packId, "pack")}/${slugify(ideaId, "idea")}/${slugify(
    clipId,
    "clip"
  )}.${extension}`;
}

export function buildShortSceneImagePath(
  packId: string,
  ideaId: string,
  sceneId: string,
  extension = "png"
) {
  return `packs/${slugify(packId, "pack")}/${slugify(ideaId, "idea")}/scenes/${slugify(
    sceneId,
    "scene"
  )}.${extension}`;
}

export function buildShortClipSceneImagePath(
  packId: string,
  ideaId: string,
  clipId: string,
  sceneId: string,
  extension = "png"
) {
  return `packs/${slugify(packId, "pack")}/${slugify(ideaId, "idea")}/${slugify(
    clipId,
    "clip"
  )}/scenes/${slugify(sceneId, "scene")}.${extension}`;
}

function getIdeaShortClips(idea: any) {
  const clips = Array.isArray(idea?.clips) ? idea.clips.filter(Boolean) : [];
  if (clips.length > 0) {
    return clips;
  }

  return idea?.short && typeof idea.short === "object" ? [idea.short] : [];
}

export async function enrichShortsPackWithAudio({
  pack,
  ttsConfig,
  imageConfig,
  storageConfig,
  generateSceneImages = false,
  fetchImpl = fetch,
  onProgress,
}: {
  pack: any;
  ttsConfig?: {
    apiKey?: string;
    model?: string;
    voiceName?: string;
    provider?: string;
  };
  imageConfig?: {
    apiKey?: string;
    model?: string;
    provider?: string;
    size?: string;
    quality?: string;
  };
  storageConfig?: {
    supabaseUrl?: string;
    serviceRoleKey?: string;
    bucketName?: string;
  };
  generateSceneImages?: boolean;
  fetchImpl?: typeof fetch;
  onProgress?: (patch: { step?: string; totalChunks?: number; completedChunks?: number }) => void | Promise<void>;
}) {
  if (pack?.format !== "shorts" || !Array.isArray(pack?.ideas) || pack.ideas.length === 0) {
    return pack;
  }

  const ttsProvider = trimText(ttsConfig?.provider, "gemini").toLowerCase();
  const imageProvider = trimText(imageConfig?.provider, ttsProvider).toLowerCase();
  const useOpenAITts = ttsProvider === "openai";
  const useOpenAIImages = imageProvider === "openai";
  const resolvedTtsConfig = useOpenAITts
    ? resolveOpenAITextToSpeechConfig(ttsConfig || {})
    : resolveGeminiTextToSpeechConfig(ttsConfig || {});
  const resolvedImageConfig = useOpenAIImages
    ? resolveOpenAIImageConfig({ ...(imageConfig || {}), size: imageConfig?.size || "1024x1792" })
    : resolveGeminiImageConfig(imageConfig || {});
  const resolvedStorageConfig = resolveSupabaseAudioStorageConfig(storageConfig || {});
  const ttsProviderLabel = useOpenAITts ? "openai-tts" : "gemini-tts";
  const imageProviderLabel = useOpenAIImages ? "openai-image" : "gemini-image";

  if (!resolvedStorageConfig) {
    return {
      ...pack,
      ideas: pack.ideas.map((idea: any) => ({
        ...idea,
        clips: getIdeaShortClips(idea).map((clip: any) => ({
          ...clip,
          tts: {
            ...(clip?.tts || {}),
            provider: ttsProviderLabel,
            audioStatus: "failed",
          },
        })),
        short: getIdeaShortClips(idea)[0]
          ? {
              ...getIdeaShortClips(idea)[0],
              tts: {
                ...(getIdeaShortClips(idea)[0]?.tts || {}),
                provider: ttsProviderLabel,
                audioStatus: "failed",
              },
            }
          : {
              ...(idea.short || {}),
              tts: {
                ...(idea.short?.tts || {}),
                provider: ttsProviderLabel,
                audioStatus: "failed",
              },
            },
      })),
    };
  }

  const storage = createSupabaseAudioStorageClient(resolvedStorageConfig);
  const totalClipCount = pack.ideas.reduce(
    (sum: number, idea: any) => sum + Math.max(1, getIdeaShortClips(idea).length),
    0
  );
  await onProgress?.({ step: "voicing", totalChunks: totalClipCount, completedChunks: 0 });

  const CLIP_CONCURRENCY = Math.max(
    1,
    Number(process.env.SHORTS_CLIP_CONCURRENCY) || 4
  );
  const IMAGE_CONCURRENCY = Math.max(
    1,
    Number(process.env.SHORTS_IMAGE_CONCURRENCY) || 3
  );

  type ClipTask = {
    ideaIndex: number;
    clipIndex: number;
    idea: any;
    clip: any;
  };

  const clipTasks: ClipTask[] = [];
  pack.ideas.forEach((idea: any, ideaIndex: number) => {
    const rawClips = getIdeaShortClips(idea);
    rawClips.forEach((clip: any, clipIndex: number) => {
      clipTasks.push({ ideaIndex, clipIndex, idea, clip });
    });
  });

  const enrichedClipsByIdea: any[][] = pack.ideas.map(() => []);
  let completedClipCount = 0;

  async function processScenesInParallel(
    imagePlanScenes: any[],
    idea: any,
    clip: any,
    clipIndex: number
  ): Promise<any[]> {
    if (!generateSceneImages || !resolvedImageConfig) {
      return imagePlanScenes;
    }

    const result: any[] = new Array(imagePlanScenes.length);
    let nextIndex = 0;

    async function worker() {
      while (true) {
        const sceneIndex = nextIndex;
        nextIndex += 1;
        if (sceneIndex >= imagePlanScenes.length) {
          return;
        }
        const scene = imagePlanScenes[sceneIndex];
        try {
          const generatedImage = useOpenAIImages
            ? await generateOpenAIImage({
                config: resolvedImageConfig as any,
                prompt: scene.imagePrompt,
                size: imageConfig?.size || "1024x1792",
                fetchImpl,
              })
            : await generateShortSceneImage({
                config: resolvedImageConfig as any,
                prompt: scene.imagePrompt,
                fetchImpl,
              });
          const imagePath = buildShortClipSceneImagePath(
            pack.id,
            idea.id,
            trimText(clip?.id, `clip-${clipIndex + 1}`),
            scene.id,
            generatedImage.fileExtension
          );
          const imageUpload = await storage.uploadBinary(
            imagePath,
            generatedImage.imageBytes,
            generatedImage.mimeType
          );
          result[sceneIndex] = {
            ...scene,
            image: {
              ...(scene.image || {}),
              provider: imageProviderLabel,
              model: generatedImage.model,
              imageStatus: "ready",
              imagePath: imageUpload.path,
              bucketName: imageUpload.bucketName,
              mimeType: generatedImage.mimeType,
            },
          };
        } catch (imageError: any) {
          result[sceneIndex] = {
            ...scene,
            image: {
              ...(scene.image || {}),
              provider: imageProviderLabel,
              model: resolvedImageConfig!.model,
              imageStatus: "failed",
              errorMessage: imageError?.message || "Failed to generate scene image.",
            },
          };
        }
      }
    }

    const workerCount = Math.min(IMAGE_CONCURRENCY, imagePlanScenes.length);
    await Promise.all(Array.from({ length: workerCount }, worker));
    return result;
  }

  async function processClip(task: ClipTask): Promise<any> {
    const { ideaIndex, clipIndex, idea, clip } = task;
    const clipScenes = Array.isArray(clip?.scenes) ? clip.scenes : [];
    const imagePlanScenes = clipScenes.map((scene: any) => {
      // 웹 brain이 심어둔 imagePrompt가 있으면 그대로 사용(웹 품질), 없으면 씬 필드로 생성
      const imagePrompt = trimText(scene?.imagePrompt, "") || buildShortSceneImagePrompt({
        packTitle: trimText(pack?.title, "Learning pack"),
        ideaTitle: trimText(clip?.title || idea?.title, `Idea ${ideaIndex + 1}`),
        languageCode: trimText(pack?.languageCode, "en"),
        scene: {
          headline: scene?.headline,
          body: scene?.body,
          callouts: scene?.callouts,
          visualStyle: scene?.visualStyle,
          layoutHint: scene?.layoutHint,
        },
      });

      return {
        ...scene,
        imagePrompt,
        image: {
          ...(scene?.image || {}),
          provider: imageProviderLabel,
          model: resolvedImageConfig?.model || trimText(
            imageConfig?.model,
            useOpenAIImages ? "gpt-image-2" : "gemini-3.1-flash-image"
          ),
          imageStatus: generateSceneImages && resolvedImageConfig ? "pending" : "disabled",
          imagePath: trimText(scene?.image?.imagePath, ""),
          mimeType: trimText(scene?.image?.mimeType, ""),
        },
      };
    });

    try {
      const scenes = clipScenes.map((scene: any, sceneIndex: number) => ({
        id: trimText(scene?.id, `${idea.id}-clip-${clipIndex + 1}-scene-${sceneIndex + 1}`),
        order: Math.max(1, Math.round(Number(scene?.order || sceneIndex + 1))),
        narration: trimText(scene?.narration, scene?.body || ""),
      }));

      if (scenes.length === 0) {
        throw new Error("No scenes available for TTS.");
      }

      if (!resolvedTtsConfig) {
        throw new Error(`${useOpenAITts ? "OpenAI" : "Gemini"} TTS is not configured.`);
      }

      const [audio, enrichedScenes] = await Promise.all([
        (async () => {
          const result = useOpenAITts
            ? await synthesizeShortAudioWithOpenAI({
                config: resolvedTtsConfig as any,
                scenes,
                languageCode: pack.languageCode,
                fetchImpl,
              })
            : await synthesizeShortAudio({
                config: resolvedTtsConfig as any,
                scenes,
                languageCode: pack.languageCode,
                fetchImpl,
              });
          return result;
        })(),
        processScenesInParallel(imagePlanScenes, idea, clip, clipIndex),
      ]);

      const audioPath = buildShortClipAudioPath(
        pack.id,
        idea.id,
        trimText(clip?.id, `clip-${clipIndex + 1}`),
        audio.fileExtension || "wav"
      );
      const uploadResult = await storage.uploadAudio(
        audioPath,
        audio.audioBytes,
        audio.mimeType || "audio/wav"
      );

      return {
        ...clip,
        scenes: enrichedScenes,
        tts: {
          ...(clip?.tts || {}),
          provider: ttsProviderLabel,
          model: audio.model,
          voice: audio.voiceLabel,
          bucketName: uploadResult.bucketName,
          audioPath: uploadResult.path,
          durationMs: audio.durationMs,
          audioStatus: "ready",
          segments: audio.segments,
        },
      };
    } catch (error: any) {
      console.error(
        `[audio] clip ${clipIndex + 1} of idea ${ideaIndex + 1} failed:`,
        error?.message || error
      );
      return {
        ...clip,
        scenes: imagePlanScenes,
        tts: {
          ...(clip?.tts || {}),
          provider: ttsProviderLabel,
          model: resolvedTtsConfig?.model || trimText(
            ttsConfig?.model,
            useOpenAITts ? "gpt-4o-mini-tts" : "gemini-2.5-pro-preview-tts"
          ),
          audioStatus: "failed",
          errorMessage: error?.message || "Failed to synthesize short audio.",
        },
      };
    }
  }

  let nextTaskIndex = 0;

  async function clipWorker() {
    while (true) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      if (taskIndex >= clipTasks.length) {
        return;
      }
      const task = clipTasks[taskIndex];
      const enrichedClip = await processClip(task);
      enrichedClipsByIdea[task.ideaIndex][task.clipIndex] = enrichedClip;
      completedClipCount += 1;
      await onProgress?.({ completedChunks: completedClipCount });
    }
  }

  const workerCount = Math.min(CLIP_CONCURRENCY, clipTasks.length);
  await Promise.all(Array.from({ length: workerCount }, clipWorker));

  const ideas = pack.ideas.map((idea: any, ideaIndex: number) => {
    const enrichedClips = enrichedClipsByIdea[ideaIndex];
    return {
      ...idea,
      clips: enrichedClips,
      short: enrichedClips[0] ? { ...enrichedClips[0] } : idea.short,
    };
  });

  return {
    ...pack,
    ideas,
  };
}

export async function createSignedShortAudioUrl({
  path,
  bucketName,
  expiresIn = 60 * 60,
  storageConfig,
}: {
  path: string;
  bucketName?: string;
  expiresIn?: number;
  storageConfig?: {
    supabaseUrl?: string;
    serviceRoleKey?: string;
    bucketName?: string;
  };
}) {
  const resolvedStorageConfig = resolveSupabaseAudioStorageConfig({
    ...(storageConfig || {}),
    bucketName: bucketName || storageConfig?.bucketName,
  });

  if (!resolvedStorageConfig) {
    throw new Error("Supabase storage is not configured.");
  }

  const storage = createSupabaseAudioStorageClient(resolvedStorageConfig);
  return storage.createSignedUrl(path, expiresIn);
}
