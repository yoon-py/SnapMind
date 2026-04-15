const {
  createPersistentJobStore,
  createSupabaseJobPersistence,
} = require("../../shared/backend-core/dist/cjs/jobs");

function createJobStore({ ttlMs = 5 * 60 * 1000 } = {}) {
  const persistence = createSupabaseJobPersistence({
    supabaseUrl: process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  });

  return createPersistentJobStore({
    persistence,
    ttlMs,
  });
}

module.exports = {
  createJobStore,
};
