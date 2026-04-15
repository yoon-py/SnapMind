import { useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";

import { supabase } from "../supabase";
import * as db from "../supabaseDb";
import { useBackgroundGeneration } from "./useBackgroundGeneration";
import { usePackPersistence } from "./usePackPersistence";

export function useRootAppController({
  APP_UI_COPY,
  API_BASE_URL,
  BASE_PACK_IDS,
  STORAGE_KEYS,
  getCompletedIdeaIds,
  getNextIdea,
  getPackById,
  getPackReviewQuestions,
  mergePackLists,
  normalizeSourceText,
  withPackTouch,
  learningPacks,
}) {
  const initialReadyPack = learningPacks.find((pack) => pack.status === "ready") || learningPacks[0];
  const [screen, setScreen] = useState("home");
  const [studioEntryMode, setStudioEntryMode] = useState("default");
  const [studioPickedAsset, setStudioPickedAsset] = useState(null);
  const [studioPackFormat, setStudioPackFormat] = useState("shorts");
  const [activePackId, setActivePackId] = useState(initialReadyPack.id);
  const [activeIdeaId, setActiveIdeaId] = useState(initialReadyPack.ideas[0]?.id || null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const {
    appLanguage,
    chatByIdea,
    generatedPacks,
    hiddenPackIds,
    progressByPack,
    setAppLanguage,
    setChatByIdea,
    setGeneratedPacks,
    setHiddenPackIds,
    setProgressByPack,
  } = usePackPersistence({ session, STORAGE_KEYS });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleGoogleLogin() {
    try {
      const returnScheme = "snapmind://auth";
      const redirectTo = `${API_BASE_URL}/auth/callback?returnScheme=${encodeURIComponent(returnScheme)}`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) {
        Alert.alert("로그인 오류", error.message);
        return;
      }

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, returnScheme);

        if (result.type === "success" && result.url) {
          const qs = result.url.split("?")[1] || "";
          const params = new URLSearchParams(qs);
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }
        }
      }
    } catch (error) {
      Alert.alert("로그인 오류", error.message);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setGeneratedPacks([]);
    setProgressByPack({});
    setChatByIdea({});
    setHiddenPackIds([]);
    setScreen("home");
  }

  const packs = mergePackLists(generatedPacks, appLanguage).filter(
    (pack) => !hiddenPackIds.includes(pack.id)
  );

  const activePack = getPackById(packs, activePackId);
  const activeIdea =
    activePack?.ideas?.find((idea) => idea.id === activeIdeaId) || activePack?.ideas?.[0] || null;

  function touchPackProgress(packId) {
    const touchedAt = new Date().toISOString();

    setProgressByPack((current) => {
      const currentPackProgress = current[packId] || {};

      return {
        ...current,
        [packId]: withPackTouch(currentPackProgress, touchedAt),
      };
    });
  }

  function openPack(packId) {
    touchPackProgress(packId);
    setActivePackId(packId);
    setScreen("detail");
  }

  function openStudio(entryMode = "default", pickedAsset = null, packFormat = "shorts") {
    setStudioEntryMode(entryMode);
    setStudioPickedAsset(pickedAsset);
    setStudioPackFormat(packFormat === "cards" ? "cards" : "shorts");
    setScreen("studio");
  }

  function openIdea(packId, ideaId) {
    touchPackProgress(packId);
    setActivePackId(packId);
    setActiveIdeaId(ideaId);
    setScreen("lesson");
  }

  function openPackReview(packId = activePackId) {
    touchPackProgress(packId);
    setActivePackId(packId);
    setScreen("packReview");
  }

  function closeToPack() {
    setScreen("detail");
  }

  function finishIdea() {
    const existingProgress = progressByPack[activePackId] || {};
    const existingCompletedIdeaIds = existingProgress.completedIdeaIds || [];
    const nextCompletedIdeaIds = existingCompletedIdeaIds.includes(activeIdeaId)
      ? existingCompletedIdeaIds
      : [...existingCompletedIdeaIds, activeIdeaId];
    const packReviewCompleted = Boolean(existingProgress.packReview?.completedAt);
    const finishedAllIdeas = nextCompletedIdeaIds.length >= activePack.ideas.length;
    const touchedAt = new Date().toISOString();

    setProgressByPack((current) => {
      const currentPackProgress = current[activePackId] || {};
      const existing = currentPackProgress.completedIdeaIds || [];

      if (existing.includes(activeIdeaId)) {
        return current;
      }

      return {
        ...current,
        [activePackId]: {
          ...withPackTouch(currentPackProgress, touchedAt),
          completedIdeaIds: [...existing, activeIdeaId],
        },
      };
    });

    if (finishedAllIdeas && !packReviewCompleted && getPackReviewQuestions(activePack).length > 0) {
      setScreen("packReview");
      return;
    }

    setScreen("completion");
  }

  function finishPackReview(result) {
    const touchedAt = new Date().toISOString();

    setProgressByPack((current) => {
      const currentPackProgress = current[activePackId] || {};

      return {
        ...current,
        [activePackId]: {
          ...withPackTouch(currentPackProgress, touchedAt),
          packReview: {
            completedAt: touchedAt,
            score: Number(result?.score || 0),
            totalQuestions: Number(result?.totalQuestions || 0),
          },
        },
      };
    });

    setScreen("completion");
  }

  function openNextIdea() {
    const completedIdeaIds = getCompletedIdeaIds(progressByPack, activePackId);
    const nextIdea = getNextIdea(activePack, completedIdeaIds);

    if (!nextIdea) {
      setScreen("home");
      return;
    }

    openIdea(activePackId, nextIdea.id);
  }

  function addGeneratedPackSilent(pack) {
    const touchedAt = new Date().toISOString();
    setGeneratedPacks((current) => [
      pack,
      ...current.filter((item) => item.id !== pack.id && !BASE_PACK_IDS.has(item.id)),
    ]);
    setProgressByPack((current) => ({
      ...current,
      [pack.id]: withPackTouch(current[pack.id], touchedAt),
    }));
  }

  const { abortGenRef, dismissPendingGeneration, pendingGeneration, startBackgroundGenerate } =
    useBackgroundGeneration({
      API_BASE_URL,
      APP_UI_COPY,
      appLanguage,
      normalizeSourceText,
      onPackGenerated: addGeneratedPackSilent,
      setScreen,
    });

  function updatePackTitle(packId, newTitle) {
    setGeneratedPacks((current) =>
      current.map((pack) => (pack.id === packId ? { ...pack, title: newTitle } : pack))
    );
  }

  function removeGeneratedPack(packId) {
    setGeneratedPacks((current) => current.filter((item) => item.id !== packId));

    if (BASE_PACK_IDS.has(packId)) {
      setHiddenPackIds((current) => [...current, packId]);
    }

    setProgressByPack((current) => {
      const next = { ...current };
      delete next[packId];
      return next;
    });

    setChatByIdea((current) => {
      const next = { ...current };
      delete next[packId];
      return next;
    });

    const userId = session?.user?.id || null;
    if (userId) {
      Promise.all([
        db.deletePack(userId, packId),
        db.deleteProgress(userId, packId),
        db.deleteChatsForPack(userId, packId),
      ]).catch((error) => console.warn("Supabase delete failed:", error));
    }
  }

  function updateIdeaChat(packId, ideaId, nextMessages) {
    setChatByIdea((current) => ({
      ...current,
      [packId]: {
        ...(current[packId] || {}),
        [ideaId]: nextMessages,
      },
    }));
  }

  return {
    abortGenRef,
    activeIdea,
    activeIdeaId,
    activePack,
    activePackId,
    appLanguage,
    authLoading,
    chatByIdea,
    closeToPack,
    dismissPendingGeneration,
    finishIdea,
    finishPackReview,
    generatedPacks,
    handleGoogleLogin,
    handleLogout,
    hiddenPackIds,
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
  };
}
