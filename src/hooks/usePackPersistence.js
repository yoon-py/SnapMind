import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";

import * as db from "../supabaseDb";

function getDefaultAppLanguage() {
  return getLocales()[0]?.languageCode === "ko" ? "ko" : "en";
}

function normalizeStoredLanguage(value) {
  return value === "en" || value === "ko" ? value : getDefaultAppLanguage();
}

export function usePackPersistence({ session, STORAGE_KEYS }) {
  const [generatedPacks, setGeneratedPacks] = useState([]);
  const [progressByPack, setProgressByPack] = useState({});
  const [chatByIdea, setChatByIdea] = useState({});
  const [appLanguage, setAppLanguage] = useState(getDefaultAppLanguage);
  const [hiddenPackIds, setHiddenPackIds] = useState([]);
  const [isStorageHydrated, setIsStorageHydrated] = useState(false);

  const packsTimerRef = useRef(null);
  const progressTimerRef = useRef(null);
  const chatsTimerRef = useRef(null);
  const prefsTimerRef = useRef(null);

  const generatedPacksKey = STORAGE_KEYS.generatedPacks;
  const progressByPackKey = STORAGE_KEYS.progressByPack;
  const chatByIdeaKey = STORAGE_KEYS.chatByIdea;
  const appLanguageKey = STORAGE_KEYS.appLanguage;
  const hiddenPackIdsKey = STORAGE_KEYS.hiddenPackIds;
  const userId = session?.user?.id || null;

  useEffect(() => {
    let isMounted = true;

    async function hydrateFromAsyncStorage() {
      const entries = await AsyncStorage.multiGet([
        generatedPacksKey,
        progressByPackKey,
        chatByIdeaKey,
        appLanguageKey,
        hiddenPackIdsKey,
      ]);
      const entryMap = Object.fromEntries(entries);

      return {
        generatedPacks: JSON.parse(entryMap[generatedPacksKey] || "[]"),
        progressByPack: JSON.parse(entryMap[progressByPackKey] || "{}"),
        chatByIdea: JSON.parse(entryMap[chatByIdeaKey] || "{}"),
        appLanguage: JSON.parse(entryMap[appLanguageKey] || "\"ko\""),
        hiddenPackIds: JSON.parse(entryMap[hiddenPackIdsKey] || "[]"),
      };
    }

    async function hydrateFromSupabase(nextUserId) {
      const [packs, progress, chats, prefs] = await Promise.all([
        db.fetchPacks(nextUserId),
        db.fetchProgress(nextUserId),
        db.fetchChats(nextUserId),
        db.fetchPreferences(nextUserId),
      ]);

      return { packs, progress, chats, prefs };
    }

    async function migrateAsyncStorageToSupabase(nextUserId, local) {
      const migrationKey = `clip-note/migrated-to-supabase/${nextUserId}`;
      const alreadyMigrated = await AsyncStorage.getItem(migrationKey);
      if (alreadyMigrated) {
        return false;
      }

      const hasLocalData =
        (Array.isArray(local.generatedPacks) && local.generatedPacks.length > 0) ||
        Object.keys(local.progressByPack || {}).length > 0 ||
        Object.keys(local.chatByIdea || {}).length > 0;

      if (!hasLocalData) {
        await AsyncStorage.setItem(migrationKey, "true");
        return false;
      }

      try {
        if (local.generatedPacks.length > 0) {
          await db.upsertPacks(nextUserId, local.generatedPacks);
        }

        for (const [packId, progress] of Object.entries(local.progressByPack || {})) {
          await db.upsertProgress(nextUserId, packId, progress);
        }

        for (const [packId, ideaChats] of Object.entries(local.chatByIdea || {})) {
          for (const [ideaId, messages] of Object.entries(ideaChats || {})) {
            if (messages && messages.length > 0) {
              await db.upsertChat(nextUserId, packId, ideaId, messages);
            }
          }
        }

        await db.upsertPreferences(nextUserId, {
          language: local.appLanguage || "ko",
          hiddenPackIds: local.hiddenPackIds || [],
        });

        await AsyncStorage.setItem(migrationKey, "true");
        return true;
      } catch (error) {
        console.warn("Migration to Supabase failed (will retry next launch):", error);
        return false;
      }
    }

    async function hydratePersistedData() {
      try {
        const local = await hydrateFromAsyncStorage();

        if (userId) {
          await migrateAsyncStorageToSupabase(userId, local);
          const remote = await hydrateFromSupabase(userId);

          if (!isMounted) {
            return;
          }

          setGeneratedPacks(Array.isArray(remote.packs) ? remote.packs : []);
          setProgressByPack(remote.progress && typeof remote.progress === "object" ? remote.progress : {});
          setChatByIdea(remote.chats && typeof remote.chats === "object" ? remote.chats : {});
          setAppLanguage(normalizeStoredLanguage(remote.prefs?.language));
          setHiddenPackIds(
            Array.isArray(remote.prefs?.hiddenPackIds) ? remote.prefs.hiddenPackIds : []
          );
          return;
        }

        if (!isMounted) {
          return;
        }

        setGeneratedPacks(Array.isArray(local.generatedPacks) ? local.generatedPacks : []);
        setProgressByPack(
          local.progressByPack && typeof local.progressByPack === "object" ? local.progressByPack : {}
        );
        setChatByIdea(local.chatByIdea && typeof local.chatByIdea === "object" ? local.chatByIdea : {});
        setAppLanguage(normalizeStoredLanguage(local.appLanguage));
        setHiddenPackIds(Array.isArray(local.hiddenPackIds) ? local.hiddenPackIds : []);
      } catch (error) {
        console.warn("Failed to hydrate persisted Clip-Note data.", error);
      } finally {
        if (isMounted) {
          setIsStorageHydrated(true);
        }
      }
    }

    hydratePersistedData();

    return () => {
      isMounted = false;
    };
  }, [userId, generatedPacksKey, progressByPackKey, chatByIdeaKey, appLanguageKey, hiddenPackIdsKey]);

  useEffect(() => {
    return () => {
      clearTimeout(packsTimerRef.current);
      clearTimeout(progressTimerRef.current);
      clearTimeout(chatsTimerRef.current);
      clearTimeout(prefsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isStorageHydrated) {
      return;
    }

    AsyncStorage.setItem(generatedPacksKey, JSON.stringify(generatedPacks)).catch((error) =>
      console.warn("Failed to persist generated packs.", error)
    );

    if (userId) {
      clearTimeout(packsTimerRef.current);
      packsTimerRef.current = setTimeout(() => {
        db.upsertPacks(userId, generatedPacks).catch((error) =>
          console.warn("Supabase pack sync failed:", error)
        );
      }, 1500);
    }
  }, [generatedPacks, isStorageHydrated, generatedPacksKey, userId]);

  useEffect(() => {
    if (!isStorageHydrated) {
      return;
    }

    AsyncStorage.setItem(progressByPackKey, JSON.stringify(progressByPack)).catch((error) =>
      console.warn("Failed to persist pack progress.", error)
    );

    if (userId) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = setTimeout(() => {
        Promise.all(
          Object.entries(progressByPack).map(([packId, progress]) =>
            db.upsertProgress(userId, packId, progress)
          )
        ).catch((error) => console.warn("Supabase progress sync failed:", error));
      }, 1500);
    }
  }, [progressByPack, isStorageHydrated, progressByPackKey, userId]);

  useEffect(() => {
    if (!isStorageHydrated) {
      return;
    }

    AsyncStorage.setItem(chatByIdeaKey, JSON.stringify(chatByIdea)).catch((error) =>
      console.warn("Failed to persist idea tutor chat.", error)
    );

    if (userId) {
      clearTimeout(chatsTimerRef.current);
      chatsTimerRef.current = setTimeout(() => {
        const promises = [];

        for (const [packId, ideaChats] of Object.entries(chatByIdea)) {
          for (const [ideaId, messages] of Object.entries(ideaChats || {})) {
            promises.push(db.upsertChat(userId, packId, ideaId, messages));
          }
        }

        Promise.all(promises).catch((error) => console.warn("Supabase chat sync failed:", error));
      }, 2000);
    }
  }, [chatByIdea, isStorageHydrated, chatByIdeaKey, userId]);

  useEffect(() => {
    if (!isStorageHydrated) {
      return;
    }

    AsyncStorage.setItem(appLanguageKey, JSON.stringify(appLanguage)).catch((error) =>
      console.warn("Failed to persist app language.", error)
    );

    if (userId) {
      clearTimeout(prefsTimerRef.current);
      prefsTimerRef.current = setTimeout(() => {
        db.upsertPreferences(userId, { language: appLanguage, hiddenPackIds }).catch((error) =>
          console.warn("Supabase prefs sync failed:", error)
        );
      }, 1000);
    }
  }, [appLanguage, hiddenPackIds, isStorageHydrated, appLanguageKey, userId]);

  useEffect(() => {
    if (!isStorageHydrated) {
      return;
    }

    AsyncStorage.setItem(hiddenPackIdsKey, JSON.stringify(hiddenPackIds)).catch((error) =>
      console.warn("Failed to persist hidden pack IDs.", error)
    );
  }, [hiddenPackIds, isStorageHydrated, hiddenPackIdsKey]);

  return {
    appLanguage,
    chatByIdea,
    generatedPacks,
    hiddenPackIds,
    isStorageHydrated,
    progressByPack,
    setAppLanguage,
    setChatByIdea,
    setGeneratedPacks,
    setHiddenPackIds,
    setProgressByPack,
  };
}
