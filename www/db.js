// db.js — IndexedDB schema, migrations, low-level access (layer 4: Database)
// STAGE 8: DB_VERSION bumped 1 -> 2. onupgradeneeded creates any store missing
// in the existing DB — existing data is untouched (safe automatic migration).
/* eslint-disable */
const DB_NAME = 'crm_db';
const DB_VERSION = 2;
const SCHEMA = {
  customers: 'id, name, phone, companyId, statusId, archived, createdAt, updatedAt, *tags',
  companies: 'id, name, phone, archived',
  contacts: 'id, customerId, name, phone, email, source, archived',
  leads: 'id, name, phone, statusId, source, customerId, dealId, value, nextFollowUpDate, archived, createdAt',
  deals: 'id, title, customerId, companyId, pipelineId, stageId, value, probability, status, expectedCloseDate, archived, lastActivityAt, createdAt',
  pipelines: 'id, name, isDefault, order',
  stages: 'id, pipelineId, name, order',
  projects: 'id, name, customerId, dealId, pipelineId, stageId, status, startDate, deadline, archived, lastActivityAt, createdAt',
  activities: 'id, type, customerId, leadId, dealId, projectId, note, data, createdAt',
  calls: 'id, customerId, dealId, projectId, phone, direction, result, outcomeProductId, decision, nextCallDate, notes, createdAt',
  tasks: 'id, title, dueDate, dueTime, priority, status, doneAt, refType, refId, notes, createdAt',
  followups: 'id, customerId, refType, refId, title, notes, dueDate, dueTime, priority, status, doneAt, result, createdAt',
  appointments: 'id, customerId, refType, refId, title, datetime, location, status, notes, createdAt',
  products: 'id, name, sku, categoryId, unit, price, trackInventory, stock, minStock, initialStock, description, archived, createdAt',
  categories: 'id, name',
  orders: 'id, number, customerId, status, subtotal, discount, taxPercent, tax, total, notes, createdAt',
  orderItems: 'id, orderId, productId, productNameSnapshot, unitPriceSnapshot, quantity',
  tags: 'id, name',
  customFields: 'id, entityType, label, type, options, order',
  customValues: 'id, entityType, entityId, fieldId, value',
  statuses: 'id, entityType, name, order',
  settings: 'key',
  audit: 'id, entity, entityId, field, oldVal, newVal, action, at',
  workflows: 'id, name, when, params, then, enabled',
  automations: 'id, when, params, then, paramsThen, enabled, lastRunAt',
  notificationsLog: 'id, refType, refId, title, at',
  // ---- STAGE 8 additions (new stores; nothing existing changes) ----
  quotes: 'id, number, customerId, companyId, dealId, issueDate, validUntil, status, subtotal, discount, taxPercent, tax, total, notes, createdAt',
  quoteItems: 'id, quoteId, productId, productNameSnapshot, unitPriceSnapshot, quantity, discount',
  inventoryMoves: 'id, productId, type, quantity, before, after, reason, orderId, at',
  attachments: 'id, ownerType, ownerId, name, mime, size, data, createdAt',
  savedFilters: 'id, entityType, name, conditions, createdAt',
  segments: 'id, name, conditions, createdAt',
};
let _db = null;
function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const [store, idx] of Object.entries(SCHEMA)) {
        if (!db.objectStoreNames.contains(store)) {
          const os = db.createObjectStore(store, { keyPath: 'id' });
          idx.split(',').map(s => s.trim()).filter(s => s && s !== 'id').forEach(i => {
            const multi = i.startsWith('*');
            const name = multi ? i.slice(1) : i;
            os.createIndex(name, name, { unique: false, multiEntry: multi });
          });
        }
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error || new Error('DB_OPEN_FAILED'));
  });
}
function tx(store, mode = 'readonly') { return openDB().then(db => db.transaction(store, mode).objectStore(store)); }
function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('DB_ERROR'));
  });
}
const DB = {
  async getAll(store) { const os = await tx(store); return wrap(os.getAll()); },
  async get(store, id) { const os = await tx(store); return wrap(os.get(id)); },
  async put(store, obj) { const os = await tx(store, 'readwrite'); return wrap(os.put(obj)); },
  async delete(store, id) { const os = await tx(store, 'readwrite'); return wrap(os.delete(id)); },
  async clear(store) { const os = await tx(store, 'readwrite'); return wrap(os.clear()); },
  async byIndex(store, index, value) { const os = await tx(store); return wrap(os.index(index).getAll(value)); },
  async count(store) { const os = await tx(store); return wrap(os.count()); },
};
function uid(prefix = '') {
  const t = Date.now().toString(36).padStart(9, '0');
  const r = Math.random().toString(36).slice(2, 10);
  return prefix + t + r;
}
function nowISO() { return new Date().toISOString(); }