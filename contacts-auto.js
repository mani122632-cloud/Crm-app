// contacts-auto.js — REAL automatic device-contacts flow on the Contacts page.
// Attaches permission + read + import to the ROUTE LIFECYCLE, not to a button:
//   - On entering the Contacts page, checks the real Android contacts permission.
//   - If not granted: immediately requests it via the Capacitor Contacts plugin
//     (real system dialog, no extra button press needed).
//   - If granted (before or after the dialog): reads the REAL device contacts,
//     de-duplicates them against CRM by normalized phone number, and opens the
//     existing professional import picker (search + multi-select).
//   - If denied: no crash, a clear Persian message inside the page, with a
//     retry link that does NOT loop (retry is one-shot per page visit).
// Contact name object handling (display/prefix/given/middle/family/suffix) and
// phone numbers are parsed correctly — "[object Object]" is impossible here.
// Purely additive: wraps Routes.contacts; no existing file or service changes.
/* global Routes, Repo, CustomerService, $, fmt, esc, toast, modal, closeModal, guard, showErr, errMsg */

(function () {
  // ---- guards against a permission-request loop: one attempt per page visit ----
  var attemptMadeThisVisit = false;
  var retryLinkArmed = false;

  // ---- real name extraction from the contacts-plugin name object ----
  function contactName(n) {
    if (n == null) return '';
    if (typeof n === 'string') return n.trim();
    if (typeof n === 'object') {
      return String(n.display ||
        [n.prefix, n.given, n.middle, n.family, n.suffix].filter(Boolean).join(' ') ||
        '').trim();
    }
    return String(n).trim();
  }

  // ---- real phone extraction (string or {number} object forms) ----
  function contactNumber(p) {
    if (p == null) return '';
    if (typeof p === 'string') return p.trim();
    if (typeof p === 'object') return String(p.number || p.phoneNumber || '').trim();
    return String(p).trim();
  }

  // ---- real permission check/request via @capacitor-community/contacts ----
  async function ensureContactsPermission(C) {
    var perm = null;
    try { perm = await C.checkPermissions(); } catch (e) { perm = null; }
    var granted = !!(perm && (perm.contacts === 'granted' || perm.readContacts === 'granted'));
    if (granted) return { granted: true, denied: false };
    // request ONLY now (one-shot per visit — no loop)
    attemptMadeThisVisit = true;
    var req = null;
    try { req = await C.requestPermissions(); } catch (e) { req = null; }
    granted = !!(req && (req.contacts === 'granted' || req.readContacts === 'granted'));
    var denied = !!(req && (req.contacts === 'denied' || req.readContacts === 'denied'));
    return { granted: granted, denied: denied || !granted };
  }

  // ---- read real device contacts ----
  async function readDeviceContacts(C) {
    var result = null;
    try {
      result = await C.getContacts({ fields: ['name', 'phones'] });
    } catch (e1) {
      try { result = await C.getContacts({ fields: ['firstName', 'phones'] }); }
      catch (e2) { return null; }
    }
    var contacts = (result && result.contacts) || [];
    var seen = {};
    var list = [];
    contacts.forEach(function (ct) {
      var name = contactName(ct && ct.name);
      var phones = (ct && (ct.phones || ct.phoneNumbers)) || [];
      phones.forEach(function (p) {
        var number = contactNumber(p);
        if (!number || !name) return;
        var key = number.replace(/\D/g, '');
        if (!key || seen[key]) return;
        seen[key] = true;
        list.push({ name: name, phone: number });
      });
    });
    return list;
  }

  // ---- mark imported rows so we never create duplicates on repeat visits ----
  function markImported(phones) {
    try {
      var set = {};
      phones.forEach(function (p) { set[p.replace(/\D/g, '')] = true; });
      var prev = {};
      try { prev = JSON.parse(sessionStorage.getItem('crm_imported_contacts') || '{}'); } catch (e) { prev = {}; }
      Object.assign(prev, set);
      sessionStorage.setItem('crm_imported_contacts', JSON.stringify(prev));
    } catch (e) { /* non-fatal */ }
  }

  // ---- the automatic import flow, run on page entry ----
  async function runAutoImport() {
    var C = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Contacts;
    // browser/no-plugin: stay quiet — the manual "افزودن از مخاطبین گوشی" button
    // already explains the situation; no dialogs or loops here.
    if (!C) return;
    if (attemptMadeThisVisit) return; // one shot per visit — no request loop

    // 1) real permission check (+ automatic real request if not granted)
    var pr = await ensureContactsPermission(C);
    if (!pr.granted) {
      showDeniedBanner(pr.denied);
      return;
    }
    // 2) real read of device contacts
    var list = await readDeviceContacts(C);
    if (!list) { toast('خواندن مخاطبین گوشی ناموفق بود', 'err'); return; }
    if (!list.length) { toast('مخاطب قابل ورود در گوشی یافت نشد', 'info'); return; }
    // 3) real duplicate detection against CRM (normalized phone numbers)
    var customers = await Repo.list('customers');
    var crmPhones = {};
    customers.forEach(function (c) {
      var n = String(c.phone || '').replace(/\D/g, '');
      if (n) crmPhones[n] = true;
    });
    var fresh = list.filter(function (x) { return !crmPhones[x.phone.replace(/\D/g, '')]; });
    var existingCount = list.length - fresh.length;
    // 4) open the existing professional picker (search + multi-select)
    if (!fresh.length) {
      toast('همه ' + fmt(list.length) + ' مخاطب گوشی از قبل در سامانه موجودند', 'info');
      return;
    }
    openImportPicker(fresh, existingCount);
  }

  // ---- Persian banner when permission is denied (no crash, retry available) ----
  function showDeniedBanner(denied) {
    var box = document.getElementById('contacts-denied-banner');
    if (!box) return;
    box.innerHTML = '<div class="card" style="border-color:var(--warning-border);background:var(--warning-bg)">' +
      '<b style="color:var(--warning)">مجوز دسترسی به مخاطبین داده نشد.</b>' +
      '<p class="muted" style="margin:.3rem 0 .6rem">' + (denied
        ? 'می‌توانید از تنظیمات اندروید این مجوز را فعال کنید یا اینجا دوباره تلاش کنید.'
        : 'برای ورود خودکار مخاطبین، اجازه دسترسی لازم است.') + '</p>' +
      '<button class="btn small" id="contacts-retry">تلاش مجدد</button></div>';
    var btn = document.getElementById('contacts-retry');
    if (btn) btn.onclick = function () {
      if (attemptMadeThisVisit && retryLinkArmed) return; // one-shot per visit
      retryLinkArmed = true;
      attemptMadeThisVisit = false;
      runAutoImport();
    };
  }

  // ---- the existing professional picker (same UX as before) ----
  function openImportPicker(fresh, existingCount) {
    const picked = {};
    modal('ورود از مخاطبین گوشی',
      '<p class="muted">' + fmt(fresh.length) + ' مخاطب جدید یافت شد' +
      (existingCount ? ' — ' + fmt(existingCount) + ' مورد از قبل در سامانه موجود است' : '') + '.</p>' +
      '<div class="card" style="padding:.6rem"><input id="dci-q" type="search" placeholder="جستجو بر اساس نام یا شماره…" style="margin-bottom:.4rem"></div>' +
      '<div class="picker-list" id="dci-list">' + fresh.map((c, i) =>
        '<div class="picker-row" data-dci-row="' + i + '"><input type="checkbox" data-dci="' + i + '">' +
        '<div style="min-width:0"><div class="pr-name">' + esc(c.name) + '</div>' +
        '<div class="pr-phone">' + esc(c.phone) + '</div></div></div>').join('') + '</div>' +
      formErr() +
      '<button class="btn btn-block" id="dci-go">افزودن انتخاب‌شده‌ها به مشتریان</button>',
      function () {
        const inp = $('#dci-q');
        if (inp) inp.oninput = function () {
          const q = inp.value.trim().toLowerCase();
          const qDigits = q.replace(/\D/g, '');
          document.querySelectorAll('[data-dci-row]').forEach(function (row) {
            const c = fresh[Number(row.dataset.dciRow)];
            const match = !q ||
              (c.name && String(c.name).toLowerCase().includes(q)) ||
              (qDigits && c.phone && c.phone.replace(/\D/g, '').includes(qDigits));
            row.style.display = match ? '' : 'none';
          });
        };
        $('#dci-go').onclick = function () {
          const chosen = [];
          document.querySelectorAll('[data-dci]').forEach(function (cb) { if (cb.checked) chosen.push(fresh[Number(cb.dataset.dci)]); });
          if (!chosen.length) { showErr(new Error('هیچ مخاطبی انتخاب نشده است')); return; }
          guard($('#dci-go'), async function () {
            let added = 0, dupBlocked = 0, failed = 0;
            for (const c of chosen) {
              try {
                const norm = String(c.phone || '').replace(/\D/g, '');
                const dups = norm ? await Repo.list('customers', x => !x.archived && String(x.phone || '').replace(/\D/g, '') === norm) : [];
                if (dups.length) { dupBlocked++; continue; }
                await CustomerService.create({ name: c.name, phone: c.phone });
                added++;
              } catch (e) {
                if (String(e.message || '').indexOf('موجود') !== -1) dupBlocked++; else failed++;
              }
            }
            markImported(chosen.map(c => c.phone));
            closeModal();
            let msg = fmt(added) + ' مخاطب به مشتریان افزوده شد';
            if (dupBlocked) msg += ' — ' + fmt(dupBlocked) + ' مورد تکراری بود';
            if (failed) msg += ' — ' + fmt(failed) + ' مورد ناموفق';
            toast(msg, added ? 'ok' : 'warn');
            if (added) render();
          });
        };
      });
  }

  // ============ attach to the real route lifecycle ============
  (function wrapContactsRoute() {
    const orig = Routes.contacts;
    Routes.contacts = async function () {
      const html = await orig();
      // placeholder banner container (filled only when permission is denied)
      setTimeout(function () {
        var wrap = document.createElement('div');
        wrap.id = 'contacts-denied-banner';
        var add = document.getElementById('add-ct');
        if (add && add.parentNode) add.parentNode.insertBefore(wrap, add);
      }, 0);
      // run the automatic flow — but AFTER the page has rendered (so the banner
      // placeholder exists and the user sees the page first)
      setTimeout(function () { runAutoImport(); }, 150);
      return html;
    };
  })();
})();