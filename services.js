// services.js — Business logic layer (layer 2). All domain rules live here, UI-independent.
// BUGFIX: NotifService.requestPermission now uses CRMNative.notifRequest()
// (backed by @capacitor/local-notifications) on Android first; the Web
// Notification API path remains only for browsers. No other change.
/* global Repo, DB, uid, nowISO, CRMNative */
const V = {
  required(v) { return v != null && String(v).trim() !== ''; },
  phone(v) { return v == null || v === '' || /^[0-9+\-\s()]{5,20}$/.test(String(v).trim()); },
  email(v) { return v == null || v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)); },
  number(v, min = 0) { const n = Number(v); return Number.isFinite(n) && n >= min; },
  date(v) { return v == null || v === '' || !isNaN(Date.parse(v)); },
};
function normalizePhone(v) {
  if (v == null) return '';
  let s = String(v).trim();
  const plus = s.startsWith('+');
  s = s.replace(/\D/g, '');
  return (plus ? '+' : '') + s;
}
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}
const Money = {
  line(qty, unitPrice, discount) { return Math.round(num(qty) * num(unitPrice) - num(discount)); },
  orderTotals(items, taxPercent, extraDiscount) {
    taxPercent = num(taxPercent); extraDiscount = num(extraDiscount);
    const subtotal = (items || []).reduce((s, i) => {
      const unit = num(i.unitPriceSnapshot !== undefined && i.unitPriceSnapshot !== null ? i.unitPriceSnapshot : i.unitPrice);
      return s + Math.round(num(i.quantity) * unit);
    }, 0);
    const itemDiscounts = (items || []).reduce((s, i) => s + num(i.discount), 0);
    const base = subtotal - itemDiscounts - extraDiscount;
    const tax = Math.round(base * taxPercent / 100);
    return { subtotal, discount: itemDiscounts + extraDiscount, tax, total: base + tax };
  },
};
// BUGFIX (timezone date-shift): todayStr()/addDays() used to build the date
// string from toISOString(), which is UTC. For any user ahead of UTC (e.g.
// Iran, UTC+3:30) that shifts "today" back a day for every moment between
// local midnight and UTC midnight — tasks/follow-ups due "today" silently
// disappear from Today lists, the automation stall-check dedup key rolls
// over at the wrong instant, and new records default to yesterday's date.
// Fixed to read the device's local Y/M/D instead of the UTC ones.
function localDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const Dates = {
  todayStr() { return localDateStr(new Date()); },
  isToday(iso) { return !!iso && iso.slice(0, 10) === this.todayStr(); },
  isOverdue(iso) { return !!iso && iso.slice(0, 10) < this.todayStr(); },
  addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return localDateStr(d); },
  daysSince(iso) { if (!iso) return null; return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); },
};
const SYSTEM_ACTIVITY_TYPES = ['customer_created', 'customer_updated', 'lead_created', 'lead_updated', 'lead_converted', 'convert_lead', 'deal_created', 'deal_stage', 'project_created', 'call', 'followup_created', 'followup_done', 'task_created', 'task_done', 'order', 'appointment'];
const StaleService = {
  CLOSED_STATUSES: ['completed', 'cancelled', 'lost', 'won'],
  isStalled(row, inactivityDays) {
    if (this.CLOSED_STATUSES.indexOf(row.status) !== -1) return false;
    const last = row.lastActivityAt || row.createdAt || row.updatedAt;
    const d = Dates.daysSince(last);
    return d != null && d >= inactivityDays;
  },
  async findStalled() {
    const s = await Repo.getSettings();
    const [deals, projects] = await Promise.all([
      Repo.list('deals', d => !d.archived),
      Repo.list('projects', p => !p.archived),
    ]);
    return {
      deals: deals.filter(d => this.isStalled(d, s.inactivityDays)),
      projects: projects.filter(p => this.isStalled(p, s.inactivityDays)),
    };
  },
};
const SearchService = {
  async global(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return {};
    const [customers, companies, leads, deals, projects, products, orders] = await Promise.all([
      Repo.list('customers', c => !c.archived),
      Repo.list('companies', c => !c.archived),
      Repo.list('leads', l => !l.archived),
      Repo.list('deals', d => !d.archived),
      Repo.list('projects', p => !p.archived),
      Repo.list('products', p => !p.archived),
      Repo.list('orders'),
    ]);
    const m = function () {
      for (let i = 0; i < arguments.length; i++) {
        const f = arguments[i];
        if (f && String(f).toLowerCase().includes(q)) return true;
      }
      return false;
    };
    return {
      customers: customers.filter(c => m(c.name, c.phone, c.email)),
      companies: companies.filter(c => m(c.name, c.phone)),
      leads: leads.filter(l => m(l.name, l.phone, l.company)),
      deals: deals.filter(d => m(d.title)),
      projects: projects.filter(p => m(p.name)),
      products: products.filter(p => m(p.name, p.sku)),
      orders: orders.filter(o => m(o.number, o.notes)),
    };
  },
};
async function statusIdByName(entityType, name) {
  const st = await Repo.list('statuses', s => s.entityType === entityType && s.name === name);
  return st.length ? st[0].id : null;
}
const CustomerService = {
  async create(data) {
    if (!V.required(data.name)) throw new Error('نام مشتری الزامی است');
    if (!V.phone(data.phone)) throw new Error('شماره تلفن نامعتبر است');
    if (!V.email(data.email)) throw new Error('ایمیل نامعتبر است');
    if (data.phone) {
      const dups = await Repo.list('customers', c => !c.archived && normalizePhone(c.phone) === normalizePhone(data.phone));
      if (dups.length) throw new Error('مشتری با این شماره از قبل موجود است: ' + dups[0].name);
    }
    const c = await Repo.save('customers', Object.assign({ statusId: data.statusId || null, tags: [] }, data));
    await Repo.audit('customer', c.id, 'create');
    await Repo.logActivity('customer_created', { customerId: c.id }, 'مشتری ایجاد شد');
    return c;
  },
  async update(id, patch) {
    const c = await DB.get('customers', id);
    if (!c) throw new Error('مشتری یافت نشد');
    if (!V.phone(patch.phone)) throw new Error('شماره تلفن نامعتبر است');
    if (!V.email(patch.email)) throw new Error('ایمیل نامعتبر است');
    if (patch.phone) {
      const norm = normalizePhone(patch.phone);
      const dups = await Repo.list('customers', x => x.id !== id && !x.archived && normalizePhone(x.phone) === norm);
      if (dups.length) throw new Error('این شماره به مشتری دیگری تعلق دارد: ' + dups[0].name);
    }
    for (const k of Object.keys(patch)) {
      if (String(c[k]) !== String(patch[k])) await Repo.audit('customer', id, 'update', k, c[k], patch[k]);
    }
    Object.assign(c, patch);
    const saved = await Repo.save('customers', c);
    await Repo.logActivity('customer_updated', { customerId: id }, 'اطلاعات مشتری ویرایش شد');
    return saved;
  },
  async archive(id, archived) {
    const c = await DB.get('customers', id);
    if (!c) throw new Error('مشتری یافت نشد');
    await Repo.audit('customer', id, archived ? 'archive' : 'unarchive');
    c.archived = !!archived;
    return Repo.save('customers', c);
  },
  async deleteHard(id) {
    const checks = [
      ['سفارش', 'orders', o => o.customerId === id],
      ['فرصت فروش', 'deals', d => d.customerId === id],
      ['پروژه', 'projects', p => p.customerId === id],
      ['سرنخ فروش', 'leads', l => l.customerId === id],
      ['تماس', 'calls', c => c.customerId === id],
      ['پیگیری', 'followups', f => f.customerId === id],
      ['قرار', 'appointments', a => a.customerId === id],
      ['مخاطب', 'contacts', c => c.customerId === id],
      ['کار', 'tasks', t => t.refType === 'customer' && t.refId === id],
      ['فعالیت دستی', 'activities', a => a.customerId === id && SYSTEM_ACTIVITY_TYPES.indexOf(a.type) === -1],
    ];
    const blockers = [];
    for (const [label, store, fn] of checks) {
      const n = (await Repo.list(store, fn)).length;
      if (n > 0) blockers.push(label + ' (' + n + ')');
    }
    if (blockers.length) throw new Error('حذف دائمی به دلیل وجود رکوردهای وابسته مجاز نیست: ' + blockers.join('، ') + '. از آرشیو استفاده کنید.');
    const c = await DB.get('customers', id);
    if (!c) throw new Error('مشتری یافت نشد');
    await Repo.audit('customer', id, 'delete', 'name', c.name, null);
    const cvs = await Repo.list('customValues', v => v.entityType === 'customer' && v.entityId === id);
    for (const cv of cvs) await Repo.remove('customValues', cv.id);
    await Repo.remove('customers', id);
    const acts = await Repo.list('activities', a => a.customerId === id);
    for (const a of acts) await Repo.remove('activities', a.id);
    return true;
  },
  async convertToLead(customerId, leadData) {
    const c = await DB.get('customers', customerId);
    if (!c) throw new Error('مشتری یافت نشد');
    const lead = await LeadService.create(Object.assign({ name: c.name, phone: c.phone, company: '', customerId: customerId }, leadData, { customerId: customerId }));
    await Repo.logActivity('convert_lead', { customerId: customerId, leadId: lead.id }, 'مشتری به سرنخ فروش تبدیل شد');
    return lead;
  },
  async detail(id) {
    const results = await Promise.all([
      DB.get('customers', id),
      Repo.list('activities', a => a.customerId === id),
      Repo.list('calls', c => c.customerId === id),
      Repo.list('tasks', t => t.refType === 'customer' && t.refId === id),
      Repo.list('followups', f => f.customerId === id),
      Repo.list('deals', d => d.customerId === id),
      Repo.list('projects', p => p.customerId === id),
      Repo.list('leads', l => l.customerId === id),
      Repo.list('orders', o => o.customerId === id),
      Repo.list('appointments', a => a.customerId === id),
      Repo.getAudit('customer', id),
      Repo.list('tags'),
      Repo.list('customValues', v => v.entityType === 'customer' && v.entityId === id),
      Repo.list('contacts', ct => ct.customerId === id),
    ]);
    const customer = results[0];
    if (!customer) throw new Error('مشتری یافت نشد');
    const orders = results[8];
    const orderItems = [];
    for (const o of orders) {
      const its = await Repo.list('orderItems', i => i.orderId === o.id);
      for (const it of its) orderItems.push(it);
    }
    return {
      customer, activities: results[1].slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      calls: results[2], tasks: results[3], followups: results[4], deals: results[5], projects: results[6],
      leads: results[7], orders, orderItems, appointments: results[9], audit: results[10],
      tags: results[11], customValues: results[12], contacts: results[13],
    };
  },
};
const CompanyService = {
  async create(data) {
    if (!V.required(data.name)) throw new Error('نام شرکت الزامی است');
    if (!V.phone(data.phone)) throw new Error('شماره تلفن نامعتبر است');
    if (!V.email(data.email)) throw new Error('ایمیل نامعتبر است');
    if (data.name) {
      const dups = await Repo.list('companies', c => c.name.trim().toLowerCase() === String(data.name).trim().toLowerCase() && !c.archived);
      if (dups.length) throw new Error('شرکتی با این نام از قبل موجود است');
    }
    const c = await Repo.save('companies', data);
    await Repo.audit('company', c.id, 'create');
    return c;
  },
  async update(id, patch) {
    const c = await DB.get('companies', id);
    if (!c) throw new Error('شرکت یافت نشد');
    for (const k of Object.keys(patch)) {
      if (String(c[k]) !== String(patch[k])) await Repo.audit('company', id, 'update', k, c[k], patch[k]);
    }
    Object.assign(c, patch);
    return Repo.save('companies', c);
  },
  async archive(id, archived) {
    const c = await DB.get('companies', id);
    if (!c) throw new Error('شرکت یافت نشد');
    await Repo.audit('company', id, archived ? 'archive' : 'unarchive');
    c.archived = !!archived;
    return Repo.save('companies', c);
  },
  async deleteHard(id) {
    const [custs, deals] = await Promise.all([
      Repo.list('customers', c => c.companyId === id),
      Repo.list('deals', d => d.companyId === id),
    ]);
    if (custs.length || deals.length) throw new Error('حذف دائمی به دلیل وجود ' + custs.length + ' مشتری و ' + deals.length + ' فرصت فروش وابسته مجاز نیست. از آرشیو استفاده کنید.');
    const c = await DB.get('companies', id);
    if (!c) throw new Error('شرکت یافت نشد');
    await Repo.audit('company', id, 'delete', 'name', c.name, null);
    const cvs = await Repo.list('customValues', v => v.entityType === 'company' && v.entityId === id);
    for (const cv of cvs) await Repo.remove('customValues', cv.id);
    await Repo.remove('companies', id);
    return true;
  },
  async detail(id) {
    const company = await DB.get('companies', id);
    if (!company) throw new Error('شرکت یافت نشد');
    const customers = await Repo.list('customers', c => c.companyId === id && !c.archived);
    const contacts = [];
    for (const cu of customers) {
      const cs = await Repo.list('contacts', x => x.customerId === cu.id);
      for (const ct of cs) contacts.push(ct);
    }
    const deals = await Repo.list('deals', d => d.companyId === id && !d.archived);
    return { company, customers, contacts, deals, audit: await Repo.getAudit('company', id), customValues: await Repo.list('customValues', v => v.entityType === 'company' && v.entityId === id) };
  },
};
const ContactService = {
  async create(data) {
    if (!V.required(data.customerId)) throw new Error('انتخاب مشتری الزامی است');
    if (!V.required(data.name)) throw new Error('نام مخاطب الزامی است');
    if (!V.phone(data.phone)) throw new Error('شماره تلفن نامعتبر است');
    if (!V.email(data.email)) throw new Error('ایمیل نامعتبر است');
    const customer = await DB.get('customers', data.customerId);
    if (!customer) throw new Error('مشتری یافت نشد');
    const c = await Repo.save('contacts', Object.assign({ archived: false }, data));
    await Repo.audit('contact', c.id, 'create');
    await Repo.logActivity('contact_created', { customerId: c.customerId }, 'مخاطب اضافه شد: ' + c.name);
    return c;
  },
  async update(id, patch) {
    const c = await DB.get('contacts', id);
    if (!c) throw new Error('مخاطب یافت نشد');
    if (!V.required(patch.name)) throw new Error('نام مخاطب الزامی است');
    if (!V.phone(patch.phone)) throw new Error('شماره تلفن نامعتبر است');
    if (!V.email(patch.email)) throw new Error('ایمیل نامعتبر است');
    for (const k of Object.keys(patch)) {
      if (String(c[k]) !== String(patch[k])) await Repo.audit('contact', id, 'update', k, c[k], patch[k]);
    }
    Object.assign(c, patch);
    return Repo.save('contacts', c);
  },
  async remove(id) {
    const c = await DB.get('contacts', id);
    if (!c) throw new Error('مخاطب یافت نشد');
    await Repo.audit('contact', id, 'delete', 'name', c.name, null);
    await Repo.remove('contacts', id);
    return true;
  },
  async byCustomer(customerId) { return Repo.list('contacts', c => c.customerId === customerId && !c.archived); },
};
const LeadService = {
  async create(data) {
    if (!V.required(data.name)) throw new Error('نام سرنخ فروش الزامی است');
    if (!V.phone(data.phone)) throw new Error('شماره تماس نامعتبر است');
    if (data.phone) {
      const norm = normalizePhone(data.phone);
      const dups = await Repo.list('leads', l => !l.archived && normalizePhone(l.phone) === norm);
      if (dups.length) throw new Error('سرنخ فروشی با این شماره از قبل موجود است: ' + dups[0].name);
    }
    const lead = await Repo.save('leads', Object.assign({ statusId: null, tags: [] }, data));
    await Repo.audit('lead', lead.id, 'create');
    await Repo.logActivity('lead_created', { leadId: lead.id, customerId: lead.customerId }, 'سرنخ فروش ایجاد شد');
    return lead;
  },
  async update(id, patch) {
    const l = await DB.get('leads', id);
    if (!l) throw new Error('سرنخ فروش یافت نشد');
    if (!V.phone(patch.phone)) throw new Error('شماره تماس نامعتبر است');
    if (patch.phone) {
      const norm = normalizePhone(patch.phone);
      const dups = await Repo.list('leads', x => x.id !== id && !x.archived && normalizePhone(x.phone) === norm);
      if (dups.length) throw new Error('این شماره به سرنخ فروش دیگری تعلق دارد: ' + dups[0].name);
    }
    Object.assign(l, patch);
    const saved = await Repo.save('leads', l);
    await Repo.logActivity('lead_updated', { leadId: id, customerId: l.customerId }, 'سرنخ فروش ویرایش شد');
    return saved;
  },
  async archive(id, archived) {
    await Repo.audit('lead', id, archived ? 'archive' : 'unarchive');
    const l = await DB.get('leads', id);
    if (!l) throw new Error('سرنخ فروش یافت نشد');
    l.archived = !!archived;
    return Repo.save('leads', l);
  },
  async deleteHard(id) {
    const l = await DB.get('leads', id);
    if (!l) throw new Error('سرنخ فروش یافت نشد');
    if (l.customerId || l.dealId) throw new Error('این سرنخ فروش تبدیل شده و به مشتری/فرصت فروش متصل است؛ حذف دائمی مجاز نیست. از آرشیو استفاده کنید.');
    await Repo.audit('lead', id, 'delete', 'name', l.name, null);
    const cvs = await Repo.list('customValues', v => v.entityType === 'lead' && v.entityId === id);
    for (const cv of cvs) await Repo.remove('customValues', cv.id);
    await Repo.remove('leads', id);
    return true;
  },
  async convert(leadId, opts) {
    opts = opts || {};
    const l = await DB.get('leads', leadId);
    if (!l) throw new Error('سرنخ فروش یافت نشد');
    let customer = l.customerId ? await DB.get('customers', l.customerId) : null;
    if (!customer) customer = await CustomerService.create({ name: l.name, phone: l.phone, email: l.email });
    let deal = null;
    if (opts.createDeal) {
      deal = await DealService.create({ title: l.company || l.name, customerId: customer.id, value: l.value || 0, stageId: opts.dealStageId || null });
    }
    await this.update(leadId, { customerId: customer.id, dealId: deal ? deal.id : (l.dealId || null), statusId: await statusIdByName('leads', 'تبدیل شده') });
    await Repo.logActivity('lead_converted', { leadId, customerId: customer.id, dealId: deal ? deal.id : null }, 'سرنخ فروش تبدیل شد');
    return { customer, deal };
  },
};
const DealService = {
  async create(data) {
    if (!V.required(data.title)) throw new Error('عنوان فرصت فروش الزامی است');
    if (data.value != null && !V.number(data.value)) throw new Error('ارزش نامعتبر است');
    const settings = await Repo.getSettings();
    let status = 'open', probability = 0;
    if (data.stageId) {
      const st = await DB.get('stages', data.stageId);
      if (st) {
        if (st.isWon) { status = 'won'; probability = 100; }
        else if (st.isLost) { status = 'lost'; probability = 0; }
      }
    }
    const deal = await Repo.save('deals', Object.assign({ status, probability, pipelineId: settings.defaultPipelineId }, data));
    await Repo.audit('deal', deal.id, 'create');
    await Repo.logActivity('deal_created', { dealId: deal.id, customerId: deal.customerId }, 'فرصت فروش ایجاد شد');
    return deal;
  },
  async changeStage(dealId, stageId) {
    const d = await DB.get('deals', dealId);
    if (!d) throw new Error('فرصت فروش یافت نشد');
    const old = d.stageId;
    d.stageId = stageId;
    const stage = await DB.get('stages', stageId);
    if (stage) {
      if (stage.isWon) { d.status = 'won'; d.probability = 100; }
      else if (stage.isLost) { d.status = 'lost'; d.probability = 0; }
      else d.status = 'open';
    }
    const saved = await Repo.save('deals', d);
    await Repo.audit('deal', dealId, 'stage_change', 'stageId', old, stageId);
    await Repo.logActivity('deal_stage', { dealId, customerId: d.customerId }, 'مرحله فرصت فروش تغییر کرد');
    return saved;
  },
  async update(id, patch) {
    const d = await DB.get('deals', id);
    if (!d) throw new Error('فرصت فروش یافت نشد');
    if (patch.value != null && !V.number(patch.value)) throw new Error('ارزش نامعتبر است');
    for (const k of Object.keys(patch)) {
      if (String(d[k]) !== String(patch[k])) await Repo.audit('deal', id, 'update', k, d[k], patch[k]);
    }
    Object.assign(d, patch);
    return Repo.save('deals', d);
  },
  async archive(id, archived) {
    await Repo.audit('deal', id, archived ? 'archive' : 'unarchive');
    const d = await DB.get('deals', id);
    if (!d) throw new Error('فرصت فروش یافت نشد');
    d.archived = !!archived;
    return Repo.save('deals', d);
  },
  async deleteHard(id) {
    const checks = [
      ['تماس', 'calls', c => c.dealId === id],
      ['پیگیری', 'followups', f => f.refType === 'deal' && f.refId === id],
      ['کار', 'tasks', t => t.refType === 'deal' && t.refId === id],
      ['پروژه مرتبط', 'projects', p => p.dealId === id],
      ['سرنخ مرتبط', 'leads', l => l.dealId === id],
      ['فعالیت دستی', 'activities', a => a.dealId === id && SYSTEM_ACTIVITY_TYPES.indexOf(a.type) === -1],
    ];
    const blockers = [];
    for (const [label, store, fn] of checks) {
      const n = (await Repo.list(store, fn)).length;
      if (n > 0) blockers.push(label + ' (' + n + ')');
    }
    if (blockers.length) throw new Error('حذف دائمی به دلیل وجود: ' + blockers.join('، ') + ' مجاز نیست. از آرشیو استفاده کنید.');
    const d = await DB.get('deals', id);
    if (!d) throw new Error('فرصت فروش یافت نشد');
    await Repo.audit('deal', id, 'delete', 'title', d.title, null);
    const cvs = await Repo.list('customValues', v => v.entityType === 'deal' && v.entityId === id);
    for (const cv of cvs) await Repo.remove('customValues', cv.id);
    await Repo.remove('deals', id);
    const acts = await Repo.list('activities', a => a.dealId === id);
    for (const a of acts) await Repo.remove('activities', a.id);
    return true;
  },
  async detail(id) {
    const results = await Promise.all([
      DB.get('deals', id),
      Repo.list('activities', a => a.dealId === id),
      Repo.list('calls', c => c.dealId === id),
      Repo.list('tasks', t => t.refType === 'deal' && t.refId === id),
      Repo.list('followups', f => f.refType === 'deal' && f.refId === id),
    ]);
    if (!results[0]) throw new Error('فرصت فروش یافت نشد');
    return { deal: results[0], activities: results[1].slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), calls: results[2], tasks: results[3], followups: results[4] };
  },
};
const ProjectService = {
  async create(data) {
    if (!V.required(data.name)) throw new Error('نام پروژه الزامی است');
    if (data.deadline && !V.date(data.deadline)) throw new Error('تاریخ ددلاین نامعتبر است');
    const p = await Repo.save('projects', Object.assign({ status: 'not_started' }, data));
    await Repo.audit('project', p.id, 'create');
    await Repo.logActivity('project_created', { projectId: p.id, customerId: p.customerId }, 'پروژه ایجاد شد');
    return p;
  },
  async update(id, patch) {
    const p = await DB.get('projects', id);
    if (!p) throw new Error('پروژه یافت نشد');
    if (patch.deadline && !V.date(patch.deadline)) throw new Error('تاریخ ددلاین نامعتبر است');
    if (patch.status && patch.status !== p.status) await Repo.audit('project', id, 'status', 'status', p.status, patch.status);
    for (const k of Object.keys(patch)) {
      if (k !== 'status' && String(p[k]) !== String(patch[k])) await Repo.audit('project', id, 'update', k, p[k], patch[k]);
    }
    Object.assign(p, patch);
    return Repo.save('projects', p);
  },
  async archive(id, archived) {
    await Repo.audit('project', id, archived ? 'archive' : 'unarchive');
    const p = await DB.get('projects', id);
    if (!p) throw new Error('پروژه یافت نشد');
    p.archived = !!archived;
    return Repo.save('projects', p);
  },
  async deleteHard(id) {
    const checks = [
      ['تماس', 'calls', c => c.projectId === id],
      ['پیگیری', 'followups', f => f.refType === 'project' && f.refId === id],
      ['کار', 'tasks', t => t.refType === 'project' && t.refId === id],
      ['فعالیت دستی', 'activities', a => a.projectId === id && SYSTEM_ACTIVITY_TYPES.indexOf(a.type) === -1],
    ];
    const blockers = [];
    for (const [label, store, fn] of checks) {
      const n = (await Repo.list(store, fn)).length;
      if (n > 0) blockers.push(label + ' (' + n + ')');
    }
    if (blockers.length) throw new Error('حذف دائمی به دلیل وجود: ' + blockers.join('، ') + ' مجاز نیست. از آرشیو استفاده کنید.');
    const p = await DB.get('projects', id);
    if (!p) throw new Error('پروژه یافت نشد');
    await Repo.audit('project', id, 'delete', 'name', p.name, null);
    const cvs = await Repo.list('customValues', v => v.entityType === 'project' && v.entityId === id);
    for (const cv of cvs) await Repo.remove('customValues', cv.id);
    await Repo.remove('projects', id);
    const acts = await Repo.list('activities', a => a.projectId === id);
    for (const a of acts) await Repo.remove('activities', a.id);
    return true;
  },
  async detail(id) {
    const results = await Promise.all([
      DB.get('projects', id),
      Repo.list('activities', a => a.projectId === id),
      Repo.list('tasks', t => t.refType === 'project' && t.refId === id),
      Repo.list('calls', c => c.projectId === id),
      Repo.list('followups', f => f.refType === 'project' && f.refId === id),
    ]);
    if (!results[0]) throw new Error('پروژه یافت نشد');
    return { project: results[0], activities: results[1].slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), tasks: results[2], calls: results[3], followups: results[4] };
  },
};
const PipelineService = {
  async createPipeline(name) {
    if (!V.required(name)) throw new Error('نام فرایند فروش الزامی است');
    return Repo.save('pipelines', { name, isDefault: false, order: Date.now() });
  },
  async addStage(pipelineId, name, isWon, isLost) {
    if (!V.required(name)) throw new Error('نام مرحله الزامی است');
    const stages = await Repo.list('stages', s => s.pipelineId === pipelineId);
    return Repo.save('stages', { pipelineId, name, order: stages.length, isWon: !!isWon, isLost: !!isLost });
  },
  async removeStage(id) {
    const usedDeals = await Repo.list('deals', d => d.stageId === id);
    const usedProjects = await Repo.list('projects', p => p.stageId === id);
    if (usedDeals.length || usedProjects.length) throw new Error('این مرحله در حال استفاده است و حذف نمی‌شود');
    return Repo.remove('stages', id);
  },
  async setDefault(id) {
    const all = await DB.getAll('pipelines');
    for (const p of all) { p.isDefault = p.id === id; await DB.put('pipelines', p); }
    await Repo.saveSettings({ defaultPipelineId: id });
  },
  async setStageKind(stageId, kind) {
    const st = await DB.get('stages', stageId);
    if (!st) throw new Error('مرحله یافت نشد');
    const oldKind = st.isWon ? 'won' : st.isLost ? 'lost' : 'normal';
    st.isWon = kind === 'won';
    st.isLost = kind === 'lost';
    await Repo.audit('stage', stageId, 'kind', 'kind', oldKind, kind);
    return Repo.save('stages', st);
  },
};
const CallService = {
  RESULTS: ['خرید می‌کند', 'فعلاً خرید نمی‌کند', 'نیاز به پیگیری دارد', 'علاقه‌مند است', 'پاسخ نداد', 'شماره اشتباه است', 'خرید انجام شد', 'منصرف شد'],
  async log(data) {
    if (!V.required(data.customerId)) throw new Error('انتخاب مشتری الزامی است');
    if (!V.phone(data.phone)) throw new Error('شماره تماس نامعتبر است');
    if (data.nextCallDate && !V.date(data.nextCallDate)) throw new Error('تاریخ تماس بعدی نامعتبر است');
    const call = await Repo.save('calls', data);
    await Repo.logActivity('call', { customerId: data.customerId, dealId: data.dealId || null, projectId: data.projectId || null },
      'تماس: ' + (data.result || '') + (data.notes ? ' — ' + data.notes : ''), { result: data.result });
    if (data.nextCallDate) {
      await FollowUpService.create({
        customerId: data.customerId, refType: 'call', refId: call.id,
        title: 'تماس بعدی', notes: 'بر اساس نتیجه تماس', dueDate: data.nextCallDate, priority: 'normal',
      });
    }
    return call;
  },
};
const FollowUpService = {
  async create(data) {
    if (!V.required(data.customerId)) throw new Error('انتخاب مشتری الزامی است');
    if (!V.required(data.dueDate)) throw new Error('تاریخ پیگیری الزامی است');
    const f = await Repo.save('followups', Object.assign({ status: 'open', priority: 'normal' }, data));
    await Repo.logActivity('followup_created', { customerId: f.customerId, dealId: f.refType === 'deal' ? f.refId : null, projectId: f.refType === 'project' ? f.refId : null }, 'پیگیری ثبت شد: ' + f.title, { dueDate: f.dueDate });
    NotifService.scheduleFor(f);
    return f;
  },
  async complete(id, result) {
    const f = await DB.get('followups', id);
    if (!f) throw new Error('پیگیری یافت نشد');
    f.status = 'done'; f.doneAt = nowISO(); f.result = result || '';
    await Repo.save('followups', f);
    await Repo.logActivity('followup_done', { customerId: f.customerId }, 'پیگیری انجام شد: ' + f.title);
    return f;
  },
  async snooze(id, days) {
    const f = await DB.get('followups', id);
    if (!f) throw new Error('پیگیری یافت نشد');
    f.dueDate = Dates.addDays(days || 1);
    f.status = 'open';
    await Repo.save('followups', f);
    NotifService.scheduleFor(f);
    return f;
  },
  async cancel(id) {
    const f = await DB.get('followups', id);
    if (!f) throw new Error('پیگیری یافت نشد');
    f.status = 'cancelled';
    return Repo.save('followups', f);
  },
  async today() { return Repo.list('followups', f => f.status === 'open' && Dates.isToday(f.dueDate)); },
  async overdue() { return Repo.list('followups', f => f.status === 'open' && Dates.isOverdue(f.dueDate)); },
};
const TaskService = {
  async create(data) {
    if (!V.required(data.title)) throw new Error('عنوان کار الزامی است');
    if (data.dueDate && !V.date(data.dueDate)) throw new Error('تاریخ نامعتبر است');
    const t = await Repo.save('tasks', Object.assign({ status: 'open', priority: 'normal' }, data));
    await Repo.logActivity('task_created', {
      customerId: t.refType === 'customer' ? t.refId : null,
      dealId: t.refType === 'deal' ? t.refId : null,
      projectId: t.refType === 'project' ? t.refId : null,
    }, 'کار ایجاد شد: ' + t.title);
    NotifService.scheduleFor(t);
    return t;
  },
  async toggle(id) {
    const t = await DB.get('tasks', id);
    if (!t) throw new Error('کار یافت نشد');
    t.status = t.status === 'done' ? 'open' : 'done';
    t.doneAt = t.status === 'done' ? nowISO() : null;
    await Repo.save('tasks', t);
    if (t.status === 'done') {
      await Repo.logActivity('task_done', {
        customerId: t.refType === 'customer' ? t.refId : null,
        dealId: t.refType === 'deal' ? t.refId : null,
        projectId: t.refType === 'project' ? t.refId : null,
      }, 'کار انجام شد: ' + t.title);
    }
    return t;
  },
  async update(id, patch) {
    const t = await DB.get('tasks', id);
    if (!t) throw new Error('کار یافت نشد');
    if (patch.title !== undefined && !V.required(patch.title)) throw new Error('عنوان کار الزامی است');
    if (patch.dueDate && !V.date(patch.dueDate)) throw new Error('تاریخ نامعتبر است');
    Object.assign(t, patch);
    return Repo.save('tasks', t);
  },
  async remove(id) { return Repo.remove('tasks', id); },
  async today() { return Repo.list('tasks', t => t.status !== 'done' && t.dueDate && Dates.isToday(t.dueDate)); },
  async overdue() { return Repo.list('tasks', t => t.status !== 'done' && t.dueDate && Dates.isOverdue(t.dueDate)); },
};
const AppointmentService = {
  async create(data) {
    if (!V.required(data.customerId)) throw new Error('انتخاب مشتری الزامی است');
    if (!V.required(data.datetime)) throw new Error('تاریخ و ساعت قرار الزامی است');
    const a = await Repo.save('appointments', Object.assign({ status: 'scheduled' }, data));
    await Repo.logActivity('appointment', { customerId: a.customerId, dealId: a.refType === 'deal' ? a.refId : null, projectId: a.refType === 'project' ? a.refId : null }, 'قرار: ' + a.title, { datetime: a.datetime });
    NotifService.scheduleFor(a);
    return a;
  },
  async update(id, patch) {
    const a = await DB.get('appointments', id);
    if (!a) throw new Error('قرار یافت نشد');
    if (patch.datetime !== undefined && !V.required(patch.datetime)) throw new Error('تاریخ و ساعت قرار الزامی است');
    Object.assign(a, patch);
    return Repo.save('appointments', a);
  },
  async cancel(id) {
    const a = await DB.get('appointments', id);
    if (!a) throw new Error('قرار یافت نشد');
    a.status = 'cancelled';
    return Repo.save('appointments', a);
  },
  async today() {
    const all = await Repo.list('appointments', a => a.status !== 'cancelled');
    return all.filter(a => Dates.isToday(a.datetime));
  },
};
const MAX_TIMEOUT = 2147483000;
const NotifService = {
  // FIXED: on Android (Capacitor native) delegate to CRMNative.notifRequest()
  // which requests the real permission via @capacitor/local-notifications;
  // the Web Notification API path is kept only for browsers.
  async requestPermission() {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      if (window.CRMNative && typeof window.CRMNative.notifRequest === 'function') {
        return await window.CRMNative.notifRequest();
      }
      return { ok: false, reason: 'پل اعلان‌های اندروید آماده نیست؛ برنامه را دوباره باز کنید' };
    }
    if (!('Notification' in window)) return { ok: false, reason: 'مرورگر از اعلان پشتیبانی نمی‌کند' };
    let p;
    try { p = await Notification.requestPermission(); } catch (e) { return { ok: false, reason: 'درخواست مجوز ناموفق بود' }; }
    const granted = p === 'granted';
    await Repo.saveSettings({ notificationsEnabled: granted });
    return { ok: granted, reason: granted ? '' : 'مجوز رد شد' };
  },
  scheduleAt(whenTs, title, body, tag) {
    const fire = function () {
      try {
        new Notification(title, { body, tag });
        DB.put('notificationsLog', { id: uid(), refType: tag, title, at: nowISO() });
      } catch (e) { /* permission revoked */ }
    };
    const tick = function () {
      const remaining = whenTs - Date.now();
      if (remaining <= 0) { fire(); return; }
      setTimeout(tick, Math.min(remaining, MAX_TIMEOUT));
    };
    tick();
  },
  async scheduleFor(entity) {
    const s = await Repo.getSettings();
    if (!s.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return null;
    let when = null;
    if (entity.datetime) when = new Date(entity.datetime);
    else if (entity.dueDate) when = new Date(entity.dueDate + (entity.dueTime ? 'T' + entity.dueTime : 'T09:00'));
    if (!when || isNaN(when.getTime()) || when.getTime() <= Date.now()) return null;
    this.scheduleAt(when.getTime(), 'یادآوری CRM', entity.title || 'موعد رسیده است', entity.id);
    return true;
  },
  async fireNow(title, body) {
    const s = await Repo.getSettings();
    if (!s.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return false;
    try { new Notification(title, { body }); return true; } catch (e) { return false; }
  },
};
const ProductService = {
  async create(data) {
    if (!V.required(data.name)) throw new Error('نام محصول الزامی است');
    if (!V.number(data.price)) throw new Error('قیمت نامعتبر است');
    const p = await Repo.save('products', Object.assign({ unit: 'عدد', trackInventory: false, stock: 0, minStock: 0, tags: [] }, data));
    if (p.trackInventory && p.initialStock == null) p.initialStock = p.stock;
    await Repo.save('products', p);
    await Repo.audit('product', p.id, 'create');
    return p;
  },
  async update(id, patch) {
    const p = await DB.get('products', id);
    if (!p) throw new Error('محصول یافت نشد');
    if (patch.price != null && !V.number(patch.price)) throw new Error('قیمت نامعتبر است');
    for (const k of Object.keys(patch)) {
      if (String(p[k]) !== String(patch[k])) await Repo.audit('product', id, 'update', k, p[k], patch[k]);
    }
    Object.assign(p, patch);
    return Repo.save('products', p);
  },
  async archive(id, archived) {
    await Repo.audit('product', id, archived ? 'archive' : 'unarchive');
    const p = await DB.get('products', id);
    if (!p) throw new Error('محصول یافت نشد');
    p.archived = !!archived;
    return Repo.save('products', p);
  },
  async deleteHard(id) {
    const items = await Repo.list('orderItems', i => i.productId === id);
    if (items.length) throw new Error('این محصول در ' + items.length + ' قلم سفارش استفاده شده و حذف دائمی تاریخچه فروش را مخدوش می‌کند. از آرشیو استفاده کنید.');
    const p = await DB.get('products', id);
    if (!p) throw new Error('محصول یافت نشد');
    await Repo.audit('product', id, 'delete', 'name', p.name, null);
    const cvs = await Repo.list('customValues', v => v.entityType === 'product' && v.entityId === id);
    for (const cv of cvs) await Repo.remove('customValues', cv.id);
    await Repo.remove('products', id);
    return true;
  },
  async adjustStock(id, delta, reason) {
    const p = await DB.get('products', id);
    if (!p) throw new Error('محصول یافت نشد');
    if (!p.trackInventory) throw new Error('این محصول موجودی‌گیری نیست');
    const d = num(delta, NaN);
    if (!Number.isFinite(d)) throw new Error('مقدار تغییر موجودی نامعتبر است');
    const next = Number(p.stock) + d;
    if (next < 0) throw new Error('موجودی کافی نیست (موجودی فعلی: ' + p.stock + ')');
    await Repo.audit('product', id, 'stock_change', 'stock', p.stock, next);
    p.stock = next;
    await Repo.save('products', p);
    await AutomationService.runInventoryChecks();
    return p;
  },
  async lowStock() {
    const prods = await Repo.list('products', p => p.trackInventory && !p.archived);
    return prods.filter(p => p.stock <= Number(p.minStock || 0));
  },
};
const OrderService = {
  async create(data) {
    const customerId = data.customerId, items = data.items;
    const taxPercent = num(data.taxPercent), extraDiscount = num(data.extraDiscount);
    if (!V.required(customerId)) throw new Error('انتخاب مشتری الزامی است');
    if (!items || !items.length) throw new Error('حداقل یک قلم سفارش لازم است');
    for (const it of items) {
      if (!it.productId) throw new Error('محصول نامعتبر است');
      if (!V.number(it.quantity, 0.01)) throw new Error('تعداد نامعتبر است');
      const p = await DB.get('products', it.productId);
      if (!p) throw new Error('محصول یافت نشد');
      it.unitPriceSnapshot = p.price;
      it.productNameSnapshot = p.name;
      if (p.trackInventory && num(it.quantity) > num(p.stock)) throw new Error('موجودی «' + p.name + '» کافی نیست (موجودی: ' + p.stock + ')');
    }
    const totals = Money.orderTotals(items, taxPercent, extraDiscount);
    const allOrders = await DB.getAll('orders');
    let maxN = 0;
    for (const o of allOrders) {
      const m = /^ORD-(\d+)$/.exec(o.number || '');
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    const order = await Repo.save('orders', {
      number: 'ORD-' + String(maxN + 1).padStart(4, '0'),
      customerId, items, taxPercent, extraDiscount,
      notes: data.notes || '',
      status: 'ثبت شده', subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, total: totals.total,
    });
    for (const it of items) {
      await Repo.save('orderItems', {
        orderId: order.id, productId: it.productId, productNameSnapshot: it.productNameSnapshot,
        unitPriceSnapshot: it.unitPriceSnapshot, quantity: it.quantity, discount: it.discount || 0,
      });
      const p = await DB.get('products', it.productId);
      if (p && p.trackInventory) {
        const before = p.stock;
        p.stock = num(p.stock) - num(it.quantity);
        await Repo.save('products', p);
        await Repo.audit('product', p.id, 'stock_change', 'stock', before, p.stock);
      }
    }
    await Repo.logActivity('order', { customerId }, 'سفارش ' + order.number + ' ثبت شد — مبلغ: ' + totals.total.toLocaleString('fa-IR'));
    await AutomationService.runInventoryChecks();
    return order;
  },
  async updateStatus(id, status) {
    const o = await DB.get('orders', id);
    if (!o) throw new Error('سفارش یافت نشد');
    await Repo.audit('order', id, 'status', 'status', o.status, status);
    o.status = status;
    return Repo.save('orders', o);
  },
  async detail(id) {
    const results = await Promise.all([DB.get('orders', id), Repo.list('orderItems', i => i.orderId === id)]);
    if (!results[0]) throw new Error('سفارش یافت نشد');
    return { order: results[0], items: results[1] };
  },
};
const CustomFieldService = {
  TYPES: ['text', 'number', 'date', 'boolean', 'select', 'multiselect', 'phone', 'email'],
  ENTITIES: ['customer', 'company', 'lead', 'deal', 'project', 'product'],
  TYPE_LABELS: { text: 'متن', number: 'عدد', date: 'تاریخ', boolean: 'بله/خیر', select: 'انتخابی', multiselect: 'چندانتخابی', phone: 'شماره تلفن', email: 'ایمیل' },
  ENTITY_LABELS: { customer: 'مشتری', company: 'شرکت', lead: 'سرنخ فروش', deal: 'فرصت فروش', project: 'پروژه', product: 'محصول' },
  async create(data) {
    if (!V.required(data.label)) throw new Error('عنوان فیلد الزامی است');
    if (this.TYPES.indexOf(data.type) === -1) throw new Error('نوع فیلد نامعتبر است');
    if (this.ENTITIES.indexOf(data.entityType) === -1) throw new Error('موجودیت نامعتبر است');
    let options = [];
    if (data.type === 'select' || data.type === 'multiselect') {
      options = (data.options || []).filter(o => V.required(o));
      if (!options.length) throw new Error('برای فیلد انتخابی حداقل یک گزینه لازم است');
    }
    const order = (await Repo.list('customFields', f => f.entityType === data.entityType)).length;
    const f = await Repo.save('customFields', { entityType: data.entityType, label: data.label, type: data.type, options, order });
    await Repo.audit('customField', f.id, 'create');
    return f;
  },
  async update(id, patch) {
    const f = await DB.get('customFields', id);
    if (!f) throw new Error('فیلد یافت نشد');
    let options = f.options || [];
    if (patch.type === 'select' || patch.type === 'multiselect') {
      options = (patch.options || f.options || []).filter(o => V.required(o));
      if (!options.length) throw new Error('برای فیلد انتخابی حداقل یک گزینه لازم است');
    }
    Object.assign(f, patch, { options });
    await Repo.audit('customField', id, 'update', 'label', f.label, patch.label || f.label);
    return Repo.save('customFields', f);
  },
  async remove(id) {
    const vals = await Repo.list('customValues', v => v.fieldId === id);
    for (const v of vals) await Repo.remove('customValues', v.id);
    await Repo.audit('customField', id, 'delete');
    return Repo.remove('customFields', id);
  },
  fieldsFor(entityType) { return Repo.list('customFields', f => f.entityType === entityType); },
  async getValuesMap(entityType, entityId) {
    const vals = await Repo.list('customValues', v => v.entityType === entityType && v.entityId === entityId);
    const map = {};
    for (const v of vals) map[v.fieldId] = v.value;
    return map;
  },
  validateValue(field, value) {
    const empty = value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0);
    if (empty) return null;
    switch (field.type) {
      case 'number':
        if (!V.number(value, -Infinity)) throw new Error('مقدار فیلد «' + field.label + '» باید عدد باشد');
        return Number(value);
      case 'date':
        if (!V.date(value)) throw new Error('تاریخ فیلد «' + field.label + '» نامعتبر است');
        return String(value).slice(0, 10);
      case 'boolean': return value === true || value === 'true' || value === 1;
      case 'select':
        if ((field.options || []).indexOf(value) === -1) throw new Error('گزینه فیلد «' + field.label + '» نامعتبر است');
        return value;
      case 'multiselect': {
        const arr = Array.isArray(value) ? value : [value];
        for (const v of arr) if ((field.options || []).indexOf(v) === -1) throw new Error('گزینه فیلد «' + field.label + '» نامعتبر است');
        return arr;
      }
      case 'phone':
        if (!V.phone(value)) throw new Error('شماره فیلد «' + field.label + '» نامعتبر است');
        return String(value).trim();
      case 'email':
        if (!V.email(value)) throw new Error('ایمیل فیلد «' + field.label + '» نامعتبر است');
        return String(value).trim();
      default: return String(value);
    }
  },
  async setValues(entityType, entityId, valuesMap) {
    const fields = await this.fieldsFor(entityType);
    for (const f of fields) {
      if (!(f.id in valuesMap)) continue;
      const validated = this.validateValue(f, valuesMap[f.id]);
      const existing = await Repo.list('customValues', v => v.entityType === entityType && v.entityId === entityId && v.fieldId === f.id);
      if (validated === null) {
        for (const ex of existing) await Repo.remove('customValues', ex.id);
      } else if (existing.length) {
        existing[0].value = validated;
        await Repo.save('customValues', existing[0]);
      } else {
        await Repo.save('customValues', { entityType, entityId, fieldId: f.id, value: validated });
      }
    }
    return true;
  },
};
const AutomationService = {
  async runInventoryChecks() {
    const rules = await Repo.list('automations', a => a.enabled && a.when === 'inventory_low');
    if (!rules.length) return;
    const low = await ProductService.lowStock();
    for (const p of low) {
      const logKey = 'lowstock_' + p.id;
      const already = await Repo.list('notificationsLog', n => n.refType === logKey && Dates.isToday(n.at));
      if (already.length) continue;
      await NotifService.fireNow('هشدار موجودی', 'موجودی «' + p.name + '» کم است: ' + p.stock);
      await DB.put('notificationsLog', { id: uid(), refType: logKey, title: 'موجودی کم: ' + p.name, at: nowISO() });
    }
  },
  _lastStalledRun: 0,
  async runStalledCheck(force) {
    const now = Date.now();
    if (!force && now - this._lastStalledRun < 60000) return;
    this._lastStalledRun = now;
    const rules = await Repo.list('automations', a => a.enabled && a.when === 'stalled');
    if (!rules.length) return;
    const stalled = await StaleService.findStalled();
    const existing = await Repo.list('tasks', t => t.refType === 'automation');
    const title = (rules[0].paramsThen && rules[0].paramsThen.title) || 'پیگیری مورد خوابیده';
    for (const d of stalled.deals) {
      const key = 'stall_deal_' + d.id + '_' + Dates.todayStr();
      if (existing.some(t => t.refId === key)) continue;
      await TaskService.create({ title, refType: 'automation', refId: key, dueDate: Dates.todayStr() });
    }
    for (const p of stalled.projects) {
      const key = 'stall_proj_' + p.id + '_' + Dates.todayStr();
      if (existing.some(t => t.refId === key)) continue;
      await TaskService.create({ title, refType: 'automation', refId: key, dueDate: Dates.todayStr() });
    }
  },
  async setEnabled(id, enabled) {
    const a = await DB.get('automations', id);
    if (!a) throw new Error('قانون خودکارسازی یافت نشد');
    a.enabled = !!enabled;
    await Repo.audit('automation', id, enabled ? 'enable' : 'disable');
    return Repo.save('automations', a);
  },
};
const DashboardService = {
  async today() {
    const s = await Repo.getSettings();
    const convertedId = await statusIdByName('leads', 'تبدیل شده');
    const results = await Promise.all([
      Repo.list('customers', c => !c.archived),
      Repo.list('leads', l => !l.archived && l.statusId !== convertedId),
      Repo.list('deals', d => !d.archived && d.status === 'open'),
      Repo.list('projects', p => !p.archived && ['not_started', 'in_progress', 'on_hold', 'stalled'].indexOf(p.status) !== -1),
      TaskService.today(),
      FollowUpService.today(),
      AppointmentService.today(),
      Repo.list('orders'),
      ProductService.lowStock(),
      StaleService.findStalled(),
      Repo.list('activities'),
    ]);
    return {
      counts: { customers: results[0].length, activeLeads: results[1].length, activeDeals: results[2].length, activeProjects: results[3].length },
      todayTasks: results[4], todayFollowups: results[5], todayAppointments: results[6],
      overdueTasks: await TaskService.overdue(), overdueFollowups: await FollowUpService.overdue(),
      todayCalls: await Repo.list('calls', c => Dates.isToday(c.createdAt)),
      stalledProjects: results[9].projects, stalledDeals: results[9].deals,
      lowStock: results[8], inactivityDays: s.inactivityDays,
      salesTotal: results[7].filter(o => o.status !== 'لغو شده' && o.status !== 'cancelled').reduce((s2, o) => s2 + num(o.total), 0),
      ordersCount: results[7].length,
      recentActivities: results[10].slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15),
    };
  },
};
const CalendarService = {
  async forMonth(year, month) {
    const first = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const last = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
    const results = await Promise.all([
      Repo.list('tasks', t => t.dueDate && t.dueDate >= first && t.dueDate <= last && t.status !== 'done'),
      Repo.list('followups', f => f.dueDate && f.dueDate >= first && f.dueDate <= last && f.status === 'open'),
      Repo.list('appointments', a => a.datetime && a.datetime >= first && a.datetime <= last && a.status !== 'cancelled'),
      Repo.list('projects', p => p.deadline && p.deadline >= first && p.deadline <= last && ['completed', 'cancelled'].indexOf(p.status) === -1),
      Repo.list('calls', c => c.nextCallDate && c.nextCallDate >= first && c.nextCallDate <= last),
    ]);
    const byDay = {};
    const add = function (d, type, title, id) {
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push({ type, title, id });
    };
    results[0].forEach(t => add(t.dueDate, 'task', t.title, t.id));
    results[1].forEach(f => add(f.dueDate, 'followup', f.title, f.id));
    results[2].forEach(a => add(a.datetime.slice(0, 10), 'appointment', a.title, a.id));
    results[3].forEach(p => add(p.deadline, 'deadline', 'ددلاین: ' + p.name, p.id));
    results[4].forEach(c => add(c.nextCallDate, 'call', 'تماس بعدی', c.id));
    return byDay;
  },
};
const BackupService = {
  STORES: ['customers', 'companies', 'contacts', 'leads', 'deals', 'pipelines', 'stages', 'projects', 'activities', 'calls', 'tasks', 'followups', 'appointments', 'products', 'categories', 'orders', 'orderItems', 'tags', 'customFields', 'customValues', 'statuses', 'settings', 'audit', 'workflows', 'automations'],
  async exportJSON() {
    const dump = { version: 1, exportedAt: nowISO(), data: {} };
    for (const st of this.STORES) dump.data[st] = await DB.getAll(st);
    return dump;
  },
  async importJSON(dump, opts) {
    if (!dump || !dump.data) throw new Error('فایل پشتیبان نامعتبر است');
    const skipDuplicates = !opts || opts.skipDuplicates !== false;
    let added = 0, skipped = 0;
    for (const st of Object.keys(dump.data)) {
      if (this.STORES.indexOf(st) === -1) continue;
      for (const row of dump.data[st]) {
        const exists = await DB.get(st, row.id);
        if (exists && skipDuplicates) { skipped++; continue; }
        await DB.put(st, row); added++;
      }
    }
    return { added, skipped };
  },
  async exportCSV(rows, headers) {
    const esc = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    const lines = [headers.join(',')];
    for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(','));
    return '\uFEFF' + lines.join('\n');
  },
};