// native.js — BUGFIX build (Phase 6).
// CHANGE 1 (contacts): in @capacitor-community/contacts v6 the returned "name"
// field is an OBJECT ({ display, given, family, ... }), not a string. The old
// code String(ct.name) produced "[object Object]". Fixed: reads name.display
// with string fallback. Everything else in the contacts flow unchanged.
// CHANGE 2 (notifications): exposes CRMNative.notifStatus() and
// CRMNative.notifRequest() backed by @capacitor/local-notifications so the
// settings page can show the REAL Android permission state instead of the
// unsupported Web Notification API. Notification engine (channel, sync, tap,
// dedupe) is untouched.
(function () {
  function whenCapacitor(fn) {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) fn();
    else window.addEventListener('load', function () {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) fn();
    });
  }

  var CHANNEL_ID = 'crm_reminders';
  var SCHED_CACHE_KEY = 'crm_sched_v1';
  var CHANNEL_NAME = 'CRM Reminders';

  function NativeNotif() {}

  NativeNotif.channel = function () {
    var LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      LN.createChannel({
        id: CHANNEL_ID,
        name: CHANNEL_NAME,
        description: 'یادآورهای CRM (پیگیری، کار، قرار، تماس)',
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
      });
    } catch (e) { /* channel may already exist */ }
  };

  NativeNotif.permission = async function () {
    var LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      var st = await LN.checkPermissions();
      if (st && st.display === 'granted') return true;
      var req = await LN.requestPermissions();
      return !!(req && req.display === 'granted');
    } catch (e) { return false; }
  };

  NativeNotif.idFor = function (key) {
    var h = 5381;
    for (var i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
    return Math.abs(h) % 2147483647;
  };

  NativeNotif.cache = function () {
    try { return JSON.parse(localStorage.getItem(SCHED_CACHE_KEY) || '{}'); }
    catch (e) { return {}; }
  };
  NativeNotif.saveCache = function (map) {
    try { localStorage.setItem(SCHED_CACHE_KEY, JSON.stringify(map)); } catch (e) { /* non-fatal */ }
  };

  NativeNotif.cancel = async function (ids) {
    if (!ids.length) return;
    var LN = window.Capacitor.Plugins.LocalNotifications;
    try { await LN.cancel({ notifications: ids.map(function (id) { return { id: id }; }) }); }
    catch (e) { /* id may not exist, ignore */ }
  };

  NativeNotif.schedule = async function (items) {
    if (!items.length) return;
    var LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      await LN.schedule({
        notifications: items.map(function (it) {
          return {
            id: it.id,
            title: it.title,
            body: it.body,
            schedule: { at: new Date(it.ts), allowWhileIdle: true },
            channelId: CHANNEL_ID,
            extra: { refType: it.refType, refId: it.refId, key: it.key },
          };
        }),
      });
    } catch (e) { console.error('schedule failed', e); }
  };

  function remindersFromDB() {
    return Promise.all([
      Repo.list('tasks'),
      Repo.list('followups'),
      Repo.list('appointments'),
      Repo.list('calls'),
    ]).then(function (r) {
      var out = [];
      var now = Date.now();
      var fmtLocal = function (dateStr, timeStr) {
        if (!dateStr) return 0;
        var t = timeStr ? timeStr.split(':') : ['9', '0'];
        var d = new Date(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10)),
          Number(t[0] || 9), Number(t[1] || 0), 0, 0);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };
      r[0].forEach(function (t) {
        if (t.status === 'done' || !t.dueDate) return;
        var ts = fmtLocal(t.dueDate, t.dueTime);
        if (ts > now) out.push({ key: 'task:' + t.id, id: NativeNotif.idFor('task:' + t.id), ts: ts, refType: 'task', refId: t.id, title: 'یادآور کار', body: t.title || 'موعد کار فرا رسیده است' });
      });
      r[1].forEach(function (f) {
        if (f.status !== 'open' || !f.dueDate) return;
        var ts = fmtLocal(f.dueDate, f.dueTime);
        if (ts > now) out.push({ key: 'followup:' + f.id, id: NativeNotif.idFor('followup:' + f.id), ts: ts, refType: 'followup', refId: f.id, title: 'یادآور پیگیری', body: f.title || 'موعد پیگیری فرا رسیده است' });
      });
      r[2].forEach(function (a) {
        if (a.status === 'cancelled' || !a.datetime) return;
        var ts = new Date(a.datetime).getTime();
        if (isNaN(ts)) return;
        if (ts > now) out.push({ key: 'appointment:' + a.id, id: NativeNotif.idFor('appointment:' + a.id), ts: ts, refType: 'appointment', refId: a.id, title: 'یادآور قرار', body: a.title || 'قرار نزدیک است' });
      });
      r[3].forEach(function (c) {
        if (!c.nextCallDate) return;
        var ts = fmtLocal(c.nextCallDate, null);
        if (ts > now) out.push({ key: 'call:' + c.id, id: NativeNotif.idFor('call:' + c.id), ts: ts, refType: 'call', refId: c.id, title: 'یادآور تماس', body: 'زمان تماس بعدی رسیده است' });
      });
      return out;
    });
  }

  var syncing = false;
  NativeNotif.sync = async function () {
    if (syncing) return;
    syncing = true;
    try {
      var desired = await remindersFromDB();
      var want = {};
      desired.forEach(function (d) { want[d.key] = d; });
      var cache = NativeNotif.cache();
      var toSchedule = [], toCancel = [], nextCache = {};
      Object.keys(cache).forEach(function (key) {
        if (!want[key]) { toCancel.push(cache[key].id); return; }
        if (want[key].ts !== cache[key].ts) { toCancel.push(cache[key].id); toSchedule.push(want[key]); return; }
        nextCache[key] = cache[key];
      });
      desired.forEach(function (d) {
        if (!nextCache[d.key] && toSchedule.filter(function (s) { return s.key === d.key; }).length === 0) toSchedule.push(d);
      });
      await NativeNotif.cancel(toCancel);
      if (toSchedule.length) await NativeNotif.schedule(toSchedule);
      toSchedule.forEach(function (d) { nextCache[d.key] = { id: d.id, ts: d.ts }; });
      NativeNotif.saveCache(nextCache);
    } catch (e) { console.error('notif sync failed', e); }
    finally { syncing = false; }
  };

  NativeNotif.bindTap = function () {
    var LN = window.Capacitor.Plugins.LocalNotifications;
    if (!LN || !LN.addListener) return;
    LN.addListener('localNotificationActionPerformed', function (ev) {
      try {
        var ex = ev && ev.notification && ev.notification.extra;
        if (!ex || !ex.refType) return;
        openRecord(ex.refType, ex.refId);
      } catch (e) { /* fall back to home */ }
    });
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

  NativeNotif.init = async function () {
    NativeNotif.channel();
    NativeNotif.bindTap();
    var App = window.Capacitor.Plugins.App;
    if (App && App.addListener) {
      App.addListener('appStateChange', function (st) { if (st.isActive) NativeNotif.sync(); });
    }
    var t = null;
    var baseRender = window.render;
    if (typeof baseRender === 'function') {
      window.render = function () {
        var args = arguments;
        clearTimeout(t);
        t = setTimeout(function () { NativeNotif.sync(); }, 1500);
        return baseRender.apply(null, args);
      };
    }
    if (NotifService) {
      NotifService.scheduleFor = async function () { return null; };
      NotifService.requestPermission = async function () {
        var ok = await NativeNotif.permission();
        await Repo.saveSettings({ notificationsEnabled: ok });
        return { ok: ok, reason: ok ? '' : 'Permission رد شد' };
      };
    }
    var ok = await NativeNotif.permission();
    await Repo.saveSettings({ notificationsEnabled: ok });
    if (ok) NativeNotif.sync();
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
    if (!C) return { ok: false, error: 'پلاگین مخاطبین در این نسخه ثبت نشده است؛ یک بار دستور npx cap sync android را اجرا و برنامه را دوباره نصب کنید' };
    try {
      // permission is requested only here, at the moment of use; if already
      // granted, checkPermissions returns granted and no dialog appears again
      var perm = await C.checkPermissions();
      if (!perm || perm.contacts !== 'granted') {
        var req = await C.requestPermissions();
        if (!req || req.contacts !== 'granted') return { ok: false, error: 'مجوز دسترسی به مخاطبین داده نشد؛ از تنظیمات اندروید می‌توانید بعداً آن را فعال کنید' };
      }
      var result = await C.getContacts({ fields: ['name', 'phones'] });
      var contacts = (result && result.contacts) || [];
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
          var number = p && (p.number || p.phoneNumber) ? String(p.number || p.phoneNumber).trim() : '';
          if (!number || !name) return;
          var key = normPhone(number);
          if (!key || seen[key]) return;
          seen[key] = true;
          candidates.push({ name: name, phone: number, existsInCrm: !!crmPhones[key] });
        });
      });
      return { ok: true, contacts: candidates };
    } catch (e) {
      return { ok: false, error: 'خواندن مخاطبین ناموفق بود: ' + (e && e.message ? e.message : 'خطای ناشناخته') };
    }
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
  // 'granted' | 'prompt' | 'denied' — backed by @capacitor/local-notifications
  CRMNative.notifStatus = async function () {
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
      // web fallback — real Web Notification API state
      if (!('Notification' in window)) return 'unsupported';
      return Notification.permission === 'granted' ? 'granted'
        : Notification.permission === 'denied' ? 'denied' : 'prompt';
    }
    try {
      var LN = window.Capacitor.Plugins.LocalNotifications;
      var st = await LN.checkPermissions();
      if (st && st.display === 'granted') return 'granted';
      if (st && st.display === 'denied') return 'denied';
      return 'prompt';
    } catch (e) { return 'prompt'; }
  };
  CRMNative.notifRequest = async function () {
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
      if (typeof NotifService === 'function' || NotifService) {
        var web = await NotifService.requestPermission();
        return { ok: !!web.ok, reason: web.reason || '' };
      }
      return { ok: false, reason: 'اعلان در این محیط پشتیبانی نمی‌شود' };
    }
    try {
      var ok = await NativeNotif.permission();
      await Repo.saveSettings({ notificationsEnabled: ok });
      if (ok) NativeNotif.sync();
      return { ok: ok, reason: ok ? '' : 'مجوز اعلان رد شد؛ از تنظیمات اندروید قابل فعال‌سازی است' };
    } catch (e) {
      return { ok: false, reason: 'درخواست مجوز ناموفق بود' };
    }
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
        StatusBar.setBackgroundColor({ color: '#2b2b28' });
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
      if (Repo && typeof window.render === 'function') NativeNotif.init();
      else setTimeout(start, 200);
    }
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start);
  });
})();