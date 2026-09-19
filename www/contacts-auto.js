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
  // code of the last failed automatic attempt on the page currently shown (null = none / succeeded)
  var lastFailCode = null;
  // last banner shown on the Contacts page, re-drawn when the same page is re-rendered
  var lastBanner = null;

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
            var added = 0, dupBlocked = 0, failed = 0, firstFail = '';
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
                if (String(e.message || '').indexOf('موجود') !== -1) dupBlocked++;
                else { failed++; if (!firstFail) firstFail = (e && e.message) ? e.message : 'خطای نامشخص'; }
              }
            }
            // nothing was saved and something really failed: keep the picker open and say why
            if (!added && failed) {
              showErr(new Error(fmt(failed) + ' مورد ناموفق بود؛ علت: ' + firstFail));
              return;
            }
            closeModal();
            var msg = fmt(added) + ' مخاطب به مشتریان افزوده شد';
            if (dupBlocked) msg += ' — ' + fmt(dupBlocked) + ' مورد تکراری بود و ایجاد نشد (شماره قبلاً در سامانه موجود است)';
            if (failed) msg += ' — ' + fmt(failed) + ' مورد ناموفق (' + firstFail + ')';
            toast(msg, added ? 'ok' : 'warn');
            if (added) render();
          });
        };
      });
  };
  window.CRMContactsImport = CRMContactsImport;

  // ---- Persian banner for a failed automatic attempt (no crash, no generic text) ----
  // Every code from CRMNative.pickDeviceContacts gets its own message and a button that
  // runs the whole check again (the permission is re-read from the native side each time).
  function showBanner(code, error) {
    var box = document.getElementById('contacts-denied-banner');
    if (!box) return;
    // A permanent denial also gets a button: the permission state is re-read from the native
    // side on every attempt, so after enabling Contacts in Android Settings the user can
    // confirm it here (it also re-checks automatically when the app comes back to the front).
    var permanent = code === 'permission_permanent';
    box.innerHTML = '<div class="card" style="border-color:var(--warning-border);background:var(--warning-bg)">' +
      '<b style="color:var(--warning)">' + esc(error || 'ورود خودکار مخاطبین ممکن نشد.') + '</b>' +
      '<p class="muted" style="margin:.3rem 0 .6rem">' + (permanent ? 'پس از فعال‌سازی مجوز به برنامه برگردید یا دکمه زیر را بزنید.' : 'برای تلاش دوباره دکمه زیر را بزنید.') + '</p>' +
      '<button class="btn small" id="contacts-retry">' + (permanent ? 'بررسی دوباره مجوز' : 'تلاش مجدد') + '</button>' +
      '</div>';
    lastBanner = { code: code, error: error };
    bindRetry();
  }

  function bindRetry() {
    var btn = document.getElementById('contacts-retry');
    if (btn) btn.onclick = function () {
      attemptMadeThisVisit = false;
      runAutoImport().catch(function (e) {
        toast('بررسی مجوز مخاطبین با خطا متوقف شد: ' + (e && e.message ? e.message : 'نامشخص'), 'err');
      });
    };
  }

  // ---- the automatic import flow, run once on page entry ----
  async function runAutoImport() {
    if (!window.CRMNative || !CRMNative.isNative()) return; // browser: manual button already explains it
    if (attemptMadeThisVisit) return; // one shot per visit — no request loop
    attemptMadeThisVisit = true;
    lastFailCode = null;

    var r = await CRMNative.pickDeviceContacts();
    // the manual button (customer360.js) shows its own result for the same read
    if (CRMContactsImport.manualBusy) return;
    if (!r.ok) { lastFailCode = r.code; showBanner(r.code, r.error); return; }
    lastBanner = null;
    var box = document.getElementById('contacts-denied-banner');
    if (box) box.innerHTML = '';

    var list = r.contacts || [];
    var fresh = list.filter(function (c) { return !c.existsInCrm; });
    var existingCount = list.length - fresh.length;
    if (!fresh.length) {
      if (list.length) toast('همه ' + fmt(list.length) + ' مخاطب گوشی از قبل در سامانه موجودند', 'info');
      return;
    }
    CRMContactsImport.openPicker(fresh, existingCount);
  }

  // Back from Android Settings (or any other app): when the page is showing a permission
  // failure, read the real permission state again and continue if it is granted now.
  document.addEventListener('crm:app-resume', function () {
    if (lastFailCode !== 'permission_permanent' && lastFailCode !== 'permission_denied') return;
    if (!document.getElementById('contacts-denied-banner')) return; // no longer on the Contacts page
    attemptMadeThisVisit = false;
    runAutoImport().catch(function (e) {
      toast('بررسی دوباره مجوز مخاطبین با خطا متوقف شد: ' + (e && e.message ? e.message : 'نامشخص'), 'err');
    });
  });

  // ============ attach to the route lifecycle ============
  (function wrapContactsRoute() {
    var orig = Routes.contacts;
    Routes.contacts = async function () {
      // Routes.contacts runs BEFORE the page DOM is replaced, so a banner placeholder that is
      // still in the document means this is a re-render of the page already on screen (search
      // typing, render() after an import), not a new visit. A re-render must not re-read the
      // whole phone book and re-open the picker.
      var sameVisit = !!document.getElementById('contacts-denied-banner');
      var html = await orig();
      // placeholder banner container (filled only when the automatic attempt fails)
      setTimeout(function () {
        var wrap = document.createElement('div');
        wrap.id = 'contacts-denied-banner';
        var add = document.getElementById('add-ct');
        if (add && add.parentNode) add.parentNode.insertBefore(wrap, add);
        if (sameVisit && lastBanner) showBanner(lastBanner.code, lastBanner.error);
      }, 0);
      if (sameVisit) return html;
      attemptMadeThisVisit = false;
      lastFailCode = null;
      lastBanner = null;
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
