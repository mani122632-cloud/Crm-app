// contacts-auto.js — Contacts-page device-import UI glue.
//
// All native calls (permission check/request, reading device contacts, de-duping
// against the CRM) live in ONE place: CRMNative.pickDeviceContacts (native.js).
// This file only does UI:
//   - On entering the Contacts page: one-shot per visit, silently calls
//     CRMNative.pickDeviceContacts(). If it needs permission, the real Android
//     system dialog appears (native, no fake/mocked prompt). On success with
//     new contacts, opens the shared picker (search + multi-select). On failure,
//     shows a clear Persian, code-specific message inline on the page — never a
//     generic "not supported" string — with a one-shot retry when the failure is
//     not a permanent permission denial.
//   - Exposes window.CRMContactsImport.openPicker(fresh, existingCount), the same
//     picker used by the manual "افزودن از مخاطبین گوشی" button (customer360.js),
//     so there is exactly one picker implementation instead of two that could
//     drift apart.
/* global Routes, Repo, CustomerService, $, fmt, esc, toast, modal, closeModal, guard, showErr, formErr, CRMNative, render */

(function () {
  // ---- guard against re-running the automatic flow more than once per page visit ----
  var attemptMadeThisVisit = false;

  // ============ shared picker (search + multi-select + import) ============
  var CRMContactsImport = {};
  CRMContactsImport.openPicker = function (fresh, existingCount) {
    modal('ورود از مخاطبین گوشی',
      '<p class="muted">' + fmt(fresh.length) + ' مخاطب جدید یافت شد' +
      (existingCount ? ' — ' + fmt(existingCount) + ' مورد از قبل در سامانه موجود است' : '') + '.</p>' +
      '<div class="card" style="padding:.6rem"><input id="dci-q" type="search" placeholder="جستجو بر اساس نام یا شماره…" style="margin-bottom:.4rem"></div>' +
      '<div class="picker-list" id="dci-list">' + fresh.map(function (c, i) {
        return '<div class="picker-row" data-dci-row="' + i + '"><input type="checkbox" data-dci="' + i + '">' +
          '<div style="min-width:0"><div class="pr-name">' + esc(c.name) + '</div>' +
          '<div class="pr-phone">' + esc(c.phone) + '</div></div></div>';
      }).join('') + '</div>' +
      formErr() +
      '<button class="btn btn-block" id="dci-go">افزودن انتخاب‌شده‌ها به مشتریان</button>',
      function () {
        var inp = $('#dci-q');
        if (inp) inp.oninput = function () {
          var q = inp.value.trim().toLowerCase();
          var qDigits = q.replace(/\D/g, '');
          document.querySelectorAll('[data-dci-row]').forEach(function (row) {
            var c = fresh[Number(row.dataset.dciRow)];
            var match = !q ||
              (c.name && String(c.name).toLowerCase().includes(q)) ||
              (qDigits && c.phone && c.phone.replace(/\D/g, '').includes(qDigits));
            row.style.display = match ? '' : 'none';
          });
        };
        $('#dci-go').onclick = function () {
          var chosen = [];
          document.querySelectorAll('[data-dci]').forEach(function (cb) { if (cb.checked) chosen.push(fresh[Number(cb.dataset.dci)]); });
          if (!chosen.length) { showErr(new Error('هیچ مخاطبی انتخاب نشده است')); return; }
          guard($('#dci-go'), async function () {
            var added = 0, dupBlocked = 0, failed = 0;
            for (var i = 0; i < chosen.length; i++) {
              var c = chosen[i];
              try {
                // re-check against the CRM at import time (not just at read time),
                // since another import could have added the same number meanwhile
                var norm = String(c.phone || '').replace(/\D/g, '');
                var dups = norm ? await Repo.list('customers', function (x) { return !x.archived && String(x.phone || '').replace(/\D/g, '') === norm; }) : [];
                if (dups.length) { dupBlocked++; continue; }
                await CustomerService.create({ name: c.name, phone: c.phone });
                added++;
              } catch (e) {
                if (String(e.message || '').indexOf('موجود') !== -1) dupBlocked++; else failed++;
              }
            }
            closeModal();
            var msg = fmt(added) + ' مخاطب به مشتریان افزوده شد';
            if (dupBlocked) msg += ' — ' + fmt(dupBlocked) + ' مورد تکراری بود و ایجاد نشد (شماره قبلاً در سامانه موجود است)';
            if (failed) msg += ' — ' + fmt(failed) + ' مورد ناموفق';
            toast(msg, added ? 'ok' : 'warn');
            if (added) render();
          });
        };
      });
  };
  window.CRMContactsImport = CRMContactsImport;

  // ---- Persian banner for a failed automatic attempt (no crash, no generic text) ----
  // Every code from CRMNative.pickDeviceContacts gets its own message; a retry
  // button is offered unless the denial is permanent (Android will not show the
  // system dialog again in that case, so retrying would silently do nothing).
  function showBanner(code, error) {
    var box = document.getElementById('contacts-denied-banner');
    if (!box) return;
    if (code === 'no_contacts') { box.innerHTML = ''; return; } // not an error worth a banner
    var retryable = code !== 'permission_permanent';
    box.innerHTML = '<div class="card" style="border-color:var(--warning-border);background:var(--warning-bg)">' +
      '<b style="color:var(--warning)">' + esc(error || 'ورود خودکار مخاطبین ممکن نشد.') + '</b>' +
      (retryable ? '<p class="muted" style="margin:.3rem 0 .6rem">برای تلاش دوباره دکمه زیر را بزنید.</p><button class="btn small" id="contacts-retry">تلاش مجدد</button>' : '') +
      '</div>';
    var btn = document.getElementById('contacts-retry');
    if (btn) btn.onclick = function () { attemptMadeThisVisit = false; runAutoImport(); };
  }

  // ---- the automatic import flow, run once on page entry ----
  async function runAutoImport() {
    if (!window.CRMNative || !CRMNative.isNative()) return; // browser: manual button already explains it
    if (attemptMadeThisVisit) return; // one shot per visit — no request loop
    attemptMadeThisVisit = true;

    var r = await CRMNative.pickDeviceContacts();
    if (!r.ok) { showBanner(r.code, r.error); return; }

    var list = r.contacts || [];
    var fresh = list.filter(function (c) { return !c.existsInCrm; });
    var existingCount = list.length - fresh.length;
    if (!fresh.length) {
      if (list.length) toast('همه ' + fmt(list.length) + ' مخاطب گوشی از قبل در سامانه موجودند', 'info');
      return;
    }
    CRMContactsImport.openPicker(fresh, existingCount);
  }

  // ============ attach to the route lifecycle ============
  (function wrapContactsRoute() {
    var orig = Routes.contacts;
    Routes.contacts = async function () {
      var html = await orig();
      // placeholder banner container (filled only when the automatic attempt fails)
      setTimeout(function () {
        var wrap = document.createElement('div');
        wrap.id = 'contacts-denied-banner';
        var add = document.getElementById('add-ct');
        if (add && add.parentNode) add.parentNode.insertBefore(wrap, add);
      }, 0);
      attemptMadeThisVisit = false;
      // run AFTER the page has rendered, so the banner placeholder exists and the
      // user sees the page before any system permission dialog can appear
      setTimeout(function () {
        runAutoImport().catch(function (e) {
          toast('اجرای ورود خودکار مخاطبین با خطا متوقف شد: ' + (e && e.message ? e.message : 'نامشخص'), 'err');
        });
      }, 150);
      return html;
    };
  })();
})();
