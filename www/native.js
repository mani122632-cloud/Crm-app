// native.js — native bridges: device contacts, calendar and Android local notifications.
// Contacts / calendar code is unchanged (contacts: in @capacitor-community/contacts v6
// "name" is an OBJECT, so display is read from name.display with a string fallback).
//
// NOTIFICATION ENGINE (hardened revision) — @capacitor/local-notifications only:
//  - permission is a real state machine (granted / prompt / denied / error), never a bare
//    boolean. A blocked ("denied") state is not re-requested (Android shows no dialog for
//    it); the user is told how to enable it from Android settings instead.
//  - the app asks for permission automatically at most once (first launch); afterwards
//    only the Settings button asks.
//  - a reminder is cached as "scheduled" ONLY after the plugin confirmed it, and the
//    plugin's real pending list (getPending) is reconciled on every sync, so a stale
//    cache can never hide a missing alarm and stray alarms of deleted records are removed.
//  - one stable ID per record (collision-safe) => rescheduling replaces, never duplicates.
//  - past times are skipped; near-future times are clamped to a minimum lead.
//  - every plugin call has a timeout + catch; sync runs are serialized and coalesced.
(function () {
  function whenCapacitor(fn) {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) fn();
    else window.addEventListener('load', function () {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) fn();
    });
  }

  function isTimeout(e) { return !!(e && e.code === 'timeout'); }

  // ---------------- notification constants ----------------
  var CHANNEL_ID = 'crm_reminders';
  var CHANNEL_NAME = 'یادآورهای CRM';
  var CHANNEL_DESC = 'یادآورهای CRM (پیگیری، کار، قرار، تماس)';
  var SCHED_CACHE_KEY = 'crm_sched_v1';
  var ASKED_KEY = 'crm_notif_asked_v1';
  var CALL_TIMEOUT_MS = 10000;        // plugin calls that never wait for the user
  var PERMISSION_TIMEOUT_MS = 60000;  // system permission / settings screens wait for the user
  var MIN_LEAD_MS = 3000;             // a reminder due sooner than this is fired this far ahead
  var MAX_SCHEDULED = 300;            // Android caps concurrent alarms per app (500); stay well below
  var KEY_RE = /^(task|followup|appointment|call):/;
  var BLOCKED_MSG = 'اعلان‌ها در اندروید مسدود است؛ از تنظیمات گوشی › برنامه‌ها › CRM › اعلان‌ها آن را فعال کنید';

  function plugin() {
    var P = window.Capacitor && window.Capacitor.Plugins;
    return (P && P.LocalNotifications) || null;
  }

  // Rejects after ms so no caller can wait forever on a native call.
  function withTimeout(promise, ms, label) {
    var timer;
    var guard = new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        var e = new Error('timeout: ' + label);
        e.code = 'timeout';
        reject(e);
      }, ms);
    });
    return Promise.race([Promise.resolve(promise), guard]).then(
      function (v) { clearTimeout(timer); return v; },
      function (e) { clearTimeout(timer); throw e; }
    );
  }

  function NativeNotif() {}

  // ---------------- channel (created once, Persian name) ----------------
  var channelPromise = null;
  NativeNotif.channel = function () {
    if (channelPromise) return channelPromise;
    var LN = plugin();
    if (!LN || typeof LN.createChannel !== 'function') return Promise.resolve(false);
    channelPromise = (async function () {
      try {
        var exists = false;
        try {
          var listed = await withTimeout(LN.listChannels(), CALL_TIMEOUT_MS, 'listChannels');
          exists = !!(listed && listed.channels && listed.channels.some(function (c) {
            return c && c.id === CHANNEL_ID && c.name === CHANNEL_NAME;
          }));
        } catch (e) { /* listing is optional: fall through and (re)create, which is idempotent */ }
        if (!exists) {
          await withTimeout(LN.createChannel({
            id: CHANNEL_ID,
            name: CHANNEL_NAME,
            description: CHANNEL_DESC,
            importance: 4,
            visibility: 1,
            vibration: true,
            lights: true,
          }), CALL_TIMEOUT_MS, 'createChannel');
        }
        return true;
      } catch (e) {
        console.error('notif channel failed', e);
        channelPromise = null; // allow a later retry
        return false;
      }
    })();
    return channelPromise;
  };

  // ---------------- permission ----------------
  // raw: 'granted' | 'prompt' | 'prompt-with-rationale' | 'denied' | 'unsupported' | 'error'
  NativeNotif.rawPermission = async function () {
    var LN = plugin();
    if (!LN || typeof LN.checkPermissions !== 'function') return 'unsupported';
    try {
      var st = await withTimeout(LN.checkPermissions(), CALL_TIMEOUT_MS, 'checkPermissions');
      return (st && st.display) || 'prompt';
    } catch (e) {
      console.error('notif checkPermissions failed', e);
      return 'error';
    }
  };
  function normState(raw) {
    return raw === 'granted' ? 'granted'
      : raw === 'denied' ? 'denied'
      : raw === 'unsupported' ? 'unsupported'
      : raw === 'error' ? 'error' : 'prompt';
  }
  // 'granted' | 'prompt' | 'denied' | 'unsupported' | 'error'
  NativeNotif.status = async function () { return normState(await NativeNotif.rawPermission()); };

  function wasAsked() { try { return localStorage.getItem(ASKED_KEY) === '1'; } catch (e) { return false; } }
  function markAsked() { try { localStorage.setItem(ASKED_KEY, '1'); } catch (e) { /* non-fatal */ } }

  // Asks the system only when it can actually show a dialog. Never throws.
  // returns { ok, status, reason }
  NativeNotif.request = async function () {
    var raw = await NativeNotif.rawPermission();
    if (raw === 'granted') return { ok: true, status: 'granted', reason: '' };
    if (raw === 'unsupported') return { ok: false, status: 'unsupported', reason: 'اعلان‌های اندروید در این محیط در دسترس نیست' };
    if (raw === 'error') return { ok: false, status: 'error', reason: 'بررسی وضعیت اعلان‌ها ناموفق بود؛ دوباره تلاش کنید' };
    // Blocked: Android will not show the dialog again, so asking would silently do nothing.
    if (raw === 'denied') return { ok: false, status: 'denied', reason: BLOCKED_MSG };
    var LN = plugin();
    markAsked();
    try {
      var req = await withTimeout(LN.requestPermissions(), PERMISSION_TIMEOUT_MS, 'requestPermissions');
      var d = req && req.display;
      if (d === 'granted') return { ok: true, status: 'granted', reason: '' };
      if (d === 'denied') return { ok: false, status: 'denied', reason: BLOCKED_MSG };
      return { ok: false, status: 'prompt', reason: 'مجوز اعلان داده نشد؛ در صورت نیاز دوباره فعال‌سازی را بزنید' };
    } catch (e) {
      console.error('notif requestPermissions failed', e);
      var after = await NativeNotif.status();
      if (after === 'granted') return { ok: true, status: 'granted', reason: '' };
      return { ok: false, status: after, reason: e && e.code === 'timeout'
        ? 'پاسخی از پنجره مجوز دریافت نشد؛ دوباره تلاش کنید'
        : 'درخواست مجوز اعلان ناموفق بود' };
    }
  };
  // boolean form kept for older callers
  NativeNotif.permission = async function () { return (await NativeNotif.request()).ok; };

  async function saveEnabled(ok) {
    try { await Repo.saveSettings({ notificationsEnabled: !!ok }); }
    catch (e) { console.error('notif settings save failed', e); }
  }

  // Exact alarms (Android 12+): without them reminders can arrive minutes late in Doze.
  function mapExact(r) {
    var v = r && (r.exact_alarm || r.exactAlarm);
    return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'prompt';
  }
  NativeNotif.exactStatus = async function () {
    var LN = plugin();
    if (!LN || typeof LN.checkExactNotificationSetting !== 'function') return 'unsupported';
    try { return mapExact(await withTimeout(LN.checkExactNotificationSetting(), CALL_TIMEOUT_MS, 'checkExact')); }
    catch (e) { return 'unsupported'; }
  };
  NativeNotif.exactRequest = async function () {
    var LN = plugin();
    if (!LN || typeof LN.changeExactNotificationSetting !== 'function') return 'unsupported';
    try { return mapExact(await withTimeout(LN.changeExactNotificationSetting(), PERMISSION_TIMEOUT_MS, 'changeExact')); }
    catch (e) { return NativeNotif.exactStatus(); }
  };

  // ---------------- ids + cache ----------------
  NativeNotif.idFor = function (key) {
    var h = 5381;
    for (var i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
    return (Math.abs(h) % 2147483647) || 1;
  };

  NativeNotif.cache = function () {
    try {
      var v = JSON.parse(localStorage.getItem(SCHED_CACHE_KEY) || '{}');
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
  };
  NativeNotif.saveCache = function (map) {
    try { localStorage.setItem(SCHED_CACHE_KEY, JSON.stringify(map)); } catch (e) { /* non-fatal */ }
  };

  // ---------------- cancel / schedule (never throw) ----------------
  NativeNotif.cancel = async function (ids) {
    if (!ids || !ids.length) return true;
    var LN = plugin();
    if (!LN) return false;
    try {
      await withTimeout(LN.cancel({ notifications: ids.map(function (id) { return { id: id }; }) }), CALL_TIMEOUT_MS, 'cancel');
      return true;
    } catch (e) {
      console.error('notif cancel failed', e);
      return false;
    }
  };

  // returns the ids the plugin confirmed
  NativeNotif.schedule = async function (items) {
    var confirmed = [];
    if (!items || !items.length) return confirmed;
    var LN = plugin();
    if (!LN) return confirmed;
    var now = Date.now();
    var payload = function (it) {
      return {
        id: it.id,
        title: it.title,
        body: it.body,
        schedule: { at: new Date(Math.max(it.ts, now + MIN_LEAD_MS)), allowWhileIdle: true },
        channelId: CHANNEL_ID,
        extra: { refType: it.refType, refId: it.refId, key: it.key },
      };
    };
    try {
      await withTimeout(LN.schedule({ notifications: items.map(payload) }), CALL_TIMEOUT_MS, 'schedule');
      return items.map(function (it) { return it.id; });
    } catch (batchErr) {
      console.error('notif batch schedule failed, retrying one by one', batchErr);
    }
    // isolate a single bad item; stop early if everything keeps failing (e.g. permission revoked)
    var failsInARow = 0;
    for (var i = 0; i < items.length && failsInARow < 3; i++) {
      try {
        await withTimeout(LN.schedule({ notifications: [payload(items[i])] }), CALL_TIMEOUT_MS, 'schedule-one');
        confirmed.push(items[i].id);
        failsInARow = 0;
      } catch (e) {
        failsInARow++;
        console.error('notif schedule failed for ' + items[i].key, e);
      }
    }
    return confirmed;
  };

  async function getPending() {
    var LN = plugin();
    if (!LN || typeof LN.getPending !== 'function') return null;
    try {
      var r = await withTimeout(LN.getPending(), CALL_TIMEOUT_MS, 'getPending');
      return (r && r.notifications) || [];
    } catch (e) { return null; } // unknown => fall back to the cache alone
  }

  // ---------------- what should be scheduled ----------------
  function localMs(y, mo, d, hh, mi) {
    var dt = new Date(y, mo - 1, d, hh, mi, 0, 0);
    // reject rolled-over dates such as 2026-02-31
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return 0;
    return dt.getTime();
  }
  // 'YYYY-MM-DD' + optional 'HH:mm' => local wall-clock time (09:00 when no time), 0 when invalid
  function parseDateAndTime(dateStr, timeStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
    if (!m) return 0;
    var hh = 9, mi = 0;
    var tm = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || ''));
    if (tm && Number(tm[1]) <= 23 && Number(tm[2]) <= 59) { hh = Number(tm[1]); mi = Number(tm[2]); }
    return localMs(Number(m[1]), Number(m[2]), Number(m[3]), hh, mi);
  }
  // datetime-local values ('YYYY-MM-DDTHH:mm') are wall-clock time in the phone's zone;
  // values carrying an explicit zone (Z / +03:30) are absolute instants.
  function parseDateTime(v) {
    var s = String(v || '').trim();
    if (!s) return 0;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseDateAndTime(s, null);
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s);
    if (m) return localMs(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
    var t = new Date(s).getTime();
    return isNaN(t) ? 0 : t;
  }
  NativeNotif._parseDateAndTime = parseDateAndTime;
  NativeNotif._parseDateTime = parseDateTime;

  // Future reminders only, sorted by time, each with a unique stable numeric id.
  async function remindersFromDB() {
    var r = await Promise.all([
      Repo.list('tasks'),
      Repo.list('followups'),
      Repo.list('appointments'),
      Repo.list('calls'),
    ]);
    var out = [];
    var now = Date.now();
    var add = function (key, ts, refType, refId, title, body) {
      if (ts > now) out.push({ key: key, ts: ts, refType: refType, refId: refId, title: title, body: body });
    };
    r[0].forEach(function (t) {
      if (!t || !t.id || t.status === 'done' || t.status === 'cancelled' || !t.dueDate) return;
      add('task:' + t.id, parseDateAndTime(t.dueDate, t.dueTime), 'task', t.id, 'یادآور کار', t.title || 'موعد کار فرا رسیده است');
    });
    r[1].forEach(function (f) {
      if (!f || !f.id || f.status !== 'open' || !f.dueDate) return;
      add('followup:' + f.id, parseDateAndTime(f.dueDate, f.dueTime), 'followup', f.id, 'یادآور پیگیری', f.title || 'موعد پیگیری فرا رسیده است');
    });
    r[2].forEach(function (a) {
      if (!a || !a.id || a.status === 'cancelled' || a.status === 'done' || a.status === 'completed' || !a.datetime) return;
      add('appointment:' + a.id, parseDateTime(a.datetime), 'appointment', a.id, 'یادآور قرار', a.title || 'قرار نزدیک است');
    });
    r[3].forEach(function (c) {
      if (!c || !c.id || !c.nextCallDate) return;
      add('call:' + c.id, parseDateAndTime(c.nextCallDate, null), 'call', c.id, 'یادآور تماس', 'زمان تماس بعدی رسیده است');
    });
    // ids are assigned in key order so they stay stable; a hash collision moves the later key
    var used = {};
    out.slice().sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; }).forEach(function (o) {
      var id = NativeNotif.idFor(o.key), n = 0;
      while (used[id]) { n++; id = NativeNotif.idFor(o.key + '#' + n); }
      used[id] = true;
      o.id = id;
    });
    out.sort(function (a, b) { return a.ts - b.ts || (a.key < b.key ? -1 : 1); });
    return out;
  }

  // ---------------- sync (serialized, coalesced, reconciled) ----------------
  var syncing = false, syncAgain = false, syncTimer = null, lastSync = null;
  NativeNotif.lastSync = function () { return lastSync; };

  async function syncOnce() {
    var LN = plugin();
    if (!LN) { lastSync = { ok: false, reason: 'plugin', at: Date.now() }; return; }
    var state = await NativeNotif.status();
    var cache = NativeNotif.cache();
    if (state === 'denied' || state === 'prompt') {
      // Nothing can be shown without permission. Drop what we scheduled and forget it, so every
      // reminder is scheduled from scratch the moment permission is granted.
      var known = Object.keys(cache).map(function (k) { return cache[k] && cache[k].id; }).filter(function (x) { return typeof x === 'number'; });
      await NativeNotif.cancel(known);
      NativeNotif.saveCache({});
      lastSync = { ok: false, reason: 'permission:' + state, at: Date.now() };
      return;
    }
    if (state !== 'granted') { lastSync = { ok: false, reason: state, at: Date.now() }; return; }

    var desired = (await remindersFromDB()).slice(0, MAX_SCHEDULED); // throws => nothing is changed
    await NativeNotif.channel();
    var pending = await getPending();
    var pendingById = null;
    if (pending) { pendingById = {}; pending.forEach(function (p) { if (p) pendingById[p.id] = p; }); }

    var want = {}, wantIds = {};
    desired.forEach(function (d) { want[d.key] = d; wantIds[d.id] = true; });

    var toCancel = {}, nextCache = {}, toSchedule = [];
    Object.keys(cache).forEach(function (key) {
      var c = cache[key];
      if (!c || typeof c.id !== 'number') return;
      var w = want[key];
      // record gone / done / cancelled / in the past / moved => cancel; moved ones are re-added below
      if (!w || w.id !== c.id || w.ts !== c.ts) { toCancel[c.id] = true; return; }
      nextCache[key] = c;
    });
    if (pending) pending.forEach(function (p) {
      var k = p && p.extra && p.extra.key;
      // one of ours that the cache does not know (cache lost / out of sync) and nothing wants any more
      if (typeof k === 'string' && KEY_RE.test(k) && !wantIds[p.id]) toCancel[p.id] = true;
    });
    desired.forEach(function (d) {
      var live = pendingById ? !!pendingById[d.id] : true; // pending list unknown => trust the cache
      if (nextCache[d.key] && live) return;
      delete nextCache[d.key];
      toSchedule.push(d);
    });

    var cancelIds = Object.keys(toCancel).map(Number);
    if (pendingById) cancelIds = cancelIds.filter(function (id) { return !!pendingById[id]; }); // already gone => nothing to cancel
    var cancelOk = await NativeNotif.cancel(cancelIds);
    if (!cancelOk) {
      // keep them in the cache so the next sync retries the cancel
      Object.keys(cache).forEach(function (k) {
        var c = cache[k];
        if (c && toCancel[c.id] && !nextCache[k]) nextCache[k] = c;
      });
    }
    var confirmed = await NativeNotif.schedule(toSchedule);
    var confirmedMap = {};
    confirmed.forEach(function (id) { confirmedMap[id] = true; });
    toSchedule.forEach(function (d) { if (confirmedMap[d.id]) nextCache[d.key] = { id: d.id, ts: d.ts }; });
    NativeNotif.saveCache(nextCache);
    lastSync = {
      ok: confirmed.length === toSchedule.length && cancelOk,
      scheduled: confirmed.length,
      failed: toSchedule.length - confirmed.length,
      cancelled: cancelIds.length,
      at: Date.now(),
    };
  }

  NativeNotif.sync = async function () {
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    try {
      var rounds = 0;
      do {
        syncAgain = false;
        try { await syncOnce(); }
        catch (e) { console.error('notif sync failed', e); lastSync = { ok: false, reason: 'error', at: Date.now() }; }
        rounds++;
      } while (syncAgain && rounds < 3);
    } finally { syncing = false; }
  };
  // forget + cancel everything we scheduled, then schedule again from the database
  NativeNotif.resetSchedule = async function () {
    var cache = NativeNotif.cache();
    var ids = Object.keys(cache).map(function (k) { return cache[k] && cache[k].id; }).filter(function (x) { return typeof x === 'number'; });
    await NativeNotif.cancel(ids);
    NativeNotif.saveCache({});
    await NativeNotif.sync();
  };
  NativeNotif.requestSync = function (delay) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { NativeNotif.sync(); }, delay == null ? 800 : delay);
  };

  // ---------------- tap => open the record ----------------
  var tapBound = false;
  NativeNotif.bindTap = function () {
    if (tapBound) return;
    var LN = plugin();
    if (!LN || !LN.addListener) return;
    tapBound = true;
    var p = LN.addListener('localNotificationActionPerformed', function (ev) {
      try {
        var ex = ev && ev.notification && ev.notification.extra;
        if (!ex || !ex.refType) return;
        openRecord(ex.refType, ex.refId).catch(function () { /* stay where we are */ });
      } catch (e) { /* fall back to home */ }
    });
    if (p && typeof p.catch === 'function') p.catch(function (e) { console.error('notif tap listener failed', e); });
  };
  async function openRecord(type, id) {
    if (!id) return;
    try {
      if (type === 'task' && typeof window.openTaskDetail === 'function') { window.openTaskDetail(id); return; }
      if (type === 'call' && typeof window.openCallDetail === 'function') { window.openCallDetail(id); return; }
      if (type === 'followup') {
        var f = await Repo.get('followups', id);
        if (f && f.customerId) { window.navigate('customer', f.customerId); return; }
      }
      if (type === 'appointment') {
        var a = await Repo.get('appointments', id);
        if (a && a.customerId) { window.navigate('customer', a.customerId); return; }
        window.navigate('appointments'); return;
      }
    } catch (e) { /* record deleted while notification pending, go home */ }
    window.navigate('today');
  }

  // Immediate alert (low stock). Same channel; id is stable per alert text per day.
  async function fireNowNative(title, body) {
    try {
      if ((await NativeNotif.status()) !== 'granted') return false;
      await NativeNotif.channel();
      var key = 'alert:' + title + '|' + body + '|' + new Date().toDateString();
      var done = await NativeNotif.schedule([{ id: NativeNotif.idFor(key), key: key, ts: Date.now() + 1500, refType: 'alert', refId: null, title: title, body: body }]);
      return done.length === 1;
    } catch (e) { console.error('notif fireNow failed', e); return false; }
  }

  var initDone = false;
  NativeNotif.init = async function () {
    if (initDone) return;
    initDone = true;
    await NativeNotif.channel();
    NativeNotif.bindTap();
    var App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App && App.addListener) {
      var ap = App.addListener('appStateChange', function (st) {
        if (!st || !st.isActive) return;
        NativeNotif.sync(); // also re-evaluates timezone changes and permission changes made in Android settings
        try { document.dispatchEvent(new CustomEvent('crm:app-resume')); } catch (e) { /* ignore */ }
      });
      if (ap && typeof ap.catch === 'function') ap.catch(function (e) { console.error('notif app listener failed', e); });
    }
    var baseRender = window.render;
    if (typeof baseRender === 'function') {
      window.render = function () {
        NativeNotif.requestSync(1500);
        return baseRender.apply(null, arguments);
      };
    }
    if (typeof NotifService !== 'undefined' && NotifService) {
      // the web timer path must not run on Android; saving a record just requests a sync
      NotifService.scheduleFor = async function () { NativeNotif.requestSync(500); return null; };
      NotifService.requestPermission = async function () { return window.CRMNative.notifRequest(); };
      NotifService.fireNow = fireNowNative;
    }
    var raw = await NativeNotif.rawPermission();
    if (raw === 'prompt' && !wasAsked()) {
      // very first launch: ask once. After that only the Settings button asks.
      var first = await NativeNotif.request();
      await saveEnabled(first.ok);
    } else {
      await saveEnabled(raw === 'granted');
    }
    NativeNotif.sync();
  };

  function normPhone(v) {
    if (v == null) return '';
    var s = String(v).trim();
    var plus = s.charAt(0) === '+';
    s = s.replace(/\D/g, '');
    return (plus ? '+' : '') + s;
  }

  // extract a usable display name from the contacts-plugin name object
  function contactName(n) {
    if (n == null) return '';
    if (typeof n === 'string') return n.trim();
    if (typeof n === 'object') {
      return String(n.display || [n.prefix, n.given, n.middle, n.family, n.suffix].filter(Boolean).join(' ') || '').trim();
    }
    return String(n).trim();
  }

  var CRMNative = {};

  CRMNative.pickDeviceContacts = async function () {
    var C = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Contacts;
    if (!C) return { ok: false, code: 'unavailable', error: 'پلاگین مخاطبین در این نسخه ثبت نشده است؛ یک بار دستور npx cap sync android را اجرا و برنامه را دوباره نصب کنید' };

    var perm = null;
    try {
      perm = await withTimeout(C.checkPermissions(), 10000, 'permission_check');
    } catch (e) {
      return {
        ok: false,
        code: 'native_error',
        error: isTimeout(e)
          ? 'بررسی مجوز مخاطبین پاسخ نداد؛ دوباره تلاش کنید'
          : 'خطای داخلی هنگام بررسی مجوز مخاطبین: ' + (e && e.message ? e.message : 'نامشخص')
      };
    }

    var state = perm && perm.contacts;
    if (state !== 'granted') {
      if (state === 'denied') {
        return {
          ok: false,
          code: 'permission_permanent',
          error: 'مجوز دسترسی به مخاطبین قبلاً رد شده و اندروید دیگر پنجره درخواست را نشان نمی‌دهد. از تنظیمات اندروید ← برنامه‌ها ← CRM ← مجوزها آن را فعال کنید.'
        };
      }

      var req = null;
      try {
        req = await withTimeout(C.requestPermissions(), 60000, 'permission_request');
      } catch (e) {
        return {
          ok: false,
          code: 'native_error',
          error: isTimeout(e)
            ? 'درخواست مجوز مخاطبین پاسخی دریافت نکرد؛ دوباره تلاش کنید'
            : 'خطای داخلی هنگام درخواست مجوز مخاطبین: ' + (e && e.message ? e.message : 'نامشخص')
        };
      }

      var reqState = req && req.contacts;
      if (reqState !== 'granted') {
        var permanent = reqState === 'denied';
        return {
          ok: false,
          code: permanent ? 'permission_permanent' : 'permission_denied',
          error: permanent
            ? 'مجوز دسترسی به مخاطبین رد شد. از تنظیمات اندروید ← برنامه‌ها ← CRM ← مجوزها آن را فعال کنید.'
            : 'مجوز دسترسی به مخاطبین داده نشد.'
        };
      }
    }

    var result = null;
    try {
      result = await withTimeout(
        C.getContacts({ projection: { name: true, phones: true } }),
        30000,
        'read'
      );
    } catch (e) {
      return {
        ok: false,
        code: 'read_error',
        error: isTimeout(e)
          ? 'خواندن مخاطبین بیش از حد طول کشید؛ دوباره تلاش کنید'
          : 'خواندن مخاطبین ناموفق بود: ' + (e && e.message ? e.message : 'خطای ناشناخته')
      };
    }

    var contacts = (result && result.contacts) || [];
    if (!contacts.length) return { ok: false, code: 'no_contacts', error: 'مخاطبی در گوشی یافت نشد' };

    var customers = await Repo.list('customers');
    var crmPhones = {};
    customers.forEach(function (c) {
      var n = normPhone(c.phone);
      if (n) crmPhones[n] = true;
    });

    var seen = {};
    var candidates = [];

    contacts.forEach(function (ct) {
      var name = contactName(ct && ct.name);
      var phones = (ct && ct.phones) || [];

      phones.forEach(function (p) {
        var number = p && (p.number || p.phoneNumber)
          ? String(p.number || p.phoneNumber).trim()
          : '';

        if (!number) return;

        var key = normPhone(number);
        if (!key || seen[key]) return;

        seen[key] = true;
        candidates.push({
          name: name || number,
          phone: number,
          existsInCrm: !!crmPhones[key]
        });
      });
    });

    return { ok: true, contacts: candidates };
  };

  CRMNative.createCalendarEvent = async function (appointment) {
    var Cal = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorCalendar;
    if (!Cal) return { ok: false, error: 'این قابلیت فقط در نسخه اندروید در دسترس است' };
    if (!appointment || !appointment.datetime) return { ok: false, error: 'زمان قرار نامعتبر است' };
    try {
      var start = new Date(appointment.datetime);
      if (isNaN(start.getTime())) return { ok: false, error: 'زمان قرار نامعتبر است' };
      var marker = '[crm:' + appointment.id + ']';
      var title = appointment.title || 'قرار CRM';
      var desc = marker + (appointment.notes ? ' ' + appointment.notes : '');
      var loc = appointment.location || '';
      try {
        var startDay = new Date(start.getTime() - 12 * 3600000);
        var endDay = new Date(start.getTime() + 36 * 3600000);
        var existing = await Cal.listEventsInRange({
          startDate: startDay.getTime(),
          endDate: endDay.getTime(),
        });
        var events = (existing && existing.events) || existing || [];
        for (var i = 0; i < events.length; i++) {
          var d = (events[i] && (events[i].description || events[i].desc)) || '';
          if (String(d).indexOf(marker) !== -1) return { ok: false, error: 'این قرار قبلاً در تقویم ثبت شده است', duplicate: true };
        }
      } catch (e) { /* listing not critical, proceed to creation */ }
      var end = new Date(start.getTime() + 60 * 60000);
      await Cal.createEventWithPrompt({
        title: title,
        location: loc,
        description: desc,
        startDate: start.getTime(),
        endDate: end.getTime(),
      });
      return { ok: true, error: '' };
    } catch (e) {
      return { ok: false, error: 'ثبت رویداد لغو شد یا مجوز داده نشد' };
    }
  };

  // ============ REAL notification permission state (native) ============
  // 'granted' | 'prompt' | 'denied' | 'unsupported' | 'error' — backed by @capacitor/local-notifications
  CRMNative.notifStatus = async function () {
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
      // web fallback — real Web Notification API state
      if (!('Notification' in window)) return 'unsupported';
      return Notification.permission === 'granted' ? 'granted'
        : Notification.permission === 'denied' ? 'denied' : 'prompt';
    }
    return NativeNotif.status();
  };
  // returns { ok, reason, status } and never rejects
  CRMNative.notifRequest = async function () {
    try {
      if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
        if (typeof NotifService !== 'undefined' && NotifService) {
          var web = await NotifService.requestPermission();
          return { ok: !!web.ok, reason: web.reason || '', status: web.ok ? 'granted' : 'denied' };
        }
        return { ok: false, reason: 'اعلان در این محیط پشتیبانی نمی‌شود', status: 'unsupported' };
      }
      var r = await NativeNotif.request();
      await saveEnabled(r.ok);
      if (r.ok) NativeNotif.sync();
      return r;
    } catch (e) {
      console.error('notifRequest failed', e);
      return { ok: false, reason: 'درخواست مجوز ناموفق بود', status: 'error' };
    }
  };
  // Exact-alarm setting (Android 12+): 'granted' | 'denied' | 'prompt' | 'unsupported'
  CRMNative.notifExactStatus = async function () {
    if (!CRMNative.isNative()) return 'unsupported';
    return NativeNotif.exactStatus();
  };
  CRMNative.notifExactRequest = async function () {
    if (!CRMNative.isNative()) return 'unsupported';
    var s = await NativeNotif.exactRequest();
    if (s === 'granted') NativeNotif.resetSchedule(); // re-schedule pending alarms as exact ones
    return s;
  };

  CRMNative.isNative = function () {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  };

  window.CRMNative = CRMNative;

  whenCapacitor(function () {
    var Cap = window.Capacitor;
    var StatusBar = Cap.Plugins && Cap.Plugins.StatusBar;

    if (StatusBar) {
      try {
        StatusBar.setStyle({ style: 'LIGHT' });
        StatusBar.setBackgroundColor({ color: '#201e1a' });
        StatusBar.setOverlaysWebView({ overlay: false });
      } catch (e) { /* older WebView, ignore */ }
    }

    var vp = document.querySelector('meta[name="viewport"]');
    if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content');

    var lastBack = 0;
    var App = Cap.Plugins && Cap.Plugins.App;
    if (App && App.addListener) {
      App.addListener('backButton', function () {
        try {
          if (window._modalOpenCount > 0 && typeof window.closeModal === 'function') { window.closeModal(); return; }
          var hash = (location.hash || '').replace('#', '');
          var base = hash.split('/')[0];
          var isRoot = !hash || base === 'today';
          if (!isRoot) { window.history.back(); return; }
          var now = Date.now();
          if (now - lastBack < 2000) App.exitApp();
          else {
            lastBack = now;
            if (typeof window.toast === 'function') window.toast('برای خروج دوباره دکمه بازگشت را بزنید', 'info');
          }
        } catch (e) { /* never crash on back */ }
      });
    }

    function start() {
      if (Repo && typeof window.render === 'function') NativeNotif.init().catch(function (e) { console.error('notif init failed', e); });
      else setTimeout(start, 200);
    }
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start);
  });
})();