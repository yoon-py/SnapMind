import { supabase } from "./supabase";

// ─── Packs ───

export async function fetchPacks(userId) {
  const { data, error } = await supabase
    .from("packs")
    .select("id, data")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => row.data);
}

export async function upsertPack(userId, pack) {
  const { error } = await supabase.from("packs").upsert(
    { id: pack.id, user_id: userId, data: pack },
    { onConflict: "id" }
  );
  if (error) throw error;
}

export async function upsertPacks(userId, packs) {
  if (!packs.length) return;
  const rows = packs.map((pack) => ({
    id: pack.id,
    user_id: userId,
    data: pack,
  }));
  const { error } = await supabase.from("packs").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

export async function deletePack(userId, packId) {
  const { error } = await supabase
    .from("packs")
    .delete()
    .eq("id", packId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ─── Progress ───

export async function fetchProgress(userId) {
  const { data, error } = await supabase
    .from("user_progress")
    .select("pack_id, completed_idea_ids, pack_review, last_touched_at")
    .eq("user_id", userId);

  if (error) throw error;

  const progressByPack = {};
  for (const row of data || []) {
    progressByPack[row.pack_id] = {
      completedIdeaIds: row.completed_idea_ids || [],
      packReview: row.pack_review || null,
      lastTouchedAt: row.last_touched_at,
    };
  }
  return progressByPack;
}

export async function upsertProgress(userId, packId, progress) {
  const { error } = await supabase.from("user_progress").upsert(
    {
      user_id: userId,
      pack_id: packId,
      completed_idea_ids: progress.completedIdeaIds || [],
      pack_review: progress.packReview || null,
    },
    { onConflict: "user_id,pack_id" }
  );
  if (error) throw error;
}

export async function deleteProgress(userId, packId) {
  const { error } = await supabase
    .from("user_progress")
    .delete()
    .eq("user_id", userId)
    .eq("pack_id", packId);
  if (error) throw error;
}

// ─── Chats ───

export async function fetchChats(userId) {
  const { data, error } = await supabase
    .from("idea_chats")
    .select("pack_id, idea_id, messages")
    .eq("user_id", userId);

  if (error) throw error;

  // Nested structure: chatByIdea[packId][ideaId] = messages
  const chatByIdea = {};
  for (const row of data || []) {
    if (!chatByIdea[row.pack_id]) chatByIdea[row.pack_id] = {};
    chatByIdea[row.pack_id][row.idea_id] = row.messages || [];
  }
  return chatByIdea;
}

export async function upsertChat(userId, packId, ideaId, messages) {
  const { error } = await supabase.from("idea_chats").upsert(
    {
      user_id: userId,
      pack_id: packId,
      idea_id: ideaId,
      messages,
    },
    { onConflict: "user_id,pack_id,idea_id" }
  );
  if (error) throw error;
}

export async function deleteChatsForPack(userId, packId) {
  const { error } = await supabase
    .from("idea_chats")
    .delete()
    .eq("user_id", userId)
    .eq("pack_id", packId);
  if (error) throw error;
}

// ─── Preferences ───

export async function fetchPreferences(userId) {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("language, hidden_pack_ids")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
  if (!data) return null;

  return {
    language: data.language || "ko",
    hiddenPackIds: data.hidden_pack_ids || [],
  };
}

export async function upsertPreferences(userId, prefs) {
  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: userId,
      language: prefs.language,
      hidden_pack_ids: prefs.hiddenPackIds || [],
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}
