// ai-config.js — NEW AI MODULE (Phase 1 — AI Copilot architecture).
// PURPOSE: central, static configuration for the AI layer only.
// This file does NOT contain any API key, does NOT call any network
// endpoint, and does NOT connect to any AI provider. It only defines
// constants that the rest of the AI layer (ai-gateway.js, ai-service.js)
// will read later, in a future phase.
//
// Additive module: does not read, modify, or depend on any existing
// CRM file (db.js, repo.js, services.js, app.js, etc.).
/* global */
const AIConfig = {
  // Whether the AI Copilot feature is active at all. Kept OFF in Phase 1
  // since no gateway/provider is wired up yet.
  ENABLED: true,

  // Base URL of the app's OWN backend Gateway (never the AI provider's
  // URL, and never an API key). Left empty until Phase 2/3 wiring.
  GATEWAY_BASE_URL: 'https://ai-gateway-worker.mani122632.workers.dev',

  // Shared app-to-gateway auth token, sent as the X-App-Token header.
  // PLACEHOLDER ONLY — the real value is never stored in source and
  // must be provided through a secure mechanism outside this file.
  APP_SHARED_TOKEN: '',

  // Per-feature flags — allows enabling AI capabilities one at a time
  // later without touching this file's structure.
  FEATURES: {
    customerSummary: true,
    communicationHistorySummary: false,
    nextActionSuggestion: true,
    followUpDraft: false,
    leadDealAnalysis: false,
    churnDetection: false,
    salesTrendAnalysis: false,
  },

  // Network behavior defaults for ai-gateway.js (Phase 3+).
  REQUEST_TIMEOUT_MS: 15000,
  MAX_RETRIES: 1,

  // Default cache TTL (ms) used by ai-cache.js.
  CACHE_TTL_MS: 5 * 60 * 1000,
};
