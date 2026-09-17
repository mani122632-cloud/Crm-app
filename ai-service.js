// ai-service.js — NEW AI MODULE (Phase 1 — AI Copilot architecture).
// PURPOSE: the AI business-logic layer, parallel to services.js and
// completely separate from it. This file:
//   - reads existing CRM data ONLY through the existing, unmodified
//     Repo / CustomerService objects (read-only calls: Repo.list,
//     Repo.get, CustomerService.detail — nothing here ever calls
//     Repo.save/remove or writes to any store);
//   - shapes that data into plain objects for ai-prompts.js;
//   - delegates the actual AI call to ai-gateway.js;
//   - never touches the DOM.
//
// Additive module: does NOT modify services.js, repo.js, or db.js.
// It only reads from objects those files already expose globally.
/* global Repo, CustomerService, AIPrompts, AIGateway, AICache */
const AIService = {
  // Internal helper: wraps a gateway call with caching and uniform
  // error handling. Not exported; used by the public methods below.
  async _run(cacheKey, prompt, operation) {
    const cached = AICache.get(cacheKey);
    if (cached !== undefined) return cached;

    const result = await AIGateway.call({ operation: operation, prompt: prompt });
    if (result.ok) {
      AICache.set(cacheKey, result);
    }
    return result;
  },

  // Reads a customer (read-only) and asks the AI layer for a summary.
  async summarizeCustomer(customerId) {
    const detail = typeof CustomerService !== 'undefined' && CustomerService.detail
      ? await CustomerService.detail(customerId)
      : { customer: await Repo.get('customers', customerId), deals: [], orders: [] };
    const c = detail.customer || {};
    const dealsValue = (detail.deals || []).reduce(function (s, d) { return s + (Number(d.value) || 0); }, 0);
    const ordersTotal = (detail.orders || []).reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);

    const prompt = AIPrompts.customerSummary({
      name: c.name,
      company: c.companyId,
      status: c.statusId,
      dealsValue: dealsValue,
      ordersTotal: ordersTotal,
      tags: c.tags,
    });
    return this._run('summarizeCustomer:' + customerId, prompt, 'customerSummary');
  },

  // Reads a customer's activities (read-only) and asks for a history summary.
  async summarizeCommunicationHistory(customerId) {
    const activities = await Repo.list('activities', function (a) { return a.customerId === customerId; });
    const items = (activities || []).map(function (a) {
      return { type: a.type, note: a.note, date: a.createdAt };
    });
    const prompt = AIPrompts.communicationHistorySummary({ items: items });
    return this._run('commHistory:' + customerId, prompt, 'communicationHistorySummary');
  },

  // Reads a deal (read-only) and asks for a next-action suggestion.
  async suggestNextAction(dealId) {
    const deal = await Repo.get('deals', dealId);
    const prompt = AIPrompts.nextActionSuggestion({
      title: deal && deal.title,
      stage: deal && deal.stageId,
      value: deal && deal.value,
      probability: deal && deal.probability,
      lastActivityAt: deal && deal.lastActivityAt,
    });
    return this._run('nextAction:' + dealId, prompt, 'nextActionSuggestion');
  },

  // Reads a customer (read-only) and drafts a follow-up message.
  async draftFollowUpMessage(customerId, context) {
    const c = await Repo.get('customers', customerId);
    const prompt = AIPrompts.followUpDraft({
      customerName: c && c.name,
      context: context || '',
    });
    // Not cached: follow-up drafts are meant to vary per request.
    return AIGateway.call({ operation: 'followUpDraft', prompt: prompt });
  },

  // Reads a lead or deal (read-only) and asks for an analysis.
  async analyzeLeadOrDeal(type, id) {
    const store = type === 'lead' ? 'leads' : 'deals';
    const row = await Repo.get(store, id);
    const prompt = AIPrompts.leadDealAnalysis({
      type: type,
      name: row && (row.name || row.title),
      value: row && row.value,
      source: row && row.source,
      statusHistory: undefined,
    });
    return this._run('leadDealAnalysis:' + type + ':' + id, prompt, 'leadDealAnalysis');
  },

  // Reads all customers (read-only) and asks the AI to flag at-risk ones.
  async detectAtRiskCustomers() {
    const customers = await Repo.list('customers', function (c) { return !c.archived; });
    const summarized = (customers || []).map(function (c) {
      return { name: c.name, lastActivityAt: c.lastActivityAt, dealsValue: c.dealsValue };
    });
    const prompt = AIPrompts.churnDetection({ customers: summarized });
    return this._run('churnDetection:all', prompt, 'churnDetection');
  },

  // Reads deals (read-only) and asks for a sales trend analysis.
  async analyzeSalesTrend(periodLabel) {
    const deals = await Repo.list('deals');
    const wonDeals = (deals || []).filter(function (d) { return d.status === 'won'; }).length;
    const lostDeals = (deals || []).filter(function (d) { return d.status === 'lost'; }).length;
    const totalValue = (deals || []).reduce(function (s, d) { return s + (Number(d.value) || 0); }, 0);

    const prompt = AIPrompts.salesTrendAnalysis({
      periodLabel: periodLabel,
      totalDeals: (deals || []).length,
      wonDeals: wonDeals,
      lostDeals: lostDeals,
      totalValue: totalValue,
    });
    return this._run('salesTrend:' + (periodLabel || 'all'), prompt, 'salesTrendAnalysis');
  },

  // Free-form chat message from the AI assistant widget (ai-copilot.js).
  // Not cached: each message is conversational and meant to vary per
  // request. Does not read any CRM data store itself — the caller is
  // responsible for what context (if any) it includes in `history`.
  async chat(message, history) {
    const prompt = AIPrompts.assistantChat({ message: message, history: history || [] });
    return AIGateway.call({ operation: 'assistantChat', prompt: prompt });
  },
};
