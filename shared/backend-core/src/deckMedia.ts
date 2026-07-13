import {
  generateShortSceneImage,
  resolveGeminiImageConfig,
} from "./geminiImage";
import {
  generateOpenAIImage,
  resolveOpenAIImageConfig,
} from "./openaiImage";
import {
  createSupabaseAudioStorageClient,
  resolveSupabaseAudioStorageConfig,
} from "./supabaseStorage";
import { slugify, trimText } from "./text";

export function buildDeckSlideImagePath(packId: string, slideId: string, extension = "png") {
  return `packs/${slugify(packId, "pack")}/deck/slides/${slugify(slideId, "slide")}.${extension}`;
}

export function buildDeckSlideImagePrompt({
  pack,
  slide,
}: {
  pack: any;
  slide: any;
}) {
  const nodeLabels = Array.isArray(slide?.diagram?.nodes)
    ? slide.diagram.nodes.map((node: any) => trimText(node?.label, "")).filter(Boolean).join(", ")
    : "";
  const stepLabels = Array.isArray(slide?.diagram?.steps)
    ? slide.diagram.steps.map((step: any) => trimText(step?.label, "")).filter(Boolean).join(", ")
    : "";

  return [
    "Create a polished educational blueprint illustration for a 16:9 slide deck.",
    "Style: cream technical paper, navy line art, subtle teal grid, restrained gold/coral accents, crisp diagrammatic shapes.",
    "Important: do NOT render readable text, captions, labels, letters, numbers, UI chrome, logos, watermarks, or pseudo-text.",
    "The final slide text will be rendered separately by code, so the image must leave clean open areas for overlays.",
    "Use visual structure, not written labels: arrows, blocks, layers, pathways, nodes, panels, architecture, or machinery are allowed.",
    `Deck title: ${trimText(pack?.title, "Learning deck")}`,
    `Slide title: ${trimText(slide?.title, "")}`,
    `Slide thesis: ${trimText(slide?.thesis, "")}`,
    `Layout: ${trimText(slide?.layout, "concept_map")}`,
    `Visual metaphor: ${trimText(slide?.visualMetaphor, "")}`,
    nodeLabels ? `Concept cues to represent visually without text: ${nodeLabels}` : null,
    stepLabels ? `Process cues to represent visually without text: ${stepLabels}` : null,
    trimText(slide?.imagePrompt, "") ? `Authoring prompt: ${trimText(slide.imagePrompt, "")}` : null,
    "Composition: high-resolution 16:9, strong focal object on the visual side, quiet negative space for exact text overlays.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function enrichDeckPackWithImages({
  pack,
  imageConfig,
  storageConfig,
  generateDeckImages = false,
  fetchImpl = fetch,
  onProgress,
}: {
  pack: any;
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
  generateDeckImages?: boolean;
  fetchImpl?: typeof fetch;
  onProgress?: (patch: { step?: string; totalChunks?: number; completedChunks?: number }) => void | Promise<void>;
}) {
  if (pack?.format !== "deck" || !Array.isArray(pack?.slides) || pack.slides.length === 0) {
    return pack;
  }

  const mediaProvider = trimText(imageConfig?.provider, "gemini").toLowerCase();
  const useOpenAIImages = mediaProvider === "openai";
  const resolvedImageConfig = useOpenAIImages
    ? resolveOpenAIImageConfig({ ...(imageConfig || {}), size: imageConfig?.size || "1536x1024" })
    : resolveGeminiImageConfig(imageConfig || {});
  const resolvedStorageConfig = resolveSupabaseAudioStorageConfig(storageConfig || {});
  const imageProviderLabel = useOpenAIImages ? "openai-image" : "gemini-image";

  if (!generateDeckImages || !resolvedImageConfig || !resolvedStorageConfig) {
    return {
      ...pack,
      slides: pack.slides.map((slide: any) => ({
        ...slide,
        imagePrompt: buildDeckSlideImagePrompt({ pack, slide }),
        visual: {
          ...(slide?.visual || {}),
          provider: imageProviderLabel,
          model: resolvedImageConfig?.model || trimText(
            imageConfig?.model,
            useOpenAIImages ? "gpt-image-2" : "gemini-3.1-flash-image"
          ),
          imageStatus: generateDeckImages ? "failed" : "disabled",
          imagePath: trimText(slide?.visual?.imagePath, ""),
          mimeType: trimText(slide?.visual?.mimeType, ""),
        },
      })),
    };
  }

  const storage = createSupabaseAudioStorageClient(resolvedStorageConfig);
  const IMAGE_CONCURRENCY = Math.max(1, Number(process.env.DECK_IMAGE_CONCURRENCY) || 2);
  const slides = pack.slides;
  const result: any[] = new Array(slides.length);
  let nextIndex = 0;
  let completed = 0;

  await onProgress?.({ step: "illustrating deck", totalChunks: slides.length, completedChunks: 0 });

  async function worker() {
    while (true) {
      const slideIndex = nextIndex;
      nextIndex += 1;
      if (slideIndex >= slides.length) {
        return;
      }

      const slide = slides[slideIndex];
      const prompt = buildDeckSlideImagePrompt({ pack, slide });

      try {
        const generatedImage = useOpenAIImages
          ? await generateOpenAIImage({
              config: resolvedImageConfig as any,
              prompt,
              size: "1536x1024",
              fetchImpl,
            })
          : await generateShortSceneImage({
              config: resolvedImageConfig as any,
              prompt,
              fetchImpl,
            });
        const imagePath = buildDeckSlideImagePath(
          pack.id,
          trimText(slide?.id, `slide-${slideIndex + 1}`),
          generatedImage.fileExtension
        );
        const upload = await storage.uploadBinary(
          imagePath,
          generatedImage.imageBytes,
          generatedImage.mimeType
        );
        result[slideIndex] = {
          ...slide,
          imagePrompt: prompt,
          visual: {
            ...(slide?.visual || {}),
            provider: imageProviderLabel,
            model: generatedImage.model,
            imageStatus: "ready",
            imagePath: upload.path,
            bucketName: upload.bucketName,
            mimeType: generatedImage.mimeType,
          },
        };
      } catch (error: any) {
        result[slideIndex] = {
          ...slide,
          imagePrompt: prompt,
          visual: {
            ...(slide?.visual || {}),
            provider: imageProviderLabel,
            model: resolvedImageConfig.model,
            imageStatus: "failed",
            errorMessage: error?.message || "Failed to generate deck slide image.",
          },
        };
      } finally {
        completed += 1;
        await onProgress?.({ completedChunks: completed });
      }
    }
  }

  const workerCount = Math.min(IMAGE_CONCURRENCY, slides.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return {
    ...pack,
    slides: result,
    ideas: Array.isArray(pack.ideas)
      ? pack.ideas.map((idea: any, index: number) => ({
          ...idea,
          deckSlideId: result[index]?.id || idea.deckSlideId,
        }))
      : pack.ideas,
  };
}
