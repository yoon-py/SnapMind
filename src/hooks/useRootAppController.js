import { useEffect, useState } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Alert, Platform } from "react-native";

import { supabase } from "../supabase";
import * as db from "../supabaseDb";
import { useBackgroundGeneration } from "./useBackgroundGeneration";
import { usePackPersistence } from "./usePackPersistence";
import { usePushNotifications } from "./usePushNotifications";

function parseAuthCallbackParams(url) {
  const params = new URLSearchParams();
  const queryStart = url.indexOf("?");
  const hashStart = url.indexOf("#");

  if (queryStart >= 0) {
    const queryEnd = hashStart >= 0 && hashStart > queryStart ? hashStart : url.length;
    const queryParams = new URLSearchParams(url.slice(queryStart + 1, queryEnd));
    queryParams.forEach((value, key) => params.set(key, value));
  }

  if (hashStart >= 0) {
    const hashParams = new URLSearchParams(url.slice(hashStart + 1));
    hashParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });
  }

  return params;
}

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
  const DEV_BYPASS_AUTH = __DEV__ && process.env.EXPO_PUBLIC_DEV_BYPASS_AUTH === "1";
  const [session, setSession] = useState(DEV_BYPASS_AUTH ? { user: { id: "dev-user", email: "dev@local" } } : null);
  const [authLoading, setAuthLoading] = useState(!DEV_BYPASS_AUTH);
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

  usePushNotifications({ API_BASE_URL, session });

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }

    const params = parseAuthCallbackParams(window.location.href);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token) {
      return;
    }

    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(() => {
        window.history.replaceState(null, "", window.location.origin + window.location.pathname);
        setScreen("home");
      })
      .catch((error) => {
        console.warn("web auth callback failed:", error?.message);
      });
  }, []);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session: currentSession } }) => {
        setSession(currentSession);
        setAuthLoading(false);
      })
      .catch((err) => {
        console.warn("getSession failed:", err?.message);
        setAuthLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleGoogleLogin() {
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const redirectTo = window.location.origin;
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
        });

        if (error) { Alert.alert("로그인 오류", error.message); return; }
        if (data?.url) {
          window.location.assign(data.url);
        }
        return;
      }

      const returnUrl = AuthSession.makeRedirectUri({
        native: "snapmind://auth",
        scheme: "snapmind",
        path: "auth",
      });
      const redirectTo = `${API_BASE_URL}/auth/callback?returnScheme=${encodeURIComponent(returnUrl)}`;

      try {
        WebBrowser.dismissAuthSession();
      } catch (_) {
        // no-op
      }

      try {
        await WebBrowser.dismissBrowser();
      } catch (_) {
        // no-op
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
      });

      if (error) { Alert.alert("로그인 오류", error.message); return; }

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
        if (result.type === "success" && result.url) {
          const params = parseAuthCallbackParams(result.url);
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token) await supabase.auth.setSession({ access_token, refresh_token });
        }
      }
    } catch (error) {
      Alert.alert("로그인 오류", error.message);
    }
  }

  function handleGuestLogin() {
    // 로컬 테스트용 게스트 세션 (Google OAuth 없이 앱 진입). dev-bypass와 동일한 가짜 세션 패턴.
    setSession({ user: { id: "guest-user", email: "guest@local", isGuest: true } });
    setAuthLoading(false);
  }

  async function handleLogout() {
    try { await supabase.auth.signOut(); } catch (_) { /* 게스트는 실제 세션이 없어 무시 */ }
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
    setStudioPackFormat(["cards", "shorts", "deck"].includes(packFormat) ? packFormat : "shorts");
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

  // 쇼츠를 끝까지 봤을 때(퀴즈/화면 전환과 무관하게) 완료 표시만 남기고 화면은 그대로 둔다.
  function markIdeaWatched(packId, ideaId) {
    const touchedAt = new Date().toISOString();
    setProgressByPack((current) => {
      const currentPackProgress = current[packId] || {};
      const existing = currentPackProgress.completedIdeaIds || [];

      if (existing.includes(ideaId)) {
        return current;
      }

      return {
        ...current,
        [packId]: {
          ...withPackTouch(currentPackProgress, touchedAt),
          completedIdeaIds: [...existing, ideaId],
        },
      };
    });
  }

  function finishIdea(options = {}) {
    const existingProgress = progressByPack[activePackId] || {};
    const existingCompletedIdeaIds = existingProgress.completedIdeaIds || [];
    const shouldCompleteAllIdeas = Boolean(options.completeAllIdeas);
    const allIdeaIds = Array.isArray(activePack?.ideas) ? activePack.ideas.map((idea) => idea.id) : [];
    const nextCompletedIdeaIds = shouldCompleteAllIdeas
      ? allIdeaIds
      : existingCompletedIdeaIds.includes(activeIdeaId)
        ? existingCompletedIdeaIds
        : [...existingCompletedIdeaIds, activeIdeaId];
    const packReviewCompleted = Boolean(existingProgress.packReview?.completedAt);
    const finishedAllIdeas = nextCompletedIdeaIds.length >= activePack.ideas.length;
    const touchedAt = new Date().toISOString();

    setProgressByPack((current) => {
      const currentPackProgress = current[activePackId] || {};
      const existing = currentPackProgress.completedIdeaIds || [];
      const nextIds = shouldCompleteAllIdeas
        ? allIdeaIds
        : existing.includes(activeIdeaId)
          ? existing
          : [...existing, activeIdeaId];

      if (!shouldCompleteAllIdeas && existing.includes(activeIdeaId)) {
        return current;
      }

      return {
        ...current,
        [activePackId]: {
          ...withPackTouch(currentPackProgress, touchedAt),
          completedIdeaIds: nextIds,
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
      session,
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
    markIdeaWatched,
    generatedPacks,
    handleGoogleLogin,
    handleGuestLogin,
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
