// repo.js — Repository / Data-Access layer (layer 3). UI never touches DB directly.
/* global DB, uid, nowISO, openDB */
const Repo = {
  async list(store, filterFn) {
    const all = await DB.getAll(store);
    return filterFn ? all.filter(filterFn) : all;
  },
  async get(store, id) { return DB.get(store, id); },
  async save(store, obj) {
    const now = nowISO();
    if (!obj.id) { obj.id = uid(); obj.createdAt = now; }
    obj.updatedAt = now;
    await DB.put(store, obj);
    return obj;
  },
  async remove(store, id) { return DB.delete(store, id); },
  async audit(entity, entityId, action, field, oldVal, newVal) {
    await DB.put('audit', { id: uid(), entity, entityId, action, field: field || null, oldVal: oldVal == null ? null : String(oldVal), newVal: newVal == null ? null : String(newVal), at: nowISO() });
  },
  async getAudit(entity, entityId) {
    const rows = await DB.getAll('audit');
    return rows.filter(a => a.entity === entity && a.entityId === entityId).sort((a, b) => b.at.localeCompare(a.at));
  },
  async logActivity(type, refs, note, data) {
    const act = { id: uid(), type, ...refs, note: note || '', data: data || {}, createdAt: nowISO() };
    await DB.put('activities', act);
    for (const key of ['dealId', 'projectId']) {
      if (refs[key]) {
        const store = key === 'dealId' ? 'deals' : 'projects';
        const row = await DB.get(store, refs[key]);
        if (row) { row.lastActivityAt = act.createdAt; await DB.put(store, row); }
      }
    }
    if (refs.customerId) {
      const c = await DB.get('customers', refs.customerId);
      if (c) { c.lastActivityAt = act.createdAt; await DB.put('customers', c); }
    }
    return act;
  },
  async getSettings() {
    let s = await DB.get('settings', 'app');
    if (!s) {
      s = { id: 'app', inactivityDays: 7, currency: 'تومان', lowStockAlerts: true, notificationsEnabled: false, taxDefault: 0, locale: 'fa', defaultPipelineId: null };
      await DB.put('settings', s);
    }
    return s;
  },
  async saveSettings(patch) {
    const s = await this.getSettings();
    Object.assign(s, patch);
    await DB.put('settings', s);
    return s;
  },
  async ensureDefaults() {
    const existing = await DB.getAll('pipelines');
    if (existing.length === 0) {
      const p = await this.save('pipelines', { name: 'فروش', isDefault: true, order: 0 });
      const defs = [
        ['سرنخ', false, false], ['واجد شرایط', false, false], ['پیشنهاد', false, false],
        ['مذاکره', false, false], ['برده شده', true, false], ['باخته', false, true],
      ];
      for (let i = 0; i < defs.length; i++)
        await this.save('stages', { pipelineId: p.id, name: defs[i][0], order: i, isWon: defs[i][1], isLost: defs[i][2] });
      await Repo.saveSettings({ defaultPipelineId: p.id });
    } else {
      const stages = await DB.getAll('stages');
      for (const st of stages) {
        if (st.isWon === undefined && st.isLost === undefined) {
          st.isWon = st.name === 'برده شده';
          st.isLost = st.name === 'باخته';
          await DB.put('stages', st);
        }
      }
    }
    if ((await DB.getAll('statuses')).length === 0) {
      const defs = {
        customers: ['فعال', 'غیرفعال', 'VIP'],
        leads: ['جدید', 'در حال پیگیری', 'تبدیل شده', 'باطل شده'],
        orders: ['ثبت شده', 'پرداخت شده', 'ارسال شده', 'لغو شده'],
      };
      for (const [entityType, names] of Object.entries(defs))
        for (let i = 0; i < names.length; i++)
          await this.save('statuses', { entityType, name: names[i], order: i });
    }
    if ((await DB.getAll('automations')).length === 0) {
      await this.save('automations', { when: 'inventory_low', params: {}, then: 'alert', paramsThen: {}, enabled: true });
      await this.save('automations', { when: 'stalled', params: { days: 7 }, then: 'create_task', paramsThen: { title: 'پیگیری مورد خوابیده' }, enabled: true });
    }
  },
};