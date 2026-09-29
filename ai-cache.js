// ai-cache.js — NEW AI MODULE (Phase 1 — AI Copilot architecture).
// PURPOSE: lightweight in-memory cache for AI responses, to avoid
// repeated calls for the same request within a session. Purely
// in-memory (a plain JS object) — does NOT use IndexedDB, does NOT
// touch db.js/repo.js, and does NOT persist across app restarts.
//
// Additive module: fully self-contained, no dependency on any other
// file. Safe to load even before the AI feature is enabled.
/* global AIConfig */
const AICache = {
  _store: {},

  _now() {
    return Date.now();
  },

  // Reads a cached value if present and not expired. Returns undefined otherwise.
  get(key) {
    const entry = this._store[key];
    if (!entry) return undefined;
    if (entry.expiresAt < this._now()) {
      delete this._store[key];
      return undefined;
    }
    return entry.value;
  },

  // Stores a value with a TTL (ms). Falls back to AIConfig.CACHE_TTL_MS if not given.
  set(key, value, ttlMs) {
    const ttl = (typeof ttlMs === 'number' ? ttlMs : (AIConfig && AIConfig.CACHE_TTL_MS) || 300000);
    this._store[key] = { value: value, expiresAt: this._now() + ttl };
  },

  // Removes a single cached entry.
  clear(key) {
    delete this._store[key];
  },

  // Removes all cached entries.
  clearAll() {
    this._store = {};
  },
};
