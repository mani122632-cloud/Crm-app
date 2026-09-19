// customer360.js — PHASE 2: professional customer file (360) + real device
// contacts picker. Purely additive UI layer: reads data exclusively through the
// existing services (CustomerService.detail, Repo), wires quick actions to the
// existing open* modals, and overrides the device-contacts import flow with a
// searchable multi-select picker. No service, DB schema or native.js change.
/* global Routes, Repo, DB, CustomerService, CRMNative, num, Dates, $, app, fmt, esc, dateFa, dateTimeFa,
   enterCls, toast, modal, closeModal, confirmDlg, errMsg, badge, val, secTitle, secList, guard, navigate,
   render, showErr, customerOptions, Repo, AIService */

// ============ PART A: Customer 360 ============
(function replaceCustomerRoute() {
  const STATUS_CLS = { open: 'info', won: 'ok', lost: 'danger' };
  Routes.customer = async function (id) {
    const d = await CustomerService.detail(id);
    const c = d.customer;
    const statuses = await Repo.list('statuses', s => s.entityType === 'customers');
    const companies = await Repo.list('companies');
    const comp = companies.find(x => x.id === c.companyId);
    const st = statuses.find(s => s.id === c.statusId);
    const cfFields = await (typeof CustomFieldService !== 'undefined' ? CustomFieldService.fieldsFor('customer') : Promise.resolve([]));
    const cfMap = await (typeof CustomFieldService !== 'undefined' ? CustomFieldService.getValuesMap('customer', id) : Promise.resolve({}));

    const openDeals = d.deals.filter(x => x.status === 'open');
    const dealsValue = d.deals.reduce((s, x) => s + num(x.value), 0);
    const ordersValid = d.orders.filter(o => o.status !== 'لغو شده' && o.status !== 'cancelled');
    const ordersTotal = ordersValid.reduce((s, o) => s + Number(o.total || 0), 0);
    const tagsAll = await Repo.list('tags');

    // real timeline: all activity sources merged, sorted newest first
    const timeline = [];
    (d.activities || []).forEach(a => timeline.push({ at: a.createdAt, label: 'فعالیت', text: a.note || '', nav: null }));
    (d.calls || []).forEach(x => timeline.push({ at: x.createdAt, label: 'تماس', text: x.result || '', nav: null }));
    (d.tasks || []).forEach(x => timeline.push({ at: x.doneAt || x.createdAt, label: 'کار', text: x.title + (x.status === 'done' ? ' (انجام‌شده)' : ' (باز)'), nav: null }));
    (d.followups || []).forEach(x => timeline.push({ at: x.doneAt || x.createdAt, label: 'پیگیری', text: x.title + ' — ' + (x.status === 'done' ? 'انجام‌شده' : x.status === 'open' ? 'باز' : 'لغو'), nav: null }));
    (d.appointments || []).forEach(x => timeline.push({ at: x.createdAt, label: 'قرار', text: x.title + ' — ' + dateTimeFa(x.datetime), nav: null }));
    (d.orders || []).forEach(x => timeline.push({ at: x.createdAt, label: 'سفارش', text: x.number + ' — ' + fmt(x.total), nav: 'order/' + x.id }));
    timeline.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

    let h = '<div class="profile-card"><div class="profile-top">' +
      '<div class="avatar">' + esc((c.name || '؟').charAt(0)) + '</div>' +
      '<div class="who"><h2>' + esc(c.name) + '</h2>' +
      '<div class="sub">' + esc(c.phone || 'بدون تلفن') + (c.email ? ' — ' + esc(c.email) : '') + '</div></div></div>' +
      '<div class="profile-meta">' +
      '<div class="mrow"><span class="mk">وضعیت</span><span class="mv">' + (st ? esc(st.name) : '—') + (c.archived ? ' (آرشیو)' : '') + '</span></div>' +
      '<div class="mrow"><span class="mk">شرکت</span><span class="mv">' + (comp ? esc(comp.name) : '—') + '</span></div>' +
      '<div class="mrow"><span class="mk">تاریخ ایجاد</span><span class="mv">' + dateFa(c.createdAt) + '</span></div>' +
      '<div class="mrow"><span class="mk">آخرین فعالیت</span><span class="mv">' + (c.lastActivityAt ? dateFa(c.lastActivityAt) : '—') + '</span></div>' +
      ((c.tags || []).length ? '<div class="mrow"><span class="mk">برچسب‌ها</span><span class="mv">' +
        c.tags.map(t => { const tg = tagsAll.find(x => x.id === t); return tg ? esc(tg.name) : ''; }).filter(Boolean).join('، ') + '</span></div>' : '') +
      '</div></div>';

    // sales summary cards (real data)
    h += '<div class="stat-cards two">' +
      '<div class="stat"><div class="v v-anim">' + fmt(dealsValue) + '</div><div class="l">ارزش فرصت‌های فروش</div></div>' +
      '<div class="stat"><div class="v v-anim">' + fmt(ordersTotal) + '</div><div class="l">مجموع سفارش‌ها (تومان)</div></div></div>';

    // quick actions — all wired to existing modals/services
    h += '<div class="c360-grid">' +
      '<button id="c3-call">تماس</button>' +
      '<button id="c3-task">کار</button>' +
      '<button id="c3-fu">پیگیری</button>' +
      '<button id="c3-appt">قرار</button>' +
      '<button id="c3-deal">فرصت فروش</button>' +
      '<button id="c3-order">سفارش</button>' +
      '<button id="c3-note">یادداشت</button>' +
      (typeof attachSection === 'function' ? '<button id="c3-att-scroll">پیوست‌ها</button>' : '') +
      '</div>';
    h += '<div class="btn-row"><button class="btn small" id="c3-edit">ویرایش</button>' +
      '<button class="btn small ghost" id="c3-lead">تبدیل به سرنخ فروش</button>' +
      '<button class="btn small secondary" id="c3-arch">' + (c.archived ? 'خروج از آرشیو' : 'آرشیو') + '</button>' +
      '<button class="btn small danger" id="c3-del">حذف دائمی</button></div>';

    // AI-powered customer summary — wired to the existing AIService.summarizeCustomer(id)
    h += '<div class="card" id="c3-ai-card">' +
      '<div class="section-title">خلاصه هوشمند (AI)</div>' +
      '<button class="btn small" id="c3-ai-btn">دریافت خلاصه</button>' +
      '<div id="c3-ai-result" style="margin-top:.6rem"></div>' +
      '</div>';

    h += secList('سرنخ‌های فروش مرتبط', d.leads, x => '<div class="list-item"><div><b>' + esc(x.name) + '</b><br><span class="muted">' + esc(x.phone || '') + (x.source ? ' — منبع: ' + esc(x.source) : '') + '</span></div>' + badge(x.customerId ? 'تبدیل‌شده' : 'باز', x.customerId ? 'info' : '') + '</div>');
    h += secList('فرصت‌های فروش', d.deals, x => '<div class="list-item" data-nav="deal/' + x.id + '"><div><b>' + esc(x.title) + '</b><br><span class="muted">' + (x.status === 'won' ? 'برده‌شده' : x.status === 'lost' ? 'باخته' : 'باز') + (x.expectedCloseDate ? ' — فروش مورد انتظار: ' + dateFa(x.expectedCloseDate) : '') + '</span></div><span class="muted"><b>' + fmt(x.value) + '</b></span></div>');
    h += secList('سفارش‌ها', d.orders, o => '<div class="list-item" data-nav="order/' + o.id + '"><div><b>' + esc(o.number) + '</b><br><span class="muted">' + esc(o.status) + ' — ' + dateFa(o.createdAt) + '</span></div><span class="muted"><b>' + fmt(o.total) + '</b></span></div>');
    h += secList('پروژه‌های مرتبط', d.projects, x => '<div class="list-item" data-nav="project/' + x.id + '"><div><b>' + esc(x.name) + '</b></div><span class="muted">' + esc(x.status) + '</span></div>');
    h += secList('تماس‌ها', d.calls, x => '<div class="list-item"><div><b>' + esc(x.result || 'بدون نتیجه') + '</b>' + (x.nextCallDate ? '<br><span class="muted">تماس بعدی: ' + dateFa(x.nextCallDate) + '</span>' : '') + '</div><span class="muted">' + dateTimeFa(x.createdAt) + '</span></div>');
    h += secList('کارها', d.tasks, x => '<div class="list-item"><div><b>' + esc(x.title) + '</b></div><span class="muted">' + (x.dueDate ? dateFa(x.dueDate) : '—') + '</span></div>');
    h += secList('پیگیری‌ها', d.followups, x => '<div class="list-item"><div><b>' + esc(x.title) + '</b></div><span class="muted">' + (x.dueDate ? dateFa(x.dueDate) : '—') + ' — ' + esc(x.status) + '</span></div>');
    h += secList('قرارها', d.appointments, x => '<div class="list-item"><div><b>' + esc(x.title) + '</b></div><span class="muted">' + dateTimeFa(x.datetime) + '</span></div>');
    if (cfFields.length) h += secTitle('فیلدهای سفارشی') + '<div class="card">' +
      cfFields.map(f => '<div class="list-item"><span>' + esc(f.label) + '</span><span class="muted">' + esc(f.type === 'boolean' ? (cfMap[f.id] === true ? 'بله' : cfMap[f.id] === false ? 'خیر' : '—') : Array.isArray(cfMap[f.id]) ? cfMap[f.id].join('، ') : (cfMap[f.id] == null ? '—' : cfMap[f.id])) + '</span></div>').join('') + '</div>';

    h += secTitle('خط زمانی (Timeline)', timeline.length) + '<div class="card">' +
      (timeline.length ? timeline.slice(0, 60).map(t =>
        '<div class="timeline-item"' + (t.nav ? ' data-nav="' + t.nav + '" style="cursor:pointer"' : '') + '><b>' + esc(t.label) + '</b> — ' + esc(t.text) +
        '<br><span class="muted">' + dateTimeFa(t.at) + '</span></div>').join('') : '<div class="muted">فعالیتی ثبت نشده است</div>') + '</div>';

    if (typeof attachSection === 'function') h += attachSection('customer', id);

    setTimeout(function () {
      $('#c3-call').onclick = function () { openCallForm(id); };
      $('#c3-task').onclick = function () { openTaskForm('customer', id); };
      $('#c3-fu').onclick = function () { openFollowupForm(id); };
      $('#c3-appt').onclick = function () { openAppointmentForm(id); };
      $('#c3-deal').onclick = function () { openDealForm(id); };
      $('#c3-order').onclick = function () { openOrderForm(id); };
      $('#c3-note').onclick = function () { openCustomerNoteForm(id); };
      var sc = $('#c3-att-scroll');
      if (sc) sc.onclick = function () {
        var el = $('[id^="att-customer-"]');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      };
      var aiBtn = $('#c3-ai-btn');
      if (aiBtn) aiBtn.onclick = function () {
        guard(aiBtn, async function () {
          var box = $('#c3-ai-result');
          if (box) box.innerHTML = '<div class="muted">در حال دریافت خلاصه…</div>';
          if (typeof AIService === 'undefined' || !AIService.summarizeCustomer) {
            if (box) box.innerHTML = '<div class="error-text">قابلیت خلاصه هوشمند در دسترس نیست.</div>';
            return;
          }
          var res = await AIService.summarizeCustomer(id);
          if (!box) return;
          if (res && res.ok && res.text) {
            box.innerHTML = '<div>' + esc(res.text).replace(/\n/g, '<br>') + '</div>';
          } else {
            box.innerHTML = '<div class="error-text">' + esc(c3AiErrorMessage(res && res.error)) + '</div>';
          }
        });
      };
      $('#c3-edit').onclick = function () { openCustomerForm(c); };
      $('#c3-lead').onclick = function () { guard($('#c3-lead'), async function () { await CustomerService.convertToLead(id, {}); toast('سرنخ فروش ایجاد شد', 'ok'); render(id); }); };
      $('#c3-arch').onclick = function () { guard($('#c3-arch'), async function () { await CustomerService.archive(id, !c.archived); toast(c.archived ? 'از آرشیو خارج شد' : 'آرشیو شد', 'ok'); render(id); }); };
      $('#c3-del').onclick = function () {
        confirmDlg('حذف دائمی مشتری؟ در صورت وجود رکورد وابسته، حذف رد می‌شود.', function () {
          guard($('#c3-del'), async function () { await CustomerService.deleteHard(id); toast('حذف شد', 'ok'); navigate('customers'); });
        });
      };
    }, 0);
    return h;
  };
})();

// Maps AIGateway/AIService error codes to a short, user-facing Persian message
// for the "خلاصه هوشمند (AI)" card. Purely presentational — does not add any
// new AI capability or touch the gateway itself.
function c3AiErrorMessage(code) {
  var map = {
    AI_DISABLED: 'قابلیت هوش مصنوعی در حال حاضر غیرفعال است.',
    GATEWAY_NOT_CONFIGURED: 'اتصال به سرویس هوش مصنوعی هنوز تنظیم نشده است.',
    TIMEOUT: 'دریافت خلاصه بیش از حد طول کشید. دوباره تلاش کنید.',
    NETWORK_ERROR: 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.',
    UNAUTHORIZED: 'دسترسی به سرویس هوش مصنوعی مجاز نیست.',
    FORBIDDEN: 'دسترسی به سرویس هوش مصنوعی مجاز نیست.',
    INVALID_REQUEST: 'درخواست نامعتبر بود.',
    RATE_LIMIT: 'تعداد درخواست‌ها زیاد بوده است. کمی بعد دوباره تلاش کنید.',
    EMPTY_RESPONSE: 'پاسخی از سرویس هوش مصنوعی دریافت نشد.',
    INVALID_RESPONSE: 'پاسخ نامعتبر از سرویس هوش مصنوعی دریافت شد.',
    UPSTREAM_ERROR: 'سرویس هوش مصنوعی موقتاً در دسترس نیست.',
  };
  return (code && map[code]) || 'دریافت خلاصه با خطا مواجه شد. دوباره تلاش کنید.';
}

// real note activity — stored in the existing activities store via Repo.logActivity
function openCustomerNoteForm(customerId) {
  modal('افزودن یادداشت',
    '<div><label>متن یادداشت</label><textarea id="cn-text"></textarea></div>' + formErr() +
    '<button class="btn btn-block" id="cn-save">ثبت یادداشت</button>',
    function () {
      $('#cn-save').onclick = function () {
        guard($('#cn-save'), async function () {
          const text = val('cn-text').trim();
          if (!text) throw new Error('متن یادداشت الزامی است');
          await Repo.logActivity('note', { customerId: customerId }, text);
          closeModal(); toast('یادداشت ثبت شد', 'ok'); render(customerId);
        });
      };
    });
}

// ============ manual device-contacts import (the "افزودن از مخاطبین گوشی" button) ============
// The only native call here is CRMNative.pickDeviceContacts (native.js) — the same
// single implementation the automatic first-visit flow uses (contacts-auto.js), so
// permission handling and contact reading behave identically everywhere. On success
// this opens the shared picker (CRMContactsImport.openPicker, contacts-auto.js) —
// the same search + multi-select UI used by the automatic flow — instead of a
// second, independent picker implementation.
function openDeviceContactsImport() {
  if (!window.CRMNative || !CRMNative.isNative()) {
    modal('ورود از مخاطبین گوشی',
      '<p class="muted">این قابلیت فقط در نسخه اندروید (نصب‌شده روی گوشی) در دسترس است. در مرورگر، مخاطبین را به‌صورت دستی یا از طریق ورود فایل اضافه کنید.</p>' +
      '<button class="btn btn-block" id="dci-close">متوجه شدم</button>',
      function () { $('#dci-close').onclick = closeModal; });
    return;
  }
  modal('ورود از مخاطبین گوشی', '<div class="page-loading">در حال خواندن مخاطبین گوشی…</div>');
  // The step runs directly here (own try/catch), not via guard(btn, fn), because
  // there is no real button element while this loading modal is open — guard()
  // would silently do nothing with a falsy target and the modal would spin forever.
  (async function () {
    let r;
    try {
      r = await CRMNative.pickDeviceContacts();
    } catch (e) {
      closeModal();
      toast('خطای غیرمنتظره: ' + (e && e.message ? e.message : 'نامشخص'), 'err');
      return;
    }
    closeModal();
    if (!r.ok) { toast(r.error, 'err'); return; }
    const list = r.contacts || [];
    if (!list.length) { toast('مخاطب قابل ورود یافت نشد', 'warn'); return; }
    const fresh = list.filter(c => !c.existsInCrm);
    const existing = list.length - fresh.length;
    if (!fresh.length) { toast('همه ' + fmt(list.length) + ' مخاطب گوشی از قبل در سامانه موجودند', 'info'); return; }
    window.CRMContactsImport.openPicker(fresh, existing);
  })();
}
// keep the same entry point the contacts-page button uses
window.openDeviceContactsImport = openDeviceContactsImport;