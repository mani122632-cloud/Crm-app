// ai-gateway.js — AI MODULE (Stage 4 — real Gateway connection).
// PURPOSE: the ONLY module that talks to the network for AI purposes.
// Sends requests to the CRM's own Cloudflare Worker (never directly to
// Gemini, never with the Gemini API key — that key lives only inside
// the Worker's Secrets). Reads the app-to-gateway auth token from
// AIConfig.APP_SHARED_TOKEN (a placeholder in source; the real value
// is expected to be supplied through a secure mechanism, not committed
// here).
//
// Additive module: depends only on AIConfig. Does not touch Repo, DB,
// Services, or the DOM.
/* global AIConfig */
const AIGateway = {
  // Single entry point AI operations go through.
  // payload: { operation: string, prompt: string }
  // Returns a Promise resolving to { ok: boolean, text?: string, error?: string }.
  async call(payload) {
    if (!AIConfig || !AIConfig.ENABLED) {
      return { ok: false, error: 'AI_DISABLED' };
    }
    if (!AIConfig.GATEWAY_BASE_URL) {
      return { ok: false, error: 'GATEWAY_NOT_CONFIGURED' };
    }

    const url = buildInvokeUrl(AIConfig.GATEWAY_BASE_URL);
    const maxRetries = typeof AIConfig.MAX_RETRIES === 'number' ? AIConfig.MAX_RETRIES : 0;

    let attempt = 0;
    // attempt 0 = first try; attempts after that are retries.
    while (true) {
      const result = await sendOnce(url, payload, AIConfig);

      if (result.ok) return result;

      // Never retry on client/auth errors — retrying won't help and
      // could waste the Gateway's/Gemini's rate limit.
      const nonRetryable = ['UNAUTHORIZED', 'FORBIDDEN', 'INVALID_REQUEST'];
      if (nonRetryable.indexOf(result.error) !== -1) {
        return result;
      }

      if (attempt >= maxRetries) {
        return result;
      }
      attempt++;
    }
  },
};

// Builds the full invoke URL from the configured base, avoiding a
// double slash if the base already ends with "/".
function buildInvokeUrl(baseUrl) {
  const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return trimmedBase + '/ai/invoke';
}

// Performs a single HTTP attempt against the Gateway. Never throws —
// always resolves to { ok: true, text } or { ok: false, error }.
async function sendOnce(url, payload, config) {
  const timeoutMs = typeof config.REQUEST_TIMEOUT_MS === 'number' ? config.REQUEST_TIMEOUT_MS : 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Token': config.APP_SHARED_TOKEN || '',
      },
      body: JSON.stringify({
        operation: payload && payload.operation,
        prompt: payload && payload.prompt,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err && err.name === 'AbortError') {
      return { ok: false, error: 'TIMEOUT' };
    }
    // Network-level failure (offline, DNS, CORS, etc). Never include
    // err.message verbatim in case it echoes request details.
    return { ok: false, error: 'NETWORK_ERROR' };
  }
  clearTimeout(timeoutId);

  let data;
  try {
    data = await response.json();
  } catch (err) {
    return { ok: false, error: 'INVALID_RESPONSE' };
  }

  if (!response.ok) {
    return { ok: false, error: mapHttpStatus(response.status, data) };
  }

  if (data && data.ok === true) {
    if (typeof data.text === 'string' && data.text.length > 0) {
      return { ok: true, text: data.text };
    }
    return { ok: false, error: 'EMPTY_RESPONSE' };
  }

  if (data && data.ok === false) {
    // Pass through the Worker's own standardized internal code as-is;
    // it is already a safe code (never the API key/token), per the
    // Worker's contract.
    return { ok: false, error: (typeof data.error === 'string' && data.error) || 'UPSTREAM_ERROR' };
  }

  return { ok: false, error: 'INVALID_RESPONSE' };
}

// Maps an HTTP status (when the Worker itself returned a non-2xx) to a
// standardized internal error code. Falls back to any error code the
// Worker's JSON body already provides.
function mapHttpStatus(status, data) {
  if (data && typeof data.error === 'string' && data.error) {
    return data.error;
  }
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 400) return 'INVALID_REQUEST';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'UPSTREAM_ERROR';
  return 'UPSTREAM_ERROR';
}
