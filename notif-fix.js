// notif-fix.js — shows the REAL notification state on the settings page.
// On Android the Web Notification API is unsupported, so the status comes from
// CRMNative.notifStatus() (backed by @capacitor/local-notifications) and the enable
// button is bound to CRMNative.notifRequest().
// Safety: every path releases the button (success, denied, error, timeout); no promise is
// left without a catch; the status refreshes when the app returns from Android settings.
// Additive only — reuses existing CSS classes (badge, btn, muted), no new styles.
/* global Routes, $, badge, toast, CRMNative */

(function wrapSettingsNotifStatus() {
  const orig = Routes.settings;
  let resumeRefresh = null;
  document.addEventListener('crm:app-resume', function () {
    if (resumeRefresh) resumeRefresh().catch(function () { /* ignore */ });
  });

  // .btn sets its own display, which beats the [hidden] attribute — toggle display directly
  function show(el, on) { el.style.display = on ? '' : 'none'; }

  const BLOCKED_HELP = 'برای فعال‌سازی: تنظیمات گوشی › برنامه‌ها › CRM › اعلان‌ها را روشن کنید و سپس به برنامه برگردید.';

  async function bind() {
    const btn = $('#st-notif');
    if (!btn) return;

    const statusEl = document.createElement('div');
    statusEl.id = 'notif-status-line';
    statusEl.style.marginBottom = '.4rem';
    statusEl.innerHTML = '<span class="muted">در حال بررسی وضعیت اعلان‌ها…</span>';
    btn.parentNode.insertBefore(statusEl, btn);

    const helpEl = document.createElement('p');
    helpEl.className = 'muted';
    show(helpEl, false);
    btn.parentNode.insertBefore(helpEl, btn);

    // exact-alarm row (Android 12+): only shown when the setting is off
    const exactEl = document.createElement('div');
    show(exactEl, false);
    exactEl.style.marginTop = '.6rem';
    const exactBtn = document.createElement('button');
    exactBtn.className = 'btn secondary btn-block';
    exactBtn.textContent = 'فعال‌سازی زمان دقیق یادآورها';
    show(exactBtn, false);
    btn.parentNode.insertBefore(exactEl, btn.nextSibling);
    exactEl.parentNode.insertBefore(exactBtn, exactEl.nextSibling);

    async function refresh() {
      let st = 'unsupported';
      let ex = 'unsupported';
      try { st = window.CRMNative ? await CRMNative.notifStatus() : 'unsupported'; } catch (e) { st = 'error'; }
      try { ex = window.CRMNative && CRMNative.notifExactStatus ? await CRMNative.notifExactStatus() : 'unsupported'; } catch (e) { ex = 'unsupported'; }
      if (!document.body.contains(btn)) { resumeRefresh = null; return; }
      const label = st === 'granted' ? 'مجاز است'
        : st === 'denied' ? 'رد شده است'
        : st === 'prompt' ? 'نیاز به اجازه دارد'
        : st === 'error' ? 'بررسی ناموفق بود'
        : 'پشتیبانی نمی‌شود';
      const cls = st === 'granted' ? 'ok' : st === 'denied' || st === 'error' ? 'danger' : st === 'prompt' ? 'warn' : '';
      statusEl.innerHTML = '<span class="muted">وضعیت مجوز اعلان‌ها (واقعی):</span> ' + badge(label, cls);
      btn.textContent = st === 'granted' ? 'اعلان‌ها فعال است'
        : st === 'denied' ? 'بررسی دوباره وضعیت'
        : st === 'error' ? 'تلاش دوباره'
        : 'فعال‌سازی اعلان‌ها';
      btn.disabled = st === 'granted' || st === 'unsupported';
      helpEl.textContent = BLOCKED_HELP;
      show(helpEl, st === 'denied');

      const showExact = st === 'granted' && (ex === 'denied' || ex === 'prompt');
      show(exactEl, showExact);
      show(exactBtn, showExact);
      if (showExact) {
        exactEl.innerHTML = '<span class="muted">زمان دقیق یادآورها:</span> ' + badge('نیاز به اجازه دارد', 'warn') +
          '<p class="muted">بدون این مجوز ممکن است یادآورها با چند دقیقه تأخیر نمایش داده شوند.</p>';
      }
    }
    resumeRefresh = refresh;
    await refresh();

    btn.onclick = async function () {
      if (btn.disabled) return;
      if (!window.CRMNative) { toast('اعلان Native در این محیط در دسترس نیست', 'warn'); return; }
      btn.disabled = true;
      btn.classList.add('loading');
      try {
        const r = await CRMNative.notifRequest();
        if (r && r.ok) toast('اعلان‌ها فعال شد', 'ok');
        else toast((r && r.reason) || 'فعال‌سازی انجام نشد', r && (r.status === 'denied' || r.status === 'prompt') ? 'warn' : 'err');
      } catch (e) {
        toast('فعال‌سازی اعلان‌ها ناموفق بود', 'err');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        try { await refresh(); } catch (e) { /* ignore */ }
      }
    };

    exactBtn.onclick = async function () {
      if (exactBtn.disabled) return;
      exactBtn.disabled = true;
      exactBtn.classList.add('loading');
      try {
        const s = await CRMNative.notifExactRequest();
        if (s === 'granted') toast('زمان دقیق یادآورها فعال شد', 'ok');
        else toast('برای زمان دقیق، اجازه را در صفحه تنظیمات اندروید فعال کنید', 'warn');
      } catch (e) {
        toast('تغییر تنظیم زمان دقیق ناموفق بود', 'err');
      } finally {
        exactBtn.classList.remove('loading');
        exactBtn.disabled = false;
        try { await refresh(); } catch (e) { /* ignore */ }
      }
    };
  }

  Routes.settings = async function () {
    const html = await orig();
    setTimeout(function () {
      bind().catch(function (e) { console.error('notif settings bind failed', e); });
    }, 0);
    return html;
  };
})();
