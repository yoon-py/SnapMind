const {
  createPersistentJobStore,
  createSupabaseJobPersistence,
} = require("../../shared/backend-core/dist/cjs/jobs");

function createJobStore({ ttlMs = 2 * 60 * 60 * 1000 } = {}) {
  return createPersistentJobStore({
    persistence: null,
    ttlMs,
  });
}

module.exports = {
  createJobStore,
};
