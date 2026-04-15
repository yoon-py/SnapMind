function createAuthSessionStore({ ttlMs = 5 * 60 * 1000 } = {}) {
  const sessions = new Map();

  function set(state, payload) {
    sessions.set(state, {
      ...payload,
      ts: Date.now(),
    });

    setTimeout(() => sessions.delete(state), ttlMs);
  }

  function consume(state) {
    const entry = sessions.get(state);
    if (!entry) {
      return null;
    }

    sessions.delete(state);
    return entry;
  }

  return {
    consume,
    set,
  };
}

module.exports = {
  createAuthSessionStore,
};
