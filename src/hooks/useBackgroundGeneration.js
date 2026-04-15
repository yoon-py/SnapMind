import { useRef, useState } from "react";

const GENERATION_POLL_INTERVAL_MS = 2000;
const GENERATION_MAX_TOTAL_WAIT_MS = 30 * 60 * 1000;
const GENERATION_MAX_IDLE_WAIT_MS = 10 * 60 * 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGenerationRequest({ title, sourceFile, packFormat, sourceText }) {
  const formData = new FormData();

  if (title?.trim()) {
    formData.append("title", title.trim());
  }

  formData.append("packFormat", packFormat);

  if (sourceFile?.isBinary) {
    if (sourceFile.asset?.file) {
      formData.append("sourceFile", sourceFile.asset.file, sourceFile.name);
    } else {
      formData.append("sourceFile", {
        uri: sourceFile.asset.uri,
        name: sourceFile.name,
        type: sourceFile.mimeType || "application/octet-stream",
      });
    }
  } else {
    formData.append("sourceText", sourceText);
  }

  return {
    method: "POST",
    body: formData,
  };
}

async function readJsonIfPossible(response) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json().catch(() => null);
}

async function parseGenerationError({ response, appLanguage, backendRouteNotFoundMessage }) {
  if (response.status === 404 && backendRouteNotFoundMessage) {
    return backendRouteNotFoundMessage;
  }

  const data = await readJsonIfPossible(response);

  if (data?.error || data?.details) {
    return data.error || data.details;
  }

  return appLanguage === "ko" ? "서버에서 오류가 발생했어요." : "Server returned an error.";
}

async function pollGenerationJob({
  abortSignal,
  appText,
  generationTitle,
  onProgress,
  pollUrl,
}) {
  const startTime = Date.now();
  let lastProgressAt = startTime;
  let lastProgressSignature = "";

  while (
    Date.now() - startTime < GENERATION_MAX_TOTAL_WAIT_MS &&
    Date.now() - lastProgressAt < GENERATION_MAX_IDLE_WAIT_MS
  ) {
    if (abortSignal.aborted) {
      return null;
    }

    await delay(GENERATION_POLL_INTERVAL_MS);

    if (abortSignal.aborted) {
      return null;
    }

    const pollResponse = await fetch(pollUrl);

    if (!pollResponse.ok) {
      const errorData = await readJsonIfPossible(pollResponse);
      throw new Error(
        errorData?.error ||
          errorData?.details ||
          `Failed to check generation status (${pollResponse.status}).`
      );
    }

    const pollData = await pollResponse.json();
    const progressSignature = JSON.stringify({
      status: pollData.status,
      step: pollData.step,
      totalChunks: pollData.totalChunks,
      completedChunks: pollData.completedChunks,
    });

    if (progressSignature !== lastProgressSignature) {
      lastProgressSignature = progressSignature;
      lastProgressAt = Date.now();
    }

    if (pollData.step) {
      onProgress({ status: "loading", title: generationTitle, step: pollData.step });
    }

    if (pollData.status === "done" && pollData.pack) {
      return pollData.pack;
    }

    if (pollData.status === "error") {
      throw new Error(pollData.error || "Generation failed on server.");
    }
  }

  throw new Error(
    appText.generationTimeout ||
      "Generation timed out. The server may still be working, so please check again in a moment."
  );
}

export function useBackgroundGeneration({
  API_BASE_URL,
  APP_UI_COPY,
  appLanguage,
  normalizeSourceText,
  onPackGenerated,
  setScreen,
}) {
  const [pendingGeneration, setPendingGeneration] = useState(null);
  const abortGenRef = useRef(null);

  async function startBackgroundGenerate({ title, sourceText, sourceFile, packFormat = "shorts" }) {
    if (abortGenRef.current) {
      abortGenRef.current.abort();
    }

    const abortController = new AbortController();
    abortGenRef.current = abortController;

    const requestedPackFormat = packFormat === "cards" ? "cards" : "shorts";
    const generationTitle = title || (appLanguage === "ko" ? "새 학습팩" : "New pack");
    const appText = appLanguage === "ko" ? APP_UI_COPY.ko : APP_UI_COPY.en;

    setPendingGeneration({ status: "loading", title: generationTitle });
    setScreen("home");

    try {
      const normalizedSourceText = normalizeSourceText(sourceText || "");
      const requestOptions = buildGenerationRequest({
        title,
        sourceFile,
        packFormat: requestedPackFormat,
        sourceText: normalizedSourceText,
      });
      const response = await fetch(`${API_BASE_URL}/api/generate-pack`, requestOptions);

      if (!response.ok) {
        throw new Error(
          await parseGenerationError({
            response,
            appLanguage,
            backendRouteNotFoundMessage: appText.backendRouteNotFound(API_BASE_URL),
          })
        );
      }

      const data = await response.json();

      if (data.pack) {
        setPendingGeneration(null);
        onPackGenerated(data.pack);
        return;
      }

      if (data.jobId) {
        const pack = await pollGenerationJob({
          abortSignal: abortController.signal,
          appText,
          generationTitle,
          onProgress: setPendingGeneration,
          pollUrl: `${API_BASE_URL}/api/generate-pack/${data.jobId}/status`,
        });

        if (!pack) {
          setPendingGeneration(null);
          return;
        }

        setPendingGeneration(null);
        onPackGenerated(pack);
        return;
      }

      throw new Error(data.error || "Unexpected server response.");
    } catch (error) {
      if (abortController.signal.aborted) {
        setPendingGeneration(null);
        return;
      }

      setPendingGeneration({
        status: "error",
        title: generationTitle,
        error: error.message,
        retryFn: () => startBackgroundGenerate({ title, sourceText, sourceFile, packFormat: requestedPackFormat }),
      });
    } finally {
      if (abortGenRef.current === abortController) {
        abortGenRef.current = null;
      }
    }
  }

  function dismissPendingGeneration() {
    if (abortGenRef.current) {
      abortGenRef.current.abort();
    }

    setPendingGeneration(null);
  }

  return {
    abortGenRef,
    dismissPendingGeneration,
    pendingGeneration,
    startBackgroundGenerate,
  };
}
