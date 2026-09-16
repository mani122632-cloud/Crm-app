// extensions.js — STAGE 8 additive service layer.
// Loaded after services.js. It adds NEW services and wraps two existing
// entry points (OrderService.create, ProductService.adjustStock) purely to
// record inventory movements — business rules themselves are NOT rewritten.
/* global Repo, DB, uid, nowISO, num, V, Dates, OrderService, ProductService, Money */
const QuoteService = {
  STATUSES: ['پیش‌نویس', 'ارسال‌شده', 'پذیرفته‌شده', 'ردشده', 'منقضی‌شده'],
  async create(data) {
    if (!V.required(data.customerId)) throw new Error('انتخاب مشتری الزامی است');
    if (!data.items || !data.items.length) throw new Error('حداقل یک قلم لازم است');
    for (const it of data.items) {
      if (!it.productId) throw new Error('محصول نامعتبر است');
      if (!V.number(it.quantity, 0.01)) throw new Error('تعداد نامعتبر است');
      const p = await DB.get('products', it.productId);
      if (!p) throw new Error('محصول یافت نشد');
      it.unitPriceSnapshot = p.price;
      it.productNameSnapshot = p.name;
    }
    const totals = Money.orderTotals(data.items, num(data.taxPercent), num(data.discount));
    const all = await DB.getAll('quotes');
    let maxN = 0;
    for (const q of all) { const m = /^QTA-(\d+)$/.exec(q.number || ''); if (m) maxN = Math.max(maxN, parseInt(m[1], 10)); }
    const quote = await Repo.save('quotes', {
      number: 'QTA-' + String(maxN + 1).padStart(4, '0'),
      customerId: data.customerId, companyId: data.companyId || null, dealId: data.dealId || null,
      issueDate: data.issueDate || Dates.todayStr(), validUntil: data.validUntil || null,
      status: 'پیش‌نویس', items: data.items,
      subtotal: totals.subtotal, discount: totals.discount, taxPercent: num(data.taxPercent),
      tax: totals.tax, total: totals.total,
      notes: data.notes || '',
    });
    for (const it of data.items) {
      await Repo.save('quoteItems', {
        quoteId: quote.id, productId: it.productId, productNameSnapshot: it.productNameSnapshot,
        unitPriceSnapshot: it.unitPriceSnapshot, quantity: it.quantity, discount: it.discount || 0,
      });
    }
    await Repo.logActivity('quote_created', { customerId: quote.customerId, dealId: quote.dealId }, 'پیشنهاد قیمت ' + quote.number + ' ثبت شد — مبلغ: ' + totals.total.toLocaleString('fa-IR'));
    return quote;
  },
  async setStatus(id, status) {
    if (this.STATUSES.indexOf(status) === -1) throw new Error('وضعیت نامعتبر است');
    const q = await DB.get('quotes', id);
    if (!q) throw new Error('پیشنهاد قیمت یافت نشد');
    await Repo.audit('quote', id, 'status', 'status', q.status, status);
    q.status = status;
    return Repo.save('quotes', q);
  },
  async detail(id) {
    const [q, items] = await Promise.all([DB.get('quotes', id), Repo.list('quoteItems', i => i.quoteId === id)]);
    if (!q) throw new Error('پیشنهاد قیمت یافت نشد');
    return { quote: q, items };
  },
  // accepted quote -> order, without re-entering data
  async convertToOrder(id) {
    const d = await this.detail(id);
    const q = d.quote;
    if (q.status !== 'پذیرفته‌شده') throw new Error('فقط پیشنهاد پذیرفته‌شده قابل تبدیل به سفارش است');
    const order = await OrderService.create({
      customerId: q.customerId,
      items: d.items.map(it => ({ productId: it.productId, quantity: it.quantity, discount: it.discount || 0 })),
      taxPercent: q.taxPercent,
      extraDiscount: Math.max(0, num(q.discount) - d.items.reduce((s, it) => s + num(it.discount), 0)),
      notes: 'بر اساس پیشنهاد قیمت ' + q.number,
    });
    await this.setStatus(id, 'پذیرفته‌شده');
    await Repo.audit('quote', id, 'convert_to_order', 'orderId', null, order.id);
    return order;
  },
  async deleteHard(id) {
    const d = await this.detail(id);
    await Repo.audit('quote', id, 'delete', 'number', d.quote.number, null);
    for (const it of d.items) await Repo.remove('quoteItems', it.id);
    await Repo.remove('quotes', id);
    return true;
  },
};
const InventoryService = {
  async history(productId) {
    const rows = await Repo.list('inventoryMoves', m => m.productId === productId);
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  },
  async move(productId, type, quantity, reason, orderId) {
    const p = await DB.get('products', productId);
    if (!p) throw new Error('محصول یافت نشد');
    if (!['in', 'out', 'adjust'].includes(type)) throw new Error('نوع گردش نامعتبر است');
    const q = num(quantity, NaN);
    if (!Number.isFinite(q) || (type !== 'adjust' && q <= 0)) throw new Error('مقدار نامعتبر است');
    const before = num(p.stock);
    let after = before;
    if (type === 'in') after = before + q;
    else if (type === 'out') {
      if (p.trackInventory !== false && after - q < 0) throw new Error('موجودی کافی نیست (موجودی فعلی: ' + before + ')');
      after = before - q;
    } else after = q; // adjust sets absolute value
    p.stock = after;
    await Repo.save('products', p);
    const mv = await Repo.save('inventoryMoves', {
      productId, type, quantity: q, before, after,
      reason: reason || '', orderId: orderId || null, at: nowISO(),
    });
    await Repo.audit('product', productId, 'stock_' + type, 'stock', before, after);
    return mv;
  },
  async movesForOrder(orderId) { return Repo.list('inventoryMoves', m => m.orderId === orderId); },
  async lowStock() { return ProductService.lowStock(); },
};
// wrap existing entry points — additive logging only, rules unchanged
(function wrapStockEntryPoints() {
  const origAdjust = ProductService.adjustStock.bind(ProductService);
  ProductService.adjustStock = async function (id, delta, reason) {
    return InventoryService.move(id, 'adjust', num(delta), reason || 'اصلاح دستی');
  };
  const origCreate = OrderService.create.bind(OrderService);
  OrderService.create = async function (data) {
    const order = await origCreate(data);
    try {
      for (const it of order.items || []) {
        const p = await DB.get('products', it.productId);
        if (p && p.trackInventory) {
          await Repo.save('inventoryMoves', {
            productId: it.productId, type: 'out', quantity: num(it.quantity),
            before: num(p.stock) + num(it.quantity), after: num(p.stock),
            reason: 'خروج با سفارش ' + order.number, orderId: order.id, at: nowISO(),
          });
        }
      }
    } catch (e) { /* history logging must never break order creation */ }
    return order;
  };
})();
const AttachmentService = {
  MAX_SIZE: 4 * 1024 * 1024, // 4MB per file — IndexedDB-safe
  async add(ownerType, ownerId, file) {
    if (!ownerType || !ownerId) throw new Error('مقصد پیوست نامعتبر است');
    if (file.size > this.MAX_SIZE) throw new Error('حجم فایل بیش از ۴ مگابایت است');
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('خواندن فایل ناموفق بود'));
      r.readAsDataURL(file);
    });
    const att = await Repo.save('attachments', { ownerType, ownerId, name: file.name, mime: file.type || 'application/octet-stream', size: file.size, data });
    await Repo.logActivity('note', { customerId: ownerType === 'customer' ? ownerId : null, dealId: ownerType === 'deal' ? ownerId : null, projectId: ownerType === 'project' ? ownerId : null }, 'پیوست اضافه شد: ' + file.name);
    return att;
  },
  async forOwner(ownerType, ownerId) {
    return (await Repo.list('attachments', a => a.ownerType === ownerType && a.ownerId === ownerId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async remove(id) {
    const a = await DB.get('attachments', id);
    if (!a) throw new Error('پیوست یافت نشد');
    await Repo.remove('attachments', id);
    return true;
  },
  open(att) {
    const a = document.createElement('a');
    a.href = att.data;
    a.download = att.name;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};
const SavedFilterService = {
  async list(entityType) { return Repo.list('savedFilters', f => f.entityType === entityType); },
  async save(entityType, name, conditions) {
    if (!V.required(name)) throw new Error('نام فیلتر الزامی است');
    return Repo.save('savedFilters', { entityType, name: name.trim(), conditions });
  },
  async update(id, patch) {
    const f = await DB.get('savedFilters', id);
    if (!f) throw new Error('فیلتر یافت نشد');
    Object.assign(f, patch);
    return Repo.save('savedFilters', f);
  },
  async remove(id) { return Repo.remove('savedFilters', id); },
  async apply(conditions, rows) {
    // conditions: [{field, op, value}] — evaluated on real data only
    const OPS = {
      eq: (a, b) => String(a) === String(b),
      neq: (a, b) => String(a) !== String(b),
      contains: (a, b) => String(a || '').toLowerCase().includes(String(b).toLowerCase()),
      gt: (a, b) => Number(a) > Number(b),
      lt: (a, b) => Number(a) < Number(b),
      days_since_le: (a, b) => { if (!a) return false; const d = Math.floor((Date.now() - new Date(a).getTime()) / 86400000); return d <= Number(b); },
      days_since_ge: (a, b) => { if (!a) return false; const d = Math.floor((Date.now() - new Date(a).getTime()) / 86400000); return d >= Number(b); },
      empty: (a) => a == null || a === '',
      notempty: (a) => a != null && a !== '',
    };
    return rows.filter(r => (conditions || []).every(c => {
      const op = OPS[c.op];
      if (!op) return true;
      return op(r[c.field], c.value);
    }));
  },
};
const SegmentService = {
  async list() { return Repo.list('segments'); },
  async save(name, conditions) {
    if (!V.required(name)) throw new Error('نام Segment الزامی است');
    return Repo.save('segments', { name: name.trim(), conditions });
  },
  async remove(id) { return Repo.remove('segments', id); },
  async evaluate(segment) {
    // segment conditions run over real customers + their aggregates
    const [customers, orders, calls, deals] = await Promise.all([
      Repo.list('customers', c => !c.archived),
      Repo.list('orders', o => o.status !== 'لغو شده' && o.status !== 'cancelled'),
      Repo.list('calls'),
      Repo.list('deals', d => !d.archived && d.status === 'open'),
    ]);
    const spend = {}, callsBy = {}, openDealsBy = {};
    orders.forEach(o => { spend[o.customerId] = (spend[o.customerId] || 0) + num(o.total); });
    calls.forEach(c => { callsBy[c.customerId] = (callsBy[c.customerId] || 0) + 1; });
    deals.forEach(d => { openDealsBy[d.customerId] = (openDealsBy[d.customerId] || 0) + 1; });
    const enriched = customers.map(c => ({
      customer: c,
      totalSpend: spend[c.id] || 0,
      callCount: callsBy[c.id] || 0,
      openDeals: openDealsBy[c.id] || 0,
    }));
    const OPS = SavedFilterService && {
      spend_gt: (r, v) => r.totalSpend > Number(v),
      spend_lt: (r, v) => r.totalSpend < Number(v),
      calls_lt: (r, v) => r.callCount < Number(v),
      calls_gt: (r, v) => r.callCount > Number(v),
      inactive_days_ge: (r, v) => { const la = r.customer.lastActivityAt; if (!la) return true; return Dates.daysSince(la) >= Number(v); },
      has_open_deal: (r, v) => v ? r.openDeals > 0 : true,
    };
    return enriched.filter(r => (segment.conditions || []).every(c => {
      const op = OPS[c.op];
      return op ? op(r, c.value) : true;
    }));
  },
};
const KPIService = {
  async sales() {
    const [leads, deals, orders, stages, activities] = await Promise.all([
      Repo.list('leads'),
      Repo.list('deals', d => !d.archived),
      Repo.list('orders'),
      Repo.list('stages'),
      Repo.list('activities'),
    ]);
    const validOrders = orders.filter(o => o.status !== 'لغو شده' && o.status !== 'cancelled');
    const won = deals.filter(d => d.status === 'won');
    const lost = deals.filter(d => d.status === 'lost');
    const open = deals.filter(d => d.status === 'open');
    const convertedLeads = leads.filter(l => l.customerId || l.dealId);
    const winRate = (won.length + lost.length) ? Math.round(won.length * 100 / (won.length + lost.length)) : 0;
    const convRate = leads.length ? Math.round(convertedLeads.length * 100 / leads.length) : 0;
    // average time from deal creation to win
    let avgDaysToWin = null;
    if (won.length) {
      const sums = won.map(d => Dates.daysSince(d.createdAt));
      avgDaysToWin = Math.round(sums.reduce((a, b) => a + b, 0) / won.length);
    }
    const byStage = {};
    for (const d of open) { if (!byStage[d.stageId]) byStage[d.stageId] = { n: 0, sum: 0 }; byStage[d.stageId].n++; byStage[d.stageId].sum += num(d.value); }
    const stalled = await StaleService.findStalled();
    const openFollowups = await FollowUpService.overdue();
    return {
      leadCount: leads.length,
      dealCount: deals.length,
      conversionRate: convRate,
      winRate,
      openValue: open.reduce((s, d) => s + num(d.value), 0),
      wonValue: won.reduce((s, d) => s + num(d.value), 0),
      lostValue: lost.reduce((s, d) => s + num(d.value), 0),
      salesValue: validOrders.reduce((s, o) => s + num(o.total), 0),
      avgDealValue: won.length ? Math.round(won.reduce((s, d) => s + num(d.value), 0) / won.length) : 0,
      avgDaysToWin,
      openByStage: Object.keys(byStage).map(sid => ({
        name: (stages.find(s => s.id === sid) || {}).name || '—',
        n: byStage[sid].n, sum: byStage[sid].sum,
      })),
      stalledDeals: stalled.deals.length,
      stalledProjects: stalled.projects.length,
      overdueFollowups: openFollowups.length,
      activityCount30d: activities.filter(a => a.createdAt >= new Date(Date.now() - 30 * 86400000).toISOString()).length,
    };
  },
};
// Backup: integrity check before restore (additive — BackupService stays intact)
const BackupValidator = {
  REQUIRED_STORES: ['customers', 'deals', 'orders', 'products'],
  validate(dump) {
    if (!dump || typeof dump !== 'object') throw new Error('فایل پشتیبان نامعتبر است');
    if (!dump.data || typeof dump.data !== 'object') throw new Error('ساختار فایل پشتیبان صحیح نیست');
    const missing = this.REQUIRED_STORES.filter(s => !Array.isArray(dump.data[s]));
    if (missing.length) throw new Error('فایل پشتیبان بخش‌های ضروری را ندارد: ' + missing.join('، '));
    for (const s of Object.keys(dump.data)) {
      if (!Array.isArray(dump.data[s])) throw new Error('بخش «' + s + '» در فایل خراب است');
      for (const row of dump.data[s]) {
        if (!row || typeof row !== 'object' || !row.id) throw new Error('رکورد بدون شناسه در بخش «' + s + '» یافت شد');
      }
    }
    return true;
  },
};