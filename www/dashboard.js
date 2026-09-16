// dashboard.js — PHASE 3: executive dashboard + professional empty states.
// Purely additive UI layer: overrides the global emptyState() renderer and the
// Routes.today route. All data comes from the real services
// (DashboardService.today, Repo.list); every button is wired to the existing
// services/modals. No fake data, no dead buttons, no service changes.
/* global Routes, Repo, DB, DashboardService, FollowUpService, TaskService, num, Dates, $, app, fmt, esc,
   dateFa, dateTimeFa, badge, secTitle, hbar, toast, render, navigate, guard, activityLabel,
   openCustomerForm, openLeadForm, openDealForm, openCallForm, openTaskDetail, CustomerService, DealService */

// ============ Professional empty state (global override) ============
// Same signature as app.js: emptyState(text, actionLabel, actionId, title)
var _epIcons = {
  customers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
  deals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  generic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
};
function emptyState(text, actionLabel, actionId, title, icon) {
  var ic = _epIcons[icon] || _epIcons.generic;
  return '<div class="empty-pro"><div class="ep-icon">' + ic + '</div>' +
    (title ? '<h3>' + esc(title) + '</h3>' : '') +
    '<p>' + esc(text) + '</p>' +
    (actionLabel ? '<button class="btn" id="' + actionId + '">' + esc(actionLabel) + '</button>' : '') + '</div>';
}

// ============ Executive dashboard ============
Routes.today = async function () {
  const d = await DashboardService.today();
  const today = Dates.todayStr(), horizon = Dates.addDays(7);
  const [upFollowups, upTasks, openDeals, stages, customers, activities] = await Promise.all([
    Repo.list('followups', f => f.status === 'open' && f.dueDate > today && f.dueDate <= horizon),
    Repo.list('tasks', t => t.status !== 'done' && t.dueDate > today && t.dueDate <= horizon),
    Repo.list('deals', x => !x.archived && x.status === 'open'),
    Repo.list('stages'),
    Repo.list('customers'),
    Repo.list('activities'),
  ]);
  const custName = function (id) { const c = customers.find(x => x.id === id); return c ? c.name : '—'; };
  const stageName = function (id) { const s = stages.find(x => x.id === id); return s ? s.name : '—'; };
  const alertCnt = d.overdueTasks.length + d.overdueFollowups.length + d.lowStock.length + d.stalledDeals.length + d.stalledProjects.length;
  const itemCount = d.todayFollowups.length + d.todayTasks.length + d.todayAppointments.length;

  // hero: sales summary (real orders, excluding cancelled)
  let h = '<div class="dash-hero">' +
    '<div class="dh-label">خلاصه فروش (بدون سفارش‌های لغوشده)</div>' +
    '<div class="dh-value dh-anim">' + fmt(d.salesTotal) + ' تومان</div>' +
    '<div class="dh-sub">' + fmt(d.ordersCount) + ' سفارش ثبت‌شده در سامانه</div></div>';

  // KPI cards — all real
  h += '<div class="stat-cards two">' +
    '<div class="stat" data-nav="customers"><div class="v v-anim">' + fmt(d.counts.customers) + '</div><div class="l">مشتریان</div></div>' +
    '<div class="stat" data-nav="deals"><div class="v v-anim">' + fmt(d.counts.activeDeals) + '</div><div class="l">فرصت‌های فروش فعال</div></div>' +
    '<div class="stat" data-nav="tasks"><div class="v v-anim">' + fmt(itemCount) + '</div><div class="l">کارهای امروز</div></div>' +
    '<div class="stat" data-nav="followups"><div class="v v-anim ' + (d.overdueFollowups.length ? 'v-warn' : '') + '">' + fmt(d.overdueFollowups.length) + '</div><div class="l">پیگیری‌های عقب‌افتاده</div></div></div>';

  // quick access — daily-use destinations
  h += '<div class="qa-row">' +
    '<button class="qa-chip" id="qa-cust">مشتری جدید</button>' +
    '<button class="qa-chip" id="qa-deal">فرصت فروش جدید</button>' +
    '<button class="qa-chip" id="qa-call">ثبت تماس</button>' +
    '<button class="qa-chip" id="qa-fu">پیگیری جدید</button>' +
    '<button class="qa-chip" id="qa-order">سفارش جدید</button>' +
    '<button class="qa-chip" data-nav="calendar">تقویم</button>' +
    '<button class="qa-chip" data-nav="reports">گزارش‌ها</button>' +
    '<button class="qa-chip" data-nav="kpi">شاخص‌های فروش</button></div>';

  const sec = function (title, items, renderer) {
    if (!items.length) return '';
    return secTitle(title, items.length) + '<div class="card">' + items.map(renderer).join('') + '</div>';
  };

  h += sec('پیگیری‌های امروز', d.todayFollowups, f =>
    '<div class="list-item" data-nav="customer/' + f.customerId + '"><div><b>' + esc(f.title) + '</b><br><span class="muted">' + esc(custName(f.customerId)) + (f.dueTime ? ' — ' + f.dueTime : '') + '</span></div><button class="btn small" data-donefu="' + f.id + '">انجام شد</button></div>');
  h += sec('کارهای امروز', d.todayTasks, t =>
    '<div class="list-item"><div><b>' + esc(t.title) + '</b>' + (t.dueTime ? '<br><span class="muted">' + t.dueTime + '</span>' : '') + '</div><button class="btn small" data-donetask="' + t.id + '">انجام</button></div>');
  h += sec('قرارهای امروز', d.todayAppointments, a =>
    '<div class="list-item" data-nav="appointments"><div><b>' + esc(a.title) + '</b><br><span class="muted">' + esc(custName(a.customerId)) + ' — ' + dateTimeFa(a.datetime) + '</span></div></div>');

  // upcoming week
  h += sec('پیگیری‌های نزدیک (۷ روز آینده)', upFollowups, f =>
    '<div class="list-item" data-nav="customer/' + f.customerId + '"><div><b>' + esc(f.title) + '</b><br><span class="muted">' + esc(custName(f.customerId)) + '</span></div>' + badge(dateFa(f.dueDate), f.priority === 'high' ? 'danger' : '') + '</div>');
  h += sec('کارهای نزدیک (۷ روز آینده)', upTasks, t =>
    '<div class="list-item"><div><b>' + esc(t.title) + '</b></div>' + badge(dateFa(t.dueDate), t.priority === 'high' ? 'danger' : '') + '</div>');

  // pipeline status — real open deals grouped by real stages
  if (openDeals.length) {
    const byStage = {};
    for (const dl of openDeals) { if (!byStage[dl.stageId]) byStage[dl.stageId] = { n: 0, sum: 0 }; byStage[dl.stageId].n++; byStage[dl.stageId].sum += num(dl.value); }
    const maxSum = Math.max.apply(null, Object.keys(byStage).map(k => byStage[k].sum));
    h += secTitle('وضعیت فرایند فروش') + '<div class="card">' +
      Object.keys(byStage).map(sid => hbar(stageName(sid), byStage[sid].sum, maxSum, fmt(byStage[sid].n) + ' فرصت — ' + fmt(byStage[sid].sum))).join('') + '</div>';
  }

  // operational alerts — real conditions only
  if (alertCnt) {
    h += secTitle('هشدارها', alertCnt) + '<div class="card">';
    if (d.overdueTasks.length) h += '<div class="list-item" data-nav="tasks"><span>' + badge('عقب‌افتاده', 'danger') + ' کارهای عقب‌افتاده</span><span class="muted">' + fmt(d.overdueTasks.length) + '</span></div>';
    if (d.overdueFollowups.length) h += '<div class="list-item" data-nav="followups"><span>' + badge('عقب‌افتاده', 'danger') + ' پیگیری‌های عقب‌افتاده</span><span class="muted">' + fmt(d.overdueFollowups.length) + '</span></div>';
    if (d.stalledDeals.length || d.stalledProjects.length) h += '<div class="list-item" data-nav="reports"><span>' + badge('خوابیده', 'warn') + ' فرصت فروش/پروژه خوابیده</span><span class="muted">' + fmt(d.stalledDeals.length + d.stalledProjects.length) + '</span></div>';
    if (d.lowStock.length) h += '<div class="list-item" data-nav="products"><span>' + badge('موجودی کم', 'danger') + ' محصولات با موجودی کم</span><span class="muted">' + fmt(d.lowStock.length) + '</span></div>';
    h += '</div>';
  }

  // latest activities — real timeline
  h += secTitle('آخرین فعالیت‌ها') + '<div class="card">' +
    (d.recentActivities.length ? d.recentActivities.map(a =>
      '<div class="timeline-item"><b>' + esc(activityLabel(a.type)) + '</b> — ' + esc(a.note || '') +
      '<br><span class="muted">' + dateTimeFa(a.createdAt) + '</span></div>').join('')
    : '<div class="muted">فعالیتی ثبت نشده است</div>') + '</div>';

  // first-run empty state — real condition (no customers yet)
  if (!d.counts.customers && !activities.length) {
    h = '<div class="dash-hero">' +
      '<div class="dh-label">به سامانه مدیریت ارتباط با مشتری خوش آمدید</div>' +
      '<div class="dh-sub">برای شروع، اولین مشتری را ثبت کنید؛ سپس فرصت فروش، سفارش و فعالیت‌ها را اضافه کنید.</div></div>' +
      emptyState('هنوز هیچ مشتری‌ای ثبت نشده است. اولین مشتری را اضافه کنید یا از مخاطبین گوشی وارد کنید.', 'افزودن اولین مشتری', 'qa-cust-first', 'شروع کار', 'customers');
  }

  setTimeout(bindDashboard, 0);
  return h;
};
function bindDashboard() {
  document.querySelectorAll('[data-donefu]').forEach(b => b.onclick = function (e) {
    e.stopPropagation();
    guard(b, async function () { await FollowUpService.complete(b.dataset.donefu, ''); toast('پیگیری انجام شد', 'ok'); render(); });
  });
  document.querySelectorAll('[data-donetask]').forEach(b => b.onclick = function (e) {
    e.stopPropagation();
    guard(b, async function () { await TaskService.toggle(b.dataset.donetask); toast('به‌روزرسانی شد', 'ok'); render(); });
  });
  document.querySelectorAll('[data-task]').forEach(row => row.onclick = function (e) {
    if (e.target.closest('button')) return;
    openTaskDetail(row.dataset.task);
  });
  var el = $('#qa-cust'); if (el) el.onclick = function () { openCustomerForm(); };
  el = $('#qa-cust-first'); if (el) el.onclick = function () { openCustomerForm(); };
  el = $('#qa-deal'); if (el) el.onclick = function () { openDealForm(); };
  el = $('#qa-call'); if (el) el.onclick = function () { openCallForm(); };
  el = $('#qa-fu'); if (el) el.onclick = function () { openFollowupForm(); };
  el = $('#qa-order'); if (el) el.onclick = function () { openOrderForm(); };
}
// dashboard value animation
(function addHeroAnim() {
  var st = document.createElement('style');
  st.textContent = '.dh-anim{animation:vIn 400ms cubic-bezier(.2,.8,.3,1)} .v-warn{color:var(--danger)}';
  document.head.appendChild(st);
})();