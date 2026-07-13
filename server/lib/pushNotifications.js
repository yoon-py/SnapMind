const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return {
    baseUrl: supabaseUrl.replace(/\/$/, ""),
    serviceRoleKey,
  };
}

function getSupabaseHeaders(config, extra = {}) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function getUserFromAuthHeader(request) {
  const authHeader = String(request.headers.authorization || "");
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1];
  const config = getSupabaseConfig();

  if (!accessToken || !config) {
    return null;
  }

  const response = await fetch(`${config.baseUrl}/auth/v1/user`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function upsertPushToken({ platform, token, userId }) {
  const config = getSupabaseConfig();

  if (!config || !userId || !token) {
    return false;
  }

  const response = await fetch(`${config.baseUrl}/rest/v1/push_tokens`, {
    method: "POST",
    headers: getSupabaseHeaders(config, {
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify([
      {
        enabled: true,
        platform: platform || "unknown",
        token,
        user_id: userId,
      },
    ]),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Push token save failed: ${response.status} ${body}`);
  }

  return true;
}

async function getPushTokensForUser(userId) {
  const config = getSupabaseConfig();

  if (!config || !userId) {
    return [];
  }

  const response = await fetch(
    `${config.baseUrl}/rest/v1/push_tokens?select=token&enabled=eq.true&user_id=eq.${encodeURIComponent(userId)}`,
    {
      headers: getSupabaseHeaders(config),
    }
  );

  if (!response.ok) {
    return [];
  }

  const rows = await response.json().catch(() => []);
  return Array.from(new Set((rows || []).map((row) => row.token).filter(Boolean)));
}

async function sendExpoPushNotifications(messages) {
  if (!messages.length) {
    return;
  }

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Expo push failed: ${response.status} ${body}`);
  }
}

async function sendGenerationNotification({ body, data = {}, title, userId }) {
  const tokens = await getPushTokensForUser(userId);

  if (!tokens.length) {
    return;
  }

  await sendExpoPushNotifications(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: "default",
      data,
    }))
  );
}

module.exports = {
  getUserFromAuthHeader,
  sendGenerationNotification,
  upsertPushToken,
};
