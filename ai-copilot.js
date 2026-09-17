// ai-copilot.js — AI MODULE (Phase 2 — AI Copilot chat widget).
// PURPOSE: additive, self-contained "دستیار هوشمند" (AI assistant) chat
// widget. Injects its own floating button and reuses the CRM's existing
// modal() system for the chat panel, so no new overlay/dialog infra is
// introduced. Talks to the AI layer ONLY through AIService.chat(), which
// goes through the existing, unmodified pipeline:
//   UI (this file) -> AIService -> AIGateway -> Cloudflare Worker -> Gemini
// — the exact same path already used by Customer Summary and Next Action
// Suggestion. No API key, secret, or Worker/Gemini config lives here or
// anywhere in this file.
//
// Does NOT touch: app.js, index.html, customer360.js, dashboard.js,
// db.js, repo.js, services.js, style.css, ui-redesign.css, ai-gateway.js,
// ai-config.js, or android/. The <script src="ai-copilot.js"> tag was
// already present in index.html before this change (this file was a
// reserved empty skeleton for exactly this phase) — purely additive.
/* global AIService, modal, $, esc, guard */
(function () {
  // In-memory only: resets on page reload. Not persisted to any store.
  var chatHistory = []; // { role: 'user'|'ai', text: string, error?: boolean, pending?: boolean }

  injectStyles();
  injectFab();

  // Scoped, self-contained styles for the FAB + chat bubbles, built only
  // from the CRM's existing CSS variables (var(--primary), var(--r-lg),
  // etc.) so the widget matches the current gold/cream theme without
  // editing style.css or ui-redesign.css.
  function injectStyles() {
    if (document.getElementById('ai-copilot-style')) return;
    var style = document.createElement('style');
    style.id = 'ai-copilot-style';
    style.textContent =
      '.ai-copilot-fab{position:fixed;left:16px;bottom:calc(72px + env(safe-area-inset-bottom));z-index:24;' +
      'width:52px;height:52px;border-radius:var(--r-full);border:none;cursor:pointer;' +
      'background:var(--primary);color:#fff;box-shadow:var(--shadow-3);' +
      'display:flex;align-items:center;justify-content:center;transition:transform .15s ease;padding:0;}' +
      '.ai-copilot-fab:active{transform:scale(.93);}' +
      '.ai-copilot-fab svg{width:26px;height:26px;}' +
      '.ai-chat-wrap{display:flex;flex-direction:column;height:min(60vh,520px);}' +
      '.ai-chat-messages{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:.55rem;padding:.2rem .1rem .6rem;}' +
      '.ai-chat-bubble{max-width:82%;padding:.55rem .8rem;border-radius:var(--r-lg);font-size:var(--fs-body);line-height:1.6;white-space:pre-wrap;word-break:break-word;}' +
      '.ai-chat-bubble.user{align-self:flex-start;background:var(--primary);color:#fff;border-bottom-left-radius:4px;}' +
      '.ai-chat-bubble.ai{align-self:flex-end;background:var(--primary-soft);color:var(--text);border:1px solid var(--border);border-bottom-right-radius:4px;}' +
      '.ai-chat-bubble.ai.error{background:#fdecea;border-color:#f3c2bd;color:#8a1f11;}' +
      '.ai-chat-row{display:flex;gap:.5rem;padding-top:.6rem;border-top:1px solid var(--border);}' +
      '.ai-chat-row textarea{flex:1;resize:none;min-height:44px;max-height:110px;border:1px solid var(--border);' +
      'border-radius:var(--r-sm);padding:.55rem .7rem;font-family:inherit;font-size:var(--fs-body);color:var(--text);background:var(--surface);}' +
      '.ai-chat-empty{color:var(--text-2);text-align:center;padding:1.2rem .5rem;font-size:var(--fs-caption);}';
    document.head.appendChild(style);
  }

  // Appends the floating action button directly to <body> (a sibling of
  // #app / #modal-root), so it persists across route changes since the
  // SPA's render() only ever rewrites #app, never document.body itself.
  function injectFab() {
    if (document.getElementById('ai-copilot-fab')) return;
    var btn = document.createElement('button');
    btn.id = 'ai-copilot-fab';
    btn.className = 'ai-copilot-fab';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'دستیار هوشمند AI');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    btn.onclick = openChatPanel;
    if (document.body) document.body.appendChild(btn);
  }

  // Opens the chat panel using the CRM's existing generic modal(), so it
  // gets the same overlay, swipe-to-close, and back-button behavior as
  // every other dialog in the app — no new modal system is introduced.
  function openChatPanel() {
    var body = '<div class="ai-chat-wrap"><div class="ai-chat-messages" id="ai-chat-messages"></div>' +
      '<div class="ai-chat-row"><textarea id="ai-chat-input" placeholder="پیام خود را بنویسید..." aria-label="پیام"></textarea>' +
      '<button class="btn small" id="ai-chat-send" type="button">ارسال</button></div></div>';
    modal('دستیار هوشمند AI', body, function () {
      renderMessages();
      var input = $('#ai-chat-input');
      var sendBtn = $('#ai-chat-send');
      if (input) {
        input.focus();
        input.onkeydown = function (e) {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (sendBtn) sendBtn.click(); }
        };
      }
      if (sendBtn) sendBtn.onclick = function () { sendMessage(); };
    });
  }

  function renderMessages() {
    var box = $('#ai-chat-messages');
    if (!box) return;
    if (!chatHistory.length) {
      box.innerHTML = '<div class="ai-chat-empty">سلام! هر سوالی درباره مشتریان، فرصت‌های فروش یا کارهای امروزتان دارید بپرسید.</div>';
      return;
    }
    box.innerHTML = chatHistory.map(function (m) {
      var cls = 'ai-chat-bubble ' + (m.role === 'user' ? 'user' : 'ai') + (m.error ? ' error' : '');
      return '<div class="' + cls + '">' + esc(m.text) + '</div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  async function sendMessage() {
    var input = $('#ai-chat-input');
    var sendBtn = $('#ai-chat-send');
    if (!input || !sendBtn) return;
    var text = (input.value || '').trim();
    if (!text) return;

    chatHistory.push({ role: 'user', text: text });
    input.value = '';
    renderMessages();

    await guard(sendBtn, async function () {
      chatHistory.push({ role: 'ai', text: 'در حال نوشتن پاسخ…', pending: true });
      renderMessages();

      var recent = chatHistory.filter(function (m) { return !m.pending; }).slice(-8);
      var result;
      if (typeof AIService === 'undefined' || !AIService.chat) {
        result = { ok: false, error: 'AI_DISABLED' };
      } else {
        result = await AIService.chat(text, recent);
      }

      var last = chatHistory[chatHistory.length - 1];
      if (last && last.pending) chatHistory.pop();

      if (result && result.ok && result.text) {
        chatHistory.push({ role: 'ai', text: result.text });
      } else {
        chatHistory.push({ role: 'ai', text: copilotAiErrorMessage(result && result.error), error: true });
      }
      renderMessages();
    });
  }

  // Maps AIGateway/AIService error codes to a short, user-facing Persian
  // message. Purely presentational — does not add any new AI capability
  // or touch the gateway itself.
  function copilotAiErrorMessage(code) {
    var map = {
      AI_DISABLED: 'قابلیت هوش مصنوعی در حال حاضر غیرفعال است.',
      GATEWAY_NOT_CONFIGURED: 'اتصال به سرویس هوش مصنوعی هنوز تنظیم نشده است.',
      TIMEOUT: 'دریافت پاسخ بیش از حد طول کشید. دوباره تلاش کنید.',
      NETWORK_ERROR: 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.',
      UNAUTHORIZED: 'دسترسی به سرویس هوش مصنوعی مجاز نیست.',
      FORBIDDEN: 'دسترسی به سرویس هوش مصنوعی مجاز نیست.',
      INVALID_REQUEST: 'درخواست نامعتبر بود.',
      RATE_LIMIT: 'تعداد درخواست‌ها زیاد بوده است. کمی بعد دوباره تلاش کنید.',
      EMPTY_RESPONSE: 'پاسخی از سرویس هوش مصنوعی دریافت نشد.',
      INVALID_RESPONSE: 'پاسخ نامعتبر از سرویس هوش مصنوعی دریافت شد.',
      UPSTREAM_ERROR: 'سرویس هوش مصنوعی موقتاً در دسترس نیست.',
    };
    return (code && map[code]) || 'ارسال پیام با خطا مواجه شد. دوباره تلاش کنید.';
  }
})();
