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
  };
  imageConfig?: {
    apiKey?: string;
    model?: string;
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

  const resolvedTtsConfig = resolveGeminiTextToSpeechConfig(ttsConfig || {});
  const resolvedImageConfig = resolveGeminiImageConfig(imageConfig || {});
  const resolvedStorageConfig = resolveSupabaseAudioStorageConfig(storageConfig || {});

  if (!resolvedStorageConfig) {
    return {
      ...pack,
      ideas: pack.ideas.map((idea: any) => ({
        ...idea,
        clips: getIdeaShortClips(idea).map((clip: any) => ({
          ...clip,
          tts: {
            ...(clip?.tts || {}),
            provider: "gemini-tts",
            audioStatus: "failed",
          },
        })),
        short: getIdeaShortClips(idea)[0]
          ? {
              ...getIdeaShortClips(idea)[0],
              tts: {
                ...(getIdeaShortClips(idea)[0]?.tts || {}),
                provider: "gemini-tts",
                audioStatus: "failed",
              },
            }
          : {
              ...(idea.short || {}),
              tts: {
                ...(idea.short?.tts || {}),
                provider: "gemini-tts",
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

  const ideas = [];
  let completedClipCount = 0;

  for (let index = 0; index < pack.ideas.length; index += 1) {
    const idea = pack.ideas[index];
    const rawClips = getIdeaShortClips(idea);
    const enrichedClips = [];

    for (let clipIndex = 0; clipIndex < rawClips.length; clipIndex += 1) {
      const clip = rawClips[clipIndex];
      const clipScenes = Array.isArray(clip?.scenes) ? clip.scenes : [];
      const imagePlanScenes = clipScenes.map((scene: any) => {
        const imagePrompt = buildShortSceneImagePrompt({
          packTitle: trimText(pack?.title, "Learning pack"),
          ideaTitle: trimText(clip?.title || idea?.title, `Idea ${index + 1}`),
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
            provider: "gemini-image",
            model: resolvedImageConfig?.model || trimText(imageConfig?.model, "gemini-3.1-flash-image-preview"),
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
          throw new Error("Gemini TTS is not configured.");
        }

        const audio = await synthesizeShortAudio({
          config: resolvedTtsConfig,
          scenes,
          languageCode: pack.languageCode,
          fetchImpl,
        });
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

        let enrichedScenes = imagePlanScenes;
        if (generateSceneImages && resolvedImageConfig) {
          const nextScenes = [];

          for (let sceneIndex = 0; sceneIndex < imagePlanScenes.length; sceneIndex += 1) {
            const scene = imagePlanScenes[sceneIndex];
            try {
              const generatedImage = await generateShortSceneImage({
                config: resolvedImageConfig,
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

              nextScenes.push({
                ...scene,
                image: {
                  ...(scene.image || {}),
                  provider: "gemini-image",
                  model: generatedImage.model,
                  imageStatus: "ready",
                  imagePath: imageUpload.path,
                  bucketName: imageUpload.bucketName,
                  mimeType: generatedImage.mimeType,
                },
              });
            } catch (imageError: any) {
              nextScenes.push({
                ...scene,
                image: {
                  ...(scene.image || {}),
                  provider: "gemini-image",
                  model: resolvedImageConfig.model,
                  imageStatus: "failed",
                  errorMessage: imageError?.message || "Failed to generate scene image.",
                },
              });
            }
          }

          enrichedScenes = nextScenes;
        }

        enrichedClips.push({
          ...clip,
          scenes: enrichedScenes,
          tts: {
            ...(clip?.tts || {}),
            provider: "gemini-tts",
            model: audio.model,
            voice: audio.voiceLabel,
            bucketName: uploadResult.bucketName,
            audioPath: uploadResult.path,
            durationMs: audio.durationMs,
            audioStatus: "ready",
            segments: audio.segments,
          },
        });
      } catch (error: any) {
        enrichedClips.push({
          ...clip,
          scenes: imagePlanScenes,
          tts: {
            ...(clip?.tts || {}),
            provider: "gemini-tts",
            model: resolvedTtsConfig?.model || trimText(ttsConfig?.model, "gemini-2.5-pro-preview-tts"),
            audioStatus: "failed",
            errorMessage: error?.message || "Failed to synthesize short audio.",
          },
        });
      }

      completedClipCount += 1;
      await onProgress?.({ completedChunks: completedClipCount });
    }

    ideas.push({
      ...idea,
      clips: enrichedClips,
      short: enrichedClips[0] ? { ...enrichedClips[0] } : idea.short,
    });
  }

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
