// ai-prompts.js — NEW AI MODULE (Phase 1 — AI Copilot architecture).
// PURPOSE: pure prompt-building functions for the AI Copilot. Every
// function here takes plain JS data (already fetched by ai-service.js)
// and returns a prompt string. Nothing in this file touches the DOM,
// the network, or any CRM data store directly.
//
// Additive module: no dependency on Repo/DB/Services/UI. Safe to load
// on its own; has no effect until ai-service.js calls it.
/* global */
const AIPrompts = {
  // Builds a prompt to summarize a single customer's file.
  // Expects: { name, phone, company, status, dealsValue, ordersTotal, tags }
  customerSummary(data) {
    data = data || {};
    return 'خلاصه‌ای کوتاه و حرفه‌ای از وضعیت این مشتری برای یک کارشناس فروش بنویس.\n' +
      'نام: ' + (data.name || '-') + '\n' +
      'شرکت: ' + (data.company || '-') + '\n' +
      'وضعیت: ' + (data.status || '-') + '\n' +
      'مجموع ارزش فرصت‌های فروش: ' + (data.dealsValue != null ? data.dealsValue : '-') + '\n' +
      'مجموع سفارش‌ها: ' + (data.ordersTotal != null ? data.ordersTotal : '-') + '\n' +
      'برچسب‌ها: ' + (Array.isArray(data.tags) ? data.tags.join('، ') : '-');
  },

  // Builds a prompt to summarize a communication/activity timeline.
  // Expects: { items: [{ type, note, date }, ...] }
  communicationHistorySummary(data) {
    data = data || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const lines = items.map(function (it) {
      return '- [' + (it.date || '-') + '] (' + (it.type || '-') + ') ' + (it.note || '');
    }).join('\n');
    return 'تاریخچه ارتباطات زیر با یک مشتری را در چند جمله خلاصه کن:\n' + lines;
  },

  // Builds a prompt to suggest the next sales action for a deal.
  // Expects: { title, stage, value, probability, lastActivityAt }
  nextActionSuggestion(data) {
    data = data || {};
    return 'با توجه به اطلاعات این فرصت فروش، یک اقدام بعدی مشخص و عملی پیشنهاد بده.\n' +
      'عنوان: ' + (data.title || '-') + '\n' +
      'مرحله: ' + (data.stage || '-') + '\n' +
      'ارزش: ' + (data.value != null ? data.value : '-') + '\n' +
      'احتمال موفقیت: ' + (data.probability != null ? data.probability : '-') + '\n' +
      'آخرین فعالیت: ' + (data.lastActivityAt || '-');
  },

  // Builds a prompt to draft a follow-up message to a customer.
  // Expects: { customerName, context }
  followUpDraft(data) {
    data = data || {};
    return 'یک پیام پیگیری کوتاه، مودبانه و حرفه‌ای به فارسی برای مشتری زیر بنویس.\n' +
      'نام مشتری: ' + (data.customerName || '-') + '\n' +
      'زمینه/دلیل پیگیری: ' + (data.context || '-');
  },

  // Builds a prompt to analyze a lead or deal.
  // Expects: { type, name, value, source, statusHistory }
  leadDealAnalysis(data) {
    data = data || {};
    return 'این ' + (data.type === 'lead' ? 'سرنخ' : 'فرصت فروش') + ' را تحلیل کن و نقاط قوت/ضعف آن را بگو.\n' +
      'نام: ' + (data.name || '-') + '\n' +
      'ارزش: ' + (data.value != null ? data.value : '-') + '\n' +
      'منبع: ' + (data.source || '-') + '\n' +
      'تاریخچه وضعیت: ' + (data.statusHistory || '-');
  },

  // Builds a prompt to detect at-risk / inactive customers from a list.
  // Expects: { customers: [{ name, lastActivityAt, dealsValue }, ...] }
  churnDetection(data) {
    data = data || {};
    const customers = Array.isArray(data.customers) ? data.customers : [];
    const lines = customers.map(function (c) {
      return '- ' + (c.name || '-') + ' | آخرین فعالیت: ' + (c.lastActivityAt || '-') +
        ' | ارزش فرصت‌ها: ' + (c.dealsValue != null ? c.dealsValue : '-');
    }).join('\n');
    return 'از فهرست مشتریان زیر، مشتریانی که کم‌فعال یا در معرض ریزش هستند را مشخص کن و دلیل را بگو:\n' + lines;
  },

  // Builds a prompt to analyze overall sales trends.
  // Expects: { periodLabel, totalDeals, wonDeals, lostDeals, totalValue }
  salesTrendAnalysis(data) {
    data = data || {};
    return 'روند فروش زیر را تحلیل کن و یک جمع‌بندی مدیریتی کوتاه ارائه بده.\n' +
      'دوره: ' + (data.periodLabel || '-') + '\n' +
      'تعداد فرصت‌ها: ' + (data.totalDeals != null ? data.totalDeals : '-') + '\n' +
      'برد شده: ' + (data.wonDeals != null ? data.wonDeals : '-') + '\n' +
      'باخته شده: ' + (data.lostDeals != null ? data.lostDeals : '-') + '\n' +
      'ارزش کل: ' + (data.totalValue != null ? data.totalValue : '-');
  },

  // Builds a prompt for a free-form message sent to the in-app AI
  // assistant (chat widget). Expects: { message, history: [{ role: 'user'|'ai', text }, ...] }
  assistantChat(data) {
    data = data || {};
    const history = Array.isArray(data.history) ? data.history : [];
    const historyText = history.map(function (m) {
      return (m.role === 'user' ? 'کاربر' : 'دستیار') + ': ' + (m.text || '');
    }).join('\n');

    const contextText = data.context
      ? '\nاطلاعات واقعی موجود در CRM:\n' + JSON.stringify(data.context, null, 2) + '\n'
      : '';

    return 'تو دستیار هوشمند داخل یک نرم‌افزار CRM فارسی هستی. کوتاه، مفید، دقیق و حرفه‌ای به زبان فارسی پاسخ بده. فقط بر اساس اطلاعات واقعی ارائه‌شده پاسخ بده و اگر اطلاعات لازم وجود ندارد، صادقانه بگو که در داده‌های در دسترس نیست.\n' +
      contextText +
      (historyText ? 'گفتگوی قبلی:\n' + historyText + '\n\n' : '') +
      'پیام جدید کاربر: ' + (data.message || '');
  },
};
