// notif-fix.js — BUGFIX 2: show the REAL notification permission state on the
// settings page. On Android the Web Notification API is unsupported, so the old
// badge always showed "پشتیبانی نمی‌شود". This wrapper queries
// CRMNative.notifStatus() (backed by @capacitor/local-notifications) and rebinds
// the enable button to CRMNative.notifRequest(). Web behavior falls back to the
// real Web API state. Additive only — no existing file or service changed.
/* global Routes, $, esc, badge, toast, CRMNative, render */

(function wrapSettingsNotifStatus() {
  const orig = Routes.settings;
  Routes.settings = async function () {
    const html = await orig();
    setTimeout(async function () {
      const btn = $('#st-notif');
      if (!btn) return;
      // find the status row (the list-item just before the button's card section)
      const statusEl = document.createElement('div');
      statusEl.id = 'notif-status-line';
      statusEl.style.marginBottom = '.4rem';
      statusEl.innerHTML = '<span class="muted">در حال بررسی وضعیت اعلان‌ها…</span>';
      btn.parentNode.insertBefore(statusEl, btn);

      async function refresh() {
        const st = window.CRMNative ? await CRMNative.notifStatus() : 'unsupported';
        const label = st === 'granted' ? 'مجاز است'
          : st === 'denied' ? 'رد شده است'
          : st === 'prompt' ? 'نیاز به اجازه دارد'
          : 'پشتیبانی نمی‌شود';
        const cls = st === 'granted' ? 'ok' : st === 'denied' ? 'danger' : st === 'prompt' ? 'warn' : '';
        statusEl.innerHTML = '<span class="muted">وضعیت مجوز اعلان‌ها (واقعی):</span> ' + badge(label, cls);
        btn.textContent = st === 'granted' ? 'اعلان‌ها فعال است' : st === 'denied' ? 'فعال‌سازی از طریق درخواست مجدد' : 'فعال‌سازی اعلان‌ها';
        btn.disabled = st === 'granted';
      }
      await refresh();
      btn.onclick = function () {
        if (btn.disabled) return;
        if (!window.CRMNative) { toast('اعلان Native در این محیط در دسترس نیست', 'warn'); return; }
        if (btn.disabled) return;
        btn.disabled = true;
        CRMNative.notifRequest().then(function (r) {
          btn.disabled = false;
          if (r.ok) toast('اعلان‌ها فعال شد', 'ok');
          else toast(r.reason || 'فعال‌سازی انجام نشد', r.reason && r.reason.indexOf('رد') !== -1 ? 'warn' : 'err');
          refresh();
        });
      };
    }, 0);
    return html;
  };
})();