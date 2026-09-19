// app.js — UI layer (layer 1). All business logic lives in services.js.
// This is PART 1 of 2. Part 2 (app-part2) must be appended at the end of this
// file so app.js is complete: continue from Routes.projects onward.
/* global Repo, DB, CustomerService, CompanyService, ContactService, LeadService, DealService,
   ProjectService, PipelineService, CallService, FollowUpService, TaskService, AppointmentService,
   NotifService, ProductService, OrderService, AutomationService, DashboardService, CalendarService,
   SearchService, CustomFieldService, num, Dates, AIService */
var $ = function (sel) { return document.querySelector(sel); };
var app = $('#app');
var fmt = function (n) { return Number(n || 0).toLocaleString('fa-IR'); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var dateFa = function (iso) { return iso ? new Date(iso).toLocaleDateString('fa-IR') : '—'; };
var dateTimeFa = function (iso) { return iso ? new Date(iso).toLocaleString('fa-IR') : '—'; };
var enterCls = function (i) { return 'enter enter-' + (Math.min(i, 6) + 1); };
function toast(msg, type) {
  var root = $('#toast-root');
  var el = document.createElement('div');
  el.className = 'toast ' + (type === true ? 'err' : (type || ''));
  el.setAttribute('role', 'status');
  el.textContent = msg;
  root.appendChild(el);
  while (root.children.length > 2) root.removeChild(root.firstChild);
  setTimeout(function () { el.classList.add('out'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200); }, 2800);
}
var _modalOpenCount = 0;
function modal(title, bodyHTML, onOpen) {
  var root = $('#modal-root');
  root.innerHTML = '<div class="overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
    '<div class="grab"></div>' +
    '<div class="row" style="margin-bottom:.7rem"><h3>' + esc(title) + '</h3>' +
    '<button class="btn small secondary" id="modal-close">بستن</button></div>' +
    '<div id="modal-body">' + bodyHTML + '</div></div></div>';
  document.body.classList.add('no-scroll');
  _modalOpenCount++;
  history.pushState({ modal: true }, '');
  $('#modal-close').onclick = closeModal;
  root.querySelector('.overlay').onclick = function (e) { if (e.target.classList.contains('overlay')) closeModal(); };
  if (onOpen) onOpen($('#modal-body'));
}
function closeModal(instant) {
  var root = $('#modal-root');
  if (!root.innerHTML) return;
  var finish = function () { root.innerHTML = ''; document.body.classList.remove('no-scroll'); _modalOpenCount = Math.max(0, _modalOpenCount - 1); };
  if (instant) { finish(); return; }
  var ov = root.querySelector('.overlay'), m = root.querySelector('.modal');
  if (ov && m) { ov.classList.add('closing'); m.classList.add('closing'); setTimeout(finish, 170); } else finish();
}
window.onpopstate = function (e) {
  if (_modalOpenCount > 0 && (!e.state || e.state.modal)) { closeModal(true); return; }
  var parts = (location.hash.slice(1) || 'today').split('/');
  currentRoute = parts[0];
  render(parts[1] ? decodeURIComponent(parts[1]) : '', 'back');
};
function confirmDlg(msg, onYes) { if (confirm(msg)) onYes(); }
function errMsg(e) { return e && e.message ? e.message : 'خطای غیرمنتظره رخ داد'; }
function emptyState(text, actionLabel, actionId, title) {
  return '<div class="empty"><h3>' + esc(title || '') + '</h3><p>' + esc(text) + '</p>' +
    (actionLabel ? '<button class="btn" id="' + actionId + '">' + esc(actionLabel) + '</button>' : '') + '</div>';
}
function field(label, inputHTML) { return '<div><label>' + esc(label) + '</label>' + inputHTML + '</div>'; }
function formErr() { return '<div class="error-text" id="form-err" hidden></div>'; }
function showErr(e) { var el = $('#form-err'); if (el) { el.textContent = errMsg(e); el.hidden = false; } else toast(errMsg(e), 'err'); }
function badge(text, cls) { return '<span class="badge ' + (cls || '') + '">' + esc(text) + '</span>'; }
function val(id) { var el = $('#' + id); return el ? el.value : ''; }
function secTitle(title, count) { return '<div class="section-title">' + esc(title) + (count != null ? ' <span class="count">(' + fmt(count) + ')</span>' : '') + '</div>'; }
function secList(title, items, renderer, emptyMsg) {
  if (!items || !items.length) return emptyMsg ? secTitle(title) + '<div class="card"><div class="muted">' + esc(emptyMsg) + '</div></div>' : '';
  return secTitle(title, items.length) + '<div class="card">' + items.map(renderer).join('') + '</div>';
}
function hbar(label, value, max, valueText) {
  var pct = max > 0 ? Math.round(value * 100 / max) : 0;
  return '<div class="hbar"><div class="hb-top"><span>' + esc(label) + '</span><span class="muted">' + esc(valueText || fmt(value)) + '</span></div><div class="hb-track"><div class="hb-fill" style="width:' + pct + '%"></div></div></div>';
}
async function guard(btn, fn) {
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('loading');
  try { await fn(); }
  catch (e) { showErr(e); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
}
var Routes = {};
var TITLES = { today: 'امروز', customers: 'مشتریان', customer: 'مشتری', contacts: 'مخاطبین', leads: 'سرنخ‌ها', deals: 'Dealها', deal: 'Deal', projects: 'پروژه‌ها', project: 'پروژه', tasks: 'کارها', calendar: 'تقویم', products: 'محصولات', product: 'محصول', orders: 'سفارش‌ها', order: 'سفارش', calls: 'تماس‌ها', followups: 'پیگیری‌ها', appointments: 'قرارها', reports: 'گزارش‌ها', settings: 'تنظیمات', pipelines: 'Pipelineها', customfields: 'فیلدهای سفارشی', companies: 'شرکت‌ها', company: 'شرکت', more: 'بیشتر' };
var currentRoute = 'today';
function navigate(route, param) {
  currentRoute = route;
  history.pushState({ route: route, param: param }, '', '#' + route + (param ? '/' + param : ''));
  render(param, 'fwd');
}
async function render(param, dir) {
  document.querySelectorAll('#tabbar button').forEach(function (b) {
    var mainRoutes = ['today', 'customers', 'deals', 'tasks'];
    b.classList.toggle('active', b.dataset.route === currentRoute || (b.dataset.route === 'more' && mainRoutes.indexOf(currentRoute) === -1));
  });
  $('#btn-back').hidden = !param;
  $('#screen-title').textContent = TITLES[currentRoute] || currentRoute;
  var p = param || (location.hash.split('/')[1] ? decodeURIComponent(location.hash.split('/')[1]) : '');
  app.className = dir === 'back' ? 'page-back' : 'page-fwd';
  app.innerHTML = '<div class="sk-page"><div class="card"><div class="skeleton" style="height:1.2rem;width:40%"></div><div class="skeleton" style="height:.8rem;width:70%;margin-top:.5rem"></div></div><div class="card"><div class="skeleton" style="height:1rem;width:55%"></div><div class="skeleton" style="height:.8rem;width:85%;margin-top:.5rem"></div></div></div>';
  try {
    await Repo.ensureDefaults();
    await AutomationService.runStalledCheck();
    var fn = Routes[currentRoute];
    if (!fn) { app.innerHTML = emptyState('این مسیر وجود ندارد', 'بازگشت به امروز', 'go-today', 'صفحه یافت نشد'); bindGoToday(); return; }
    app.innerHTML = await fn(p);
    window.scrollTo(0, 0);
  } catch (e) {
    app.innerHTML = emptyState('خطا در بارگذاری صفحه: ' + errMsg(e), 'تلاش مجدد', 'go-today', 'خطا');
    bindGoToday();
    console.error(e);
  }
}
function bindGoToday() { var b = $('#go-today'); if (b) b.onclick = function () { navigate('today'); }; }
$('#tabbar').onclick = function (e) { var b = e.target.closest('button'); if (b) navigate(b.dataset.route); };
$('#btn-back').onclick = function () { history.back(); };
document.addEventListener('click', function (e) {
  var nav = e.target.closest('[data-nav]');
  if (nav && nav.dataset.nav) {
    var parts = nav.dataset.nav.split('/');
    navigate(parts[0], parts[1] || undefined);
  }
});
$('#btn-search').onclick = function () { var sb = $('#searchbar'); sb.hidden = !sb.hidden; if (!sb.hidden) $('#global-search').focus(); };
(function buildSearchBar() {
  var inp = $('#global-search');
  var row = document.createElement('div');
  row.className = 'search-row';
  inp.parentNode.insertBefore(row, inp);
  row.appendChild(inp);
  var clr = document.createElement('button');
  clr.id = 'search-clear';
  clr.type = 'button';
  clr.setAttribute('aria-label', 'پاک کردن جستجو');
  clr.textContent = '\u00D7';
  row.appendChild(clr);
  clr.onclick = function () { inp.value = ''; $('#search-results').innerHTML = ''; clr.classList.remove('show'); inp.focus(); };
})();
var searchTimer = null;
$('#global-search').addEventListener('input', function (e) {
  clearTimeout(searchTimer);
  var q = e.target.value;
  $('#search-clear').classList.toggle('show', q.length > 0);
  searchTimer = setTimeout(async function () {
    var box = $('#search-results');
    if (!q || q.trim().length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="search-status">در حال جستجو…</div>';
    try {
      var r = await SearchService.global(q);
      var html = '';
      var sec = function (title, items, route) {
        if (!items.length) return '';
        return secTitle(title) + items.slice(0, 5).map(function (x) {
          return '<div class="list-item" data-nav="' + route + '/' + x.id + '"><span>' + esc(x.name || x.title) + '</span></div>';
        }).join('');
      };
      html += sec('مشتریان', r.customers, 'customer');
      html += sec('شرکت‌ها', r.companies, 'company');
      html += sec('Dealها', r.deals.map(d => Object.assign({ name: d.title }, d)), 'deal');
      html += sec('پروژه‌ها', r.projects, 'project');
      if (r.leads.length) html += secTitle('Leadها', r.leads.length) + '<div class="card">' + r.leads.slice(0, 5).map(l => '<div class="list-item"><span>' + esc(l.name) + '</span><span class="muted">' + esc(l.phone || '') + '</span></div>').join('') + '</div>';
      if (r.products.length) html += secTitle('محصولات') + '<div class="card">' + r.products.slice(0, 5).map(p => '<div class="list-item" data-nav="product/' + p.id + '"><span>' + esc(p.name) + '</span></div>').join('') + '</div>';
      if (r.orders.length) html += secTitle('سفارش‌ها') + '<div class="card">' + r.orders.slice(0, 5).map(o => '<div class="list-item" data-nav="order/' + o.id + '"><span>' + esc(o.number) + '</span><span class="muted">' + fmt(o.total) + '</span></div>').join('') + '</div>';
      box.innerHTML = html || '<div class="search-status">نتیجه‌ای برای «' + esc(q.trim()) + '» یافت نشد</div>';
    } catch (err) { box.innerHTML = '<div class="error-text">' + esc(errMsg(err)) + '</div>'; }
  }, 250);
});
async function customerOptions(selectedId) {
  const cs = await Repo.list('customers', c => !c.archived);
  cs.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  return '<option value="">— انتخاب مشتری —</option>' + cs.map(c => '<option value="' + c.id + '" ' + (c.id === selectedId ? 'selected' : '') + '>' + esc(c.name) + '</option>').join('');
}
async function productOptions(selectedId) {
  const ps = await Repo.list('products', p => !p.archived);
  return '<option value="">— انتخاب محصول —</option>' + ps.map(p => '<option value="' + p.id + '" ' + (p.id === selectedId ? 'selected' : '') + '>' + esc(p.name) + ' (' + fmt(p.price) + ')</option>').join('');
}
async function pipelineStageSelects(pipelineId, stageId) {
  const pipelines = await Repo.list('pipelines');
  const stages = await Repo.list('stages', s => s.pipelineId === pipelineId);
  stages.sort((a, b) => a.order - b.order);
  return field('Pipeline', '<select id="d-pipeline">' + pipelines.map(p => '<option value="' + p.id + '" ' + (p.id === pipelineId ? 'selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>') +
    field('مرحله', '<select id="d-stage">' + stages.map(s => '<option value="' + s.id + '" ' + (s.id === stageId ? 'selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>');
}
function bindPipelineStageSync() {
  const pl = $('#d-pipeline'), st = $('#d-stage');
  if (pl && st) pl.onchange = async function () {
    const stages = await Repo.list('stages', s => s.pipelineId === pl.value);
    stages.sort((a, b) => a.order - b.order);
    st.innerHTML = stages.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');
  };
}
async function renderCustomFieldInputs(entityType, entityId, containerId) {
  const fields = await CustomFieldService.fieldsFor(entityType);
  const container = $('#' + containerId);
  if (!container) return;
  if (!fields.length) { container.innerHTML = '<span class="muted">فیلد سفارشی تعریف نشده (از منوی بیشتر، بخش فیلدهای سفارشی اضافه کنید)</span>'; return; }
  const values = entityId ? await CustomFieldService.getValuesMap(entityType, entityId) : {};
  container.innerHTML = fields.map(f => {
    const v = values[f.id];
    const id = 'cf-' + f.id;
    let input = '';
    if (f.type === 'text' || f.type === 'phone' || f.type === 'email') input = '<input id="' + id + '" type="' + f.type + '" value="' + esc(v || '') + '">';
    else if (f.type === 'number') input = '<input id="' + id + '" type="number" step="any" value="' + esc(v == null ? '' : v) + '">';
    else if (f.type === 'date') input = '<input id="' + id + '" type="date" value="' + esc(v || '') + '">';
    else if (f.type === 'boolean') input = '<select id="' + id + '"><option value="">—</option><option value="true" ' + (v === true ? 'selected' : '') + '>بله</option><option value="false" ' + (v === false ? 'selected' : '') + '>خیر</option></select>';
    else if (f.type === 'select') input = '<select id="' + id + '"><option value="">—</option>' + (f.options || []).map(o => '<option ' + (v === o ? 'selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
    else if (f.type === 'multiselect') input = '<div class="chips">' + (f.options || []).map(o => '<span class="badge ' + (Array.isArray(v) && v.indexOf(o) !== -1 ? 'selected' : '') + '" data-cfms="' + f.id + '" data-opt="' + esc(o) + '">' + esc(o) + '</span>').join('') + '</div><input type="hidden" id="' + id + '">';
    return field(f.label + ' (' + CustomFieldService.TYPE_LABELS[f.type] + ')', input);
  }).join('');
  container.querySelectorAll('[data-cfms]').forEach(ch => { ch.onclick = function () { ch.classList.toggle('selected'); }; });
}
function collectCustomFieldValues(containerId) {
  const map = {};
  document.querySelectorAll('#' + containerId + ' [id^="cf-"]').forEach(el => {
    const fid = el.id.slice(3);
    if (el.type === 'hidden') {
      const sel = [];
      document.querySelectorAll('[data-cfms="' + fid + '"].selected').forEach(ch => sel.push(ch.dataset.opt));
      map[fid] = sel;
    } else if (el.tagName === 'SELECT' && el.value === 'true') map[fid] = true;
    else if (el.tagName === 'SELECT' && el.value === 'false') map[fid] = false;
    else map[fid] = el.value;
  });
  return map;
}
async function saveCustomFields(entityType, entityId, containerId) {
  await CustomFieldService.setValues(entityType, entityId, collectCustomFieldValues(containerId));
}
function activityLabel(t) {
  const map = { customer_created: 'ایجاد مشتری', customer_updated: 'ویرایش مشتری', contact_created: 'افزودن مخاطب', lead_created: 'ایجاد Lead', lead_updated: 'ویرایش Lead', lead_converted: 'تبدیل Lead', convert_lead: 'تبدیل به Lead', deal_created: 'ایجاد Deal', deal_stage: 'تغییر مرحله Deal', project_created: 'ایجاد پروژه', call: 'تماس', followup_created: 'ثبت پیگیری', followup_done: 'انجام پیگیری', task_created: 'ایجاد کار', task_done: 'انجام کار', order: 'سفارش', appointment: 'قرار', note: 'یادداشت' };
  return map[t] || t;
}
Routes.today = async function () {
  const d = await DashboardService.today();
  const today = Dates.todayStr(), horizon = Dates.addDays(7);
  const [upFollowups, upTasks, upAppointments, openDeals, stages, customers, lastOrders] = await Promise.all([
    Repo.list('followups', f => f.status === 'open' && f.dueDate > today && f.dueDate <= horizon),
    Repo.list('tasks', t => t.status !== 'done' && t.dueDate > today && t.dueDate <= horizon),
    Repo.list('appointments', a => a.status !== 'cancelled' && a.datetime && a.datetime.slice(0, 10) > today && a.datetime.slice(0, 10) <= horizon),
    Repo.list('deals', x => !x.archived && x.status === 'open'),
    Repo.list('stages'),
    Repo.list('customers'),
    Repo.list('orders'),
  ]);
  const custName = function (id) { const c = customers.find(x => x.id === id); return c ? c.name : '—'; };
  const stageName = function (id) { const s = stages.find(x => x.id === id); return s ? s.name : '—'; };
  const topDeals = openDeals.slice().sort((a, b) => num(b.value) - num(a.value)).slice(0, 5);
  const lastOrdersSorted = lastOrders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const alertCnt = d.overdueTasks.length + d.overdueFollowups.length + d.lowStock.length + d.stalledDeals.length + d.stalledProjects.length;
  let h = '<div class="stat-cards two">' +
    '<div class="stat" data-nav="deals"><div class="v v-anim">' + fmt(d.counts.activeDeals) + '</div><div class="l">Deal فعال</div></div>' +
    '<div class="stat" data-nav="followups"><div class="v v-anim">' + fmt(d.todayFollowups.length + d.todayTasks.length + d.todayAppointments.length) + '</div><div class="l">موارد امروز</div></div>' +
    '<div class="stat" data-nav="customers"><div class="v v-anim">' + fmt(d.counts.customers) + '</div><div class="l">مشتریان</div></div>' +
    '<div class="stat" data-nav="orders"><div class="v v-anim">' + fmt(d.salesTotal) + '</div><div class="l">فروش کل (تومان)</div></div></div>';
  const sec = function (title, items, renderer) {
    if (!items.length) return '';
    return secTitle(title, items.length) + '<div class="card">' + items.map(renderer).join('') + '</div>';
  };
  h += sec('پیگیری‌های امروز', d.todayFollowups, f => '<div class="list-item" data-nav="customer/' + f.customerId + '"><div><b>' + esc(f.title) + '</b><br><span class="muted">' + esc(custName(f.customerId)) + ' — ' + (f.dueTime || '') + '</span></div><button class="btn small" data-donefu="' + f.id + '">انجام شد</button></div>');
  h += sec('کارهای امروز', d.todayTasks, t => '<div class="list-item" data-task="' + t.id + '"><div><b>' + esc(t.title) + '</b><br><span class="muted">' + (t.dueTime || '') + '</span></div><button class="btn small" data-donetask="' + t.id + '">انجام</button></div>');
  h += sec('قرارهای امروز', d.todayAppointments, a => '<div class="list-item" data-nav="appointments"><div><b>' + esc(a.title) + '</b><br><span class="muted">' + esc(custName(a.customerId)) + ' — ' + dateTimeFa(a.datetime) + '</span></div></div>');
  h += sec('پیگیری‌های نزدیک (۷ روز آینده)', upFollowups, f => '<div class="list-item" data-nav="customer/' + f.customerId + '"><div><b>' + esc(f.title) + '</b><br><span class="muted">' + esc(custName(f.customerId)) + '</span></div>' + badge(dateFa(f.dueDate), f.priority === 'high' ? 'danger' : '') + '</div>');
  h += sec('کارهای نزدیک (۷ روز آینده)', upTasks, t => '<div class="list-item" data-task="' + t.id + '"><div><b>' + esc(t.title) + '</b></div>' + badge(dateFa(t.dueDate), t.priority === 'high' ? 'danger' : '') + '</div>');
  h += sec('قرارهای نزدیک (۷ روز آینده)', upAppointments, a => '<div class="list-item" data-nav="appointments"><div><b>' + esc(a.title) + '</b><br><span class="muted">' + esc(custName(a.customerId)) + '</span></div>' + badge(dateFa(a.datetime)) + '</div>');
  h += sec('Dealهای مهم (بیشترین ارزش)', topDeals, x => '<div class="list-item" data-nav="deal/' + x.id + '"><div><b>' + esc(x.title) + '</b><br><span class="muted">' + esc(custName(x.customerId)) + ' — ' + esc(stageName(x.stageId)) + '</span></div><span class="muted"><b>' + fmt(x.value) + '</b></span></div>');
  if (openDeals.length) {
    const byStage = {};
    for (const dl of openDeals) { if (!byStage[dl.stageId]) byStage[dl.stageId] = { n: 0, sum: 0 }; byStage[dl.stageId].n++; byStage[dl.stageId].sum += num(dl.value); }
    const maxSum = Math.max.apply(null, Object.keys(byStage).map(k => byStage[k].sum));
    h += secTitle('وضعیت Pipeline') + '<div class="card">' + Object.keys(byStage).map(sid => hbar(stageName(sid), byStage[sid].sum, maxSum, fmt(byStage[sid].n) + ' Deal — ' + fmt(byStage[sid].sum))).join('') + '</div>';
  }
  h += secTitle('سفارش‌ها') + '<div class="card">' +
    '<div class="list-item" data-nav="orders"><span>تعداد سفارش</span><span class="muted">' + fmt(d.ordersCount) + '</span></div>' +
    '<div class="list-item" data-nav="orders"><span>فروش کل (بدون لغوشده)</span><span class="muted">' + fmt(d.salesTotal) + '</span></div>' +
    (lastOrdersSorted.length ? lastOrdersSorted.map(o => '<div class="list-item" data-nav="order/' + o.id + '"><span>' + esc(o.number) + ' — ' + esc(custName(o.customerId)) + '</span><span class="muted">' + fmt(o.total) + '</span></div>').join('') : '') + '</div>';
  if (alertCnt) {
    h += secTitle('هشدارها', alertCnt) + '<div class="card">';
    if (d.overdueTasks.length) h += '<div class="list-item" data-nav="tasks"><span>' + badge('عقب‌افتاده', 'danger') + ' کارهای عقب‌افتاده</span><span class="muted">' + fmt(d.overdueTasks.length) + '</span></div>';
    if (d.overdueFollowups.length) h += '<div class="list-item" data-nav="followups"><span>' + badge('عقب‌افتاده', 'danger') + ' پیگیری‌های عقب‌افتاده</span><span class="muted">' + fmt(d.overdueFollowups.length) + '</span></div>';
    if (d.stalledDeals.length || d.stalledProjects.length) h += '<div class="list-item" data-nav="reports"><span>' + badge('خوابیده', 'warn') + ' Deal/پروژه خوابیده</span><span class="muted">' + fmt(d.stalledDeals.length + d.stalledProjects.length) + '</span></div>';
    if (d.lowStock.length) h += '<div class="list-item" data-nav="products"><span>' + badge('موجودی کم', 'danger') + ' محصولات با موجودی کم</span><span class="muted">' + fmt(d.lowStock.length) + '</span></div>';
    h += '</div>';
  }
  h += '<div class="card"><div class="card-head"><h3>اقدام سریع</h3></div><div class="action-grid" style="grid-template-columns:repeat(2,1fr)">' +
    '<button id="qa-cust">مشتری جدید</button><button id="qa-lead">Lead جدید</button><button id="qa-deal">Deal جدید</button><button id="qa-call">ثبت تماس</button></div></div>';
  h += secTitle('فعالیت‌های اخیر') + '<div class="card">' +
    (d.recentActivities.length ? d.recentActivities.map(a => '<div class="timeline-item"><b>' + esc(activityLabel(a.type)) + '</b> — ' + esc(a.note || '') + '<br><span class="muted">' + dateTimeFa(a.createdAt) + '</span></div>').join('') : '<div class="muted">فعالیتی ثبت نشده</div>') + '</div>';
  setTimeout(bindToday, 0);
  return h;
};
function bindToday() {
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
  var qa = $('#qa-cust'); if (qa) qa.onclick = function () { openCustomerForm(); };
  qa = $('#qa-lead'); if (qa) qa.onclick = function () { openLeadForm(); };
  qa = $('#qa-deal'); if (qa) qa.onclick = function () { openDealForm(); };
  qa = $('#qa-call'); if (qa) qa.onclick = function () { openCallForm(); };
}
var FilterState = {
  customers: { q: '', status: '', tag: '', company: '', activity: '', archived: false },
  customersSort: 'activity',
  contacts: { q: '' },
  deals: { pipeline: '', stage: '', status: '', q: '', minVal: '', archived: false, view: 'list' },
  projects: { status: '', q: '', archived: false },
  products: { q: '', stock: '', archived: false },
  leads: { q: '', status: '', source: '', archived: false },
  calls: { q: '' },
  orders: { status: '', q: '' },
  followups: { status: 'open' },
};
function statusBadgeSync(statuses, id) { const s = statuses.find(x => x.id === id); return s ? badge(s.name, 'ok') : ''; }
Routes.customers = async function () {
  const all = await Repo.list('customers', c => FilterState.customers.archived ? c.archived : !c.archived);
  const companies = await Repo.list('companies');
  const statuses = await Repo.list('statuses', s => s.entityType === 'customers');
  const tags = await Repo.list('tags');
  const [openFus, openDeals] = await Promise.all([
    Repo.list('followups', f => f.status === 'open' && f.dueDate),
    Repo.list('deals', x => !x.archived && x.status === 'open' && x.customerId),
  ]);
  const nextFu = {};
  for (const f of openFus) { if (!nextFu[f.customerId] || f.dueDate < nextFu[f.customerId]) nextFu[f.customerId] = f.dueDate; }
  const firstDeal = {};
  for (const x of openDeals) { if (!firstDeal[x.customerId]) firstDeal[x.customerId] = x; }
  const f = FilterState.customers;
  let list = all;
  if (f.q) list = list.filter(c => (c.name + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase().includes(f.q.toLowerCase()));
  if (f.status) list = list.filter(c => c.statusId === f.status);
  if (f.tag) list = list.filter(c => (c.tags || []).indexOf(f.tag) !== -1);
  if (f.company) list = list.filter(c => c.companyId === f.company);
  if (f.activity) { const days = Number(f.activity); list = list.filter(c => c.lastActivityAt && Dates.daysSince(c.lastActivityAt) <= days); }
  const sort = FilterState.customersSort;
  list = list.slice().sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'fa') : sort === 'created' ? b.createdAt.localeCompare(a.createdAt) : (b.lastActivityAt || '').localeCompare(a.lastActivityAt || ''));
  const compName = function (id) { const c = companies.find(x => x.id === id); return c ? c.name : ''; };
  let h = '<div class="card" style="padding:.7rem"><input id="cust-q" type="search" placeholder="جستجوی نام، تلفن، ایمیل…" value="' + esc(f.q) + '"></div>' +
    '<div class="filter-bar">' +
    '<select id="f-status"><option value="">همه وضعیت‌ها</option>' + statuses.map(s => '<option value="' + s.id + '" ' + (f.status === s.id ? 'selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>' +
    '<select id="f-tag"><option value="">همه تگ‌ها</option>' + tags.map(t => '<option value="' + t.id + '" ' + (f.tag === t.id ? 'selected' : '') + '>' + esc(t.name) + '</option>').join('') + '</select>' +
    '<select id="f-company"><option value="">همه شرکت‌ها</option>' + companies.map(co => '<option value="' + co.id + '" ' + (f.company === co.id ? 'selected' : '') + '>' + esc(co.name) + '</option>').join('') + '</select>' +
    '<select id="f-activity"><option value="">هر فعالیتی</option><option value="7" ' + (f.activity === '7' ? 'selected' : '') + '>فعال در ۷ روز اخیر</option><option value="30" ' + (f.activity === '30' ? 'selected' : '') + '>فعال در ۳۰ روز اخیر</option></select>' +
    '<select id="f-sort"><option value="activity" ' + (sort === 'activity' ? 'selected' : '') + '>آخرین فعالیت</option><option value="name" ' + (sort === 'name' ? 'selected' : '') + '>نام</option><option value="created" ' + (sort === 'created' ? 'selected' : '') + '>تاریخ ایجاد</option></select>' +
    '<label><input type="checkbox" id="f-arch" ' + (f.archived ? 'checked' : '') + '> آرشیو</label></div>' +
    '<button class="btn btn-block" id="add-customer">+ مشتری جدید</button>';
  h += list.length ? '<div class="card">' + list.map((c, i) =>
    '<div class="list-item ' + enterCls(i) + '" data-nav="customer/' + c.id + '"><div><b>' + esc(c.name) + '</b> ' + statusBadgeSync(statuses, c.statusId) + (c.archived ? badge('آرشیو', 'warn') : '') +
    (c.tags || []).map(t => { const tg = tags.find(x => x.id === t); return tg ? badge(tg.name) : ''; }).join('') +
    '<br><span class="muted">' + esc(c.phone || 'بدون تلفن') + (compName(c.companyId) ? ' — ' + esc(compName(c.companyId)) : '') + (c.lastActivityAt ? ' — آخرین فعالیت: ' + dateFa(c.lastActivityAt) : '') + '</span>' +
    (nextFu[c.id] ? '<br><span class="muted">پیگیری بعدی: ' + dateFa(nextFu[c.id]) + '</span>' : '') +
    (firstDeal[c.id] ? '<br><span class="muted">Deal باز: ' + esc(firstDeal[c.id].title) + ' (' + fmt(firstDeal[c.id].value) + ')</span>' : '') + '</div></div>').join('') + '</div>'
    : emptyState('مشتری‌ای با این شرایط پیدا نشد. اولین مشتری را اضافه کنید.', 'افزودن مشتری', 'empty-act', 'هنوز مشتری‌ای ثبت نشده');
  setTimeout(function () {
    $('#add-customer').onclick = function () { openCustomerForm(); };
    $('#cust-q').oninput = function (e) { FilterState.customers.q = e.target.value; render(); };
    $('#f-status').onchange = function (e) { FilterState.customers.status = e.target.value; render(); };
    $('#f-tag').onchange = function (e) { FilterState.customers.tag = e.target.value; render(); };
    $('#f-company').onchange = function (e) { FilterState.customers.company = e.target.value; render(); };
    $('#f-activity').onchange = function (e) { FilterState.customers.activity = e.target.value; render(); };
    $('#f-sort').onchange = function (e) { FilterState.customersSort = e.target.value; render(); };
    $('#f-arch').onchange = function (e) { FilterState.customers.archived = e.target.checked; render(); };
    var ea = $('#empty-act'); if (ea) ea.onclick = function () { openCustomerForm(); };
  }, 0);
  return h;
};
async function openCustomerForm(existing) {
  const statuses = await Repo.list('statuses', s => s.entityType === 'customers');
  const companies = await Repo.list('companies');
  const tags = await Repo.list('tags');
  const c = existing || {};
  modal(existing ? 'ویرایش مشتری' : 'مشتری جدید',
    field('نام *', '<input id="c-name" value="' + esc(c.name || '') + '">') +
    field('تلفن', '<input id="c-phone" type="tel" value="' + esc(c.phone || '') + '">') +
    field('ایمیل', '<input id="c-email" type="email" value="' + esc(c.email || '') + '">') +
    field('شرکت', '<select id="c-company"><option value="">—</option>' + companies.map(co => '<option value="' + co.id + '" ' + (c.companyId === co.id ? 'selected' : '') + '>' + esc(co.name) + '</option>').join('') + '</select>') +
    field('وضعیت', '<select id="c-status"><option value="">—</option>' + statuses.map(s => '<option value="' + s.id + '" ' + (c.statusId === s.id ? 'selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>') +
    '<label>تگ‌ها</label><div class="chips">' + (tags.map(t => '<span class="badge ' + ((c.tags || []).indexOf(t.id) !== -1 ? 'selected' : '') + '" data-tag="' + t.id + '">' + esc(t.name) + '</span>').join('') || '<span class="muted">تگی تعریف نشده (از منوی بیشتر، بخش تگ‌ها اضافه کنید)</span>') + '</div>' +
    field('یادداشت', '<textarea id="c-notes">' + esc(c.notes || '') + '</textarea>') +
    '<hr class="divider"><h3 style="font-size:var(--fs-caption);color:var(--muted)">فیلدهای سفارشی</h3><div id="cf-container"></div>' + formErr() +
    '<button class="btn btn-block" id="c-save">ذخیره</button>',
    async function (body) {
      let selTags = (c.tags || []).slice();
      body.querySelectorAll('[data-tag]').forEach(ch => ch.onclick = function () {
        const id = ch.dataset.tag;
        if (selTags.indexOf(id) !== -1) { selTags = selTags.filter(x => x !== id); ch.classList.remove('selected'); }
        else { selTags.push(id); ch.classList.add('selected'); }
      });
      await renderCustomFieldInputs('customer', existing ? existing.id : null, 'cf-container');
      $('#c-save').onclick = function () {
        const nameEl = $('#c-name');
        if (!nameEl.value.trim()) { nameEl.classList.add('invalid'); showErr(new Error('نام مشتری الزامی است')); return; }
        nameEl.classList.remove('invalid');
        const data = {
          name: nameEl.value.trim(), phone: val('c-phone').trim(), email: val('c-email').trim(),
          companyId: val('c-company') || null, statusId: val('c-status') || null,
          tags: selTags, notes: val('c-notes'), archived: c.archived || false,
        };
        guard($('#c-save'), async function () {
          let saved;
          if (existing) saved = await CustomerService.update(existing.id, data);
          else saved = await CustomerService.create(data);
          await saveCustomFields('customer', saved.id, 'cf-container');
          closeModal(); toast('ذخیره شد', 'ok');
          if (existing) navigate('customer', existing.id); else render();
        });
      };
    });
}
async function openContactForm(customerId, existing) {
  const ct = existing || {};
  const custSel = customerId ? '' : field('مشتری *', '<select id="ct-cust">' + await customerOptions(ct.customerId) + '</select>');
  modal(existing ? 'ویرایش مخاطب' : 'مخاطب جدید',
    custSel +
    field('نام *', '<input id="ct-name" value="' + esc(ct.name || '') + '">') +
    field('تلفن', '<input id="ct-phone" type="tel" value="' + esc(ct.phone || '') + '">') +
    field('ایمیل', '<input id="ct-email" type="email" value="' + esc(ct.email || '') + '">') +
    field('نقش/سمت', '<input id="ct-role" value="' + esc(ct.role || '') + '">') +
    field('منبع', '<input id="ct-src" value="' + esc(ct.source || '') + '">') + formErr() +
    '<button class="btn btn-block" id="ct-save">ذخیره</button>',
    function () {
      $('#ct-save').onclick = function () {
        const cid = customerId || val('ct-cust');
        const data = { customerId: cid, name: val('ct-name').trim(), phone: val('ct-phone').trim(), email: val('ct-email').trim(), role: val('ct-role').trim(), source: val('ct-src').trim() };
        guard($('#ct-save'), async function () {
          if (existing) await ContactService.update(existing.id, data);
          else await ContactService.create(data);
          closeModal(); toast('ذخیره شد', 'ok');
          navigate(customerId ? 'customer' : 'contacts', customerId || undefined);
        });
      };
    });
}
Routes.contacts = async function () {
  const f = FilterState.contacts;
  const all = await Repo.list('contacts', c => !c.archived);
  const customers = await Repo.list('customers');
  let list = all;
  if (f.q) list = list.filter(ct => (ct.name + ' ' + (ct.phone || '') + ' ' + (ct.email || '')).toLowerCase().includes(f.q.toLowerCase()));
  list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  const custOf = function (id) { const c = customers.find(x => x.id === id); return c ? c.name : '—'; };
  let h = '<div class="card" style="padding:.7rem"><input id="ct-q" type="search" placeholder="جستجوی مخاطب…" value="' + esc(f.q) + '"></div><button class="btn btn-block" id="add-ct">+ مخاطب جدید</button>';
  h += list.length ? '<div class="card">' + list.map((ct, i) =>
    '<div class="list-item ' + enterCls(i) + '"><div><b>' + esc(ct.name) + '</b>' + (ct.role ? ' ' + badge(ct.role) : '') +
    '<br><span class="muted">' + esc(ct.phone || '') + (ct.email ? ' — ' + esc(ct.email) : '') + '</span>' +
    '<br><span class="muted">مشتری: ' + esc(custOf(ct.customerId)) + '</span></div>' +
    '<div style="display:flex;gap:.3rem;flex-shrink:0"><button class="btn small" data-ct-edit="' + ct.id + '">ویرایش</button><button class="btn small danger" data-ct-del="' + ct.id + '">حذف</button></div></div>').join('') + '</div>'
    : emptyState('مخاطبین از صفحه جزئیات هر مشتری یا همین‌جا اضافه می‌شوند.', 'افزودن مخاطب', 'empty-ct', 'هنوز مخاطبی ثبت نشده');
  setTimeout(function () {
    $('#add-ct').onclick = function () { openContactForm(null); };
    $('#ct-q').oninput = function (e) { FilterState.contacts.q = e.target.value; render(); };
    var ea = $('#empty-ct'); if (ea) ea.onclick = function () { openContactForm(null); };
    document.querySelectorAll('[data-ct-edit]').forEach(b => b.onclick = function () {
      const ct = list.find(x => x.id === b.dataset.ctEdit);
      if (ct) openContactForm(null, ct);
    });
    document.querySelectorAll('[data-ct-del]').forEach(b => b.onclick = function () {
      confirmDlg('حذف این مخاطب؟', function () { guard(b, async function () { await ContactService.remove(b.dataset.ctDel); toast('حذف شد', 'ok'); render(); }); });
    });
  }, 0);
  return h;
};
Routes.customer = async function (id) {
  const d = await CustomerService.detail(id);
  const c = d.customer;
  const statuses = await Repo.list('statuses', s => s.entityType === 'customers');
  const companies = await Repo.list('companies');
  const cfFields = await CustomFieldService.fieldsFor('customer');
  const cfMap = await CustomFieldService.getValuesMap('customer', id);
  const comp = companies.find(x => x.id === c.companyId);
  const st = statuses.find(s => s.id === c.statusId);
  const openDeals = d.deals.filter(x => x.status === 'open');
  const activeProjects = d.projects.filter(x => ['not_started', 'in_progress', 'on_hold'].indexOf(x.status) !== -1);
  const nextFu = d.followups.filter(f => f.status === 'open' && f.dueDate).map(f => f.dueDate).sort()[0];
  const ordersTotal = d.orders.filter(o => o.status !== 'لغو شده' && o.status !== 'cancelled').reduce((s, o) => s + Number(o.total || 0), 0);
  let h = '<div class="profile-card"><div class="profile-top"><div class="avatar">' + esc((c.name || '؟').charAt(0)) + '</div>' +
    '<div class="who"><h2>' + esc(c.name) + '</h2><div class="sub">' + esc(c.phone || 'بدون تلفن') + (c.email ? ' — ' + esc(c.email) : '') + '</div></div></div>' +
    '<div class="profile-meta"><div class="mrow"><span class="mk">وضعیت</span><span class="mv">' + (st ? esc(st.name) : '—') + (c.archived ? ' (آرشیو)' : '') + '</span></div>' +
    '<div class="mrow"><span class="mk">شرکت</span><span class="mv">' + (comp ? esc(comp.name) : '—') + '</span></div></div>' +
    '<div class="action-grid"><button id="cu-call">تماس</button><button id="cu-fu">پیگیری</button><button id="cu-task">کار</button><button id="cu-appt">قرار</button></div></div>';
  h += '<div class="card">' +
    '<div class="list-item"><span class="muted">آخرین فعالیت</span><span>' + (c.lastActivityAt ? dateFa(c.lastActivityAt) : '—') + '</span></div>' +
    '<div class="list-item"><span class="muted">پیگیری بعدی</span><span>' + (nextFu ? dateFa(nextFu) : '—') + '</span></div>' +
    '<div class="list-item"><span class="muted">Deal باز</span><span>' + fmt(openDeals.length) + '</span></div>' +
    '<div class="list-item"><span class="muted">پروژه فعال</span><span>' + fmt(activeProjects.length) + '</span></div>' +
    '<div class="list-item"><span class="muted">سفارش‌ها (مجموع)</span><span>' + fmt(d.orders.length) + ' — ' + fmt(ordersTotal) + '</span></div></div>';
  h += '<div class="btn-row"><button class="btn small" id="cu-edit">ویرایش</button><button class="btn small ghost" id="cu-lead">تبدیل به Lead</button>' +
    '<button class="btn small secondary" id="cu-arch">' + (c.archived ? 'خروج از آرشیو' : 'آرشیو') + '</button>' +
    '<button class="btn small danger" id="cu-del">حذف دائمی</button></div>';
  if (c.notes) h += '<div class="card"><div class="card-head"><h3>یادداشت</h3></div><p>' + esc(c.notes) + '</p></div>';
  if (cfFields.length) h += secTitle('فیلدهای سفارشی') + '<div class="card">' +
    cfFields.map(f => '<div class="list-item"><span>' + esc(f.label) + '</span><span class="muted">' + esc(f.type === 'boolean' ? (cfMap[f.id] === true ? 'بله' : cfMap[f.id] === false ? 'خیر' : '—') : Array.isArray(cfMap[f.id]) ? cfMap[f.id].join('، ') : (cfMap[f.id] == null ? '—' : cfMap[f.id])) + '</span></div>').join('') + '</div>';
  h += '<div class="btn-row"><button class="btn small" id="cu-deal">+ Deal</button><button class="btn small" id="cu-proj">+ پروژه</button><button class="btn small" id="cu-order">+ سفارش</button><button class="btn small" id="cu-addcontact">+ مخاطب</button></div>';
  h += secList('Dealها', d.deals, x => '<div class="list-item" data-nav="deal/' + x.id + '"><div><b>' + esc(x.title) + '</b><br><span class="muted">' + (x.status === 'won' ? 'برده شده' : x.status === 'lost' ? 'باخته' : 'باز') + '</span></div><span class="muted">' + fmt(x.value) + '</span></div>');
  h += secList('پروژه‌ها', d.projects, x => '<div class="list-item" data-nav="project/' + x.id + '"><div><b>' + esc(x.name) + '</b></div><span class="muted">' + esc(x.status) + '</span></div>');
  h += secList('Leadها', d.leads, x => '<div class="list-item"><div><b>' + esc(x.name) + '</b></div><span class="muted">' + esc(x.phone || '') + '</span></div>');
  h += secList('سفارش‌ها', d.orders, o => '<div class="list-item" data-nav="order/' + o.id + '"><div><b>' + esc(o.number) + '</b><br><span class="muted">' + esc(o.status) + '</span></div><span class="muted">' + fmt(o.total) + '</span></div>');
  h += secTitle('مخاطبین', d.contacts.length) + '<div class="card">' +
    (d.contacts.length ? d.contacts.map(ct => '<div class="list-item"><div><b>' + esc(ct.name) + '</b>' + (ct.role ? ' ' + badge(ct.role) : '') + '<br><span class="muted">' + esc(ct.phone || '') + (ct.email ? ' — ' + esc(ct.email) : '') + (ct.source ? ' — منبع: ' + esc(ct.source) : '') + '</span></div>' +
      '<div style="display:flex;gap:.3rem;flex-shrink:0"><button class="btn small" data-ct-edit="' + ct.id + '">ویرایش</button><button class="btn small danger" data-ct-del="' + ct.id + '">حذف</button></div></div>').join('') : '<div class="muted">مخاطبی ثبت نشده است</div>') + '</div>';
  h += secList('تماس‌ها', d.calls, cl => '<div class="list-item" data-call="' + cl.id + '"><div><b>' + esc(cl.result || 'بدون نتیجه') + '</b>' + (cl.nextCallDate ? '<br><span class="muted">تماس بعدی: ' + dateFa(cl.nextCallDate) + '</span>' : '') + '</div><span class="muted">' + dateTimeFa(cl.createdAt) + '</span></div>');
  h += secList('پیگیری‌ها', d.followups, f => '<div class="list-item"><div><b>' + esc(f.title) + '</b><br><span class="muted">' + dateFa(f.dueDate) + ' — ' + esc(f.status) + '</span></div></div>');
  h += secList('کارها', d.tasks, t => '<div class="list-item" data-task="' + t.id + '"><div><b>' + esc(t.title) + '</b></div><span class="muted">' + dateFa(t.dueDate) + '</span></div>');
  h += secList('قرارها', d.appointments, a => '<div class="list-item" data-nav="appointments"><div><b>' + esc(a.title) + '</b></div><span class="muted">' + dateTimeFa(a.datetime) + '</span></div>');
  h += secTitle('تاریخچه کامل (Timeline)') + '<div class="card">' +
    (d.activities.length ? d.activities.map(a => '<div class="timeline-item"><b>' + esc(activityLabel(a.type)) + '</b> — ' + esc(a.note || '') + '<br><span class="muted">' + dateTimeFa(a.createdAt) + '</span></div>').join('') : '<div class="muted">فعالیتی ثبت نشده</div>') + '</div>';
  h += secTitle('تاریخچه تغییرات (Audit)') + '<div class="card">' +
    (d.audit.length ? d.audit.slice(0, 20).map(a => '<div class="timeline-item"><b>' + esc(a.action) + '</b>' + (a.field ? ' — ' + esc(a.field) + ': ' + esc(a.oldVal == null ? '—' : a.oldVal) + ' ← ' + esc(a.newVal == null ? '—' : a.newVal) : '') + '<br><span class="muted">' + dateTimeFa(a.at) + '</span></div>').join('') : '<div class="muted">موردی ثبت نشده</div>') + '</div>';
  setTimeout(function () {
    $('#cu-edit').onclick = function () { openCustomerForm(c); };
    $('#cu-lead').onclick = function () { guard($('#cu-lead'), async function () { await CustomerService.convertToLead(id, {}); toast('Lead ایجاد شد', 'ok'); render(id); }); };
    $('#cu-arch').onclick = function () { guard($('#cu-arch'), async function () { await CustomerService.archive(id, !c.archived); toast(c.archived ? 'از آرشیو خارج شد' : 'آرشیو شد', 'ok'); render(id); }); };
    $('#cu-del').onclick = function () {
      confirmDlg('حذف دائمی مشتری؟ در صورت وجود رکورد وابسته، حذف رد می‌شود.', function () { guard($('#cu-del'), async function () { await CustomerService.deleteHard(id); toast('حذف شد', 'ok'); navigate('customers'); }); });
    };
    $('#cu-call').onclick = function () { openCallForm(id); };
    $('#cu-fu').onclick = function () { openFollowupForm(id); };
    $('#cu-task').onclick = function () { openTaskForm('customer', id); };
    $('#cu-appt').onclick = function () { openAppointmentForm(id); };
    $('#cu-deal').onclick = function () { openDealForm(id); };
    $('#cu-proj').onclick = function () { openProjectForm(null); };
    $('#cu-order').onclick = function () { openOrderForm(id); };
    $('#cu-addcontact').onclick = function () { openContactForm(id); };
    document.querySelectorAll('[data-ct-edit]').forEach(b => b.onclick = function () {
      const ct = d.contacts.find(x => x.id === b.dataset.ctEdit);
      if (ct) openContactForm(id, ct);
    });
    document.querySelectorAll('[data-ct-del]').forEach(b => b.onclick = function () {
      confirmDlg('حذف این مخاطب؟', function () { guard(b, async function () { await ContactService.remove(b.dataset.ctDel); toast('حذف شد', 'ok'); render(id); }); });
    });
    document.querySelectorAll('[data-call]').forEach(row => row.onclick = function (e) {
      if (e.target.closest('button')) return;
      openCallDetail(row.dataset.call);
    });
    document.querySelectorAll('[data-task]').forEach(row => row.onclick = function (e) {
      if (e.target.closest('button')) return;
      openTaskDetail(row.dataset.task);
    });
  }, 0);
  return h;
};
async function openCallForm(customerId, dealId, projectId) {
  modal('ثبت تماس',
    field('مشتری *', '<select id="cl-cust">' + await customerOptions(customerId) + '</select>') +
    field('شماره', '<input id="cl-phone" type="tel">') +
    field('نتیجه تماس', '<select id="cl-result">' + CallService.RESULTS.map(r => '<option>' + esc(r) + '</option>').join('') + '</select>') +
    field('تصمیم مشتری', '<input id="cl-decision">') +
    field('محصول موردنظر', '<select id="cl-prod">' + await productOptions() + '</select>') +
    field('تاریخ تماس بعدی (اختیاری)', '<input id="cl-next" type="date">') +
    field('توضیحات', '<textarea id="cl-notes"></textarea>') + formErr() +
    '<button class="btn btn-block" id="cl-save">ثبت تماس</button>',
    function () {
      $('#cl-cust').onchange = async function () {
        const c = await Repo.get('customers', $('#cl-cust').value);
        if (c && !$('#cl-phone').value) $('#cl-phone').value = c.phone || '';
      };
      $('#cl-save').onclick = function () {
        guard($('#cl-save'), async function () {
          await CallService.log({
            customerId: val('cl-cust'), phone: val('cl-phone').trim(), result: val('cl-result'),
            decision: val('cl-decision').trim(), outcomeProductId: val('cl-prod') || null,
            nextCallDate: val('cl-next') || null, notes: val('cl-notes').trim(),
            dealId: dealId || null, projectId: projectId || null, direction: 'outgoing',
          });
          closeModal(); toast('تماس ثبت شد', 'ok');
          render();
        });
      };
    });
}
async function openFollowupForm(customerId, refType, refId) {
  modal('پیگیری جدید',
    field('مشتری *', '<select id="fu-cust">' + await customerOptions(customerId) + '</select>') +
    field('عنوان *', '<input id="fu-title">') +
    field('تاریخ *', '<input id="fu-date" type="date" value="' + Dates.todayStr() + '">') +
    field('ساعت', '<input id="fu-time" type="time">') +
    field('اولویت', '<select id="fu-pr"><option value="normal">معمولی</option><option value="high">بالا</option><option value="low">کم</option></select>') +
    field('توضیح', '<textarea id="fu-notes"></textarea>') + formErr() +
    '<button class="btn btn-block" id="fu-save">ثبت</button>',
    function () {
      $('#fu-save').onclick = function () {
        guard($('#fu-save'), async function () {
          await FollowUpService.create({
            customerId: val('fu-cust'), title: val('fu-title').trim(), dueDate: val('fu-date'),
            dueTime: val('fu-time') || null, priority: val('fu-pr'), notes: val('fu-notes').trim(),
            refType: refType || null, refId: refId || null,
          });
          closeModal(); toast('پیگیری ثبت شد', 'ok'); render();
        });
      };
    });
}
async function openTaskForm(refType, refId) {
  modal('کار جدید',
    field('عنوان *', '<input id="tk-title">') +
    field('تاریخ', '<input id="tk-date" type="date" value="' + Dates.todayStr() + '">') +
    field('ساعت', '<input id="tk-time" type="time">') +
    field('اولویت', '<select id="tk-pr"><option value="normal">معمولی</option><option value="high">بالا</option><option value="low">کم</option></select>') +
    field('توضیح', '<textarea id="tk-notes"></textarea>') + formErr() +
    '<button class="btn btn-block" id="tk-save">ثبت</button>',
    function () {
      $('#tk-save').onclick = function () {
        guard($('#tk-save'), async function () {
          await TaskService.create({
            title: val('tk-title').trim(), dueDate: val('tk-date') || null, dueTime: val('tk-time') || null,
            priority: val('tk-pr'), notes: val('tk-notes').trim(), refType: refType || null, refId: refId || null,
          });
          closeModal(); toast('کار ثبت شد', 'ok'); render();
        });
      };
    });
}
async function openDealForm(customerId) {
  const settings = await Repo.getSettings();
  modal('Deal جدید',
    field('عنوان *', '<input id="d-title">') +
    field('مشتری *', '<select id="d-cust">' + await customerOptions(customerId) + '</select>') +
    field('ارزش (تومان)', '<input id="d-value" type="number" min="0" step="any">') +
    await pipelineStageSelects(settings.defaultPipelineId, null) +
    field('تاریخ فروش مورد انتظار', '<input id="d-close" type="date">') + formErr() +
    '<button class="btn btn-block" id="d-save">ثبت</button>',
    function () {
      bindPipelineStageSync();
      $('#d-save').onclick = function () {
        guard($('#d-save'), async function () {
          const deal = await DealService.create({
            title: val('d-title').trim(), customerId: val('d-cust'), value: Number(val('d-value') || 0),
            pipelineId: val('d-pipeline'), stageId: val('d-stage') || null, expectedCloseDate: val('d-close') || null,
          });
          closeModal(); toast('Deal ثبت شد', 'ok'); navigate('deal', deal.id);
        });
      };
    });
}
async function openDealEditForm(deal) {
  modal('ویرایش Deal',
    field('عنوان *', '<input id="de-title" value="' + esc(deal.title || '') + '">') +
    field('مشتری', '<select id="de-cust">' + await customerOptions(deal.customerId) + '</select>') +
    field('ارزش (تومان)', '<input id="de-value" type="number" min="0" step="any" value="' + esc(deal.value == null ? '' : deal.value) + '">') +
    field('احتمال موفقیت (٪)', '<input id="de-prob" type="number" min="0" max="100" step="any" value="' + esc(deal.probability == null ? 0 : deal.probability) + '">') +
    field('تاریخ فروش مورد انتظار', '<input id="de-close" type="date" value="' + esc(deal.expectedCloseDate || '') + '">') +
    formErr() + '<button class="btn btn-block" id="de-save">ذخیره</button>',
    function () {
      $('#de-save').onclick = function () {
        guard($('#de-save'), async function () {
          await DealService.update(deal.id, {
            title: val('de-title').trim(), customerId: val('de-cust') || null,
            value: Number(val('de-value') || 0), probability: Number(val('de-prob') || 0),
            expectedCloseDate: val('de-close') || null,
          });
          closeModal(); toast('ذخیره شد', 'ok'); navigate('deal', deal.id);
        });
      };
    });
}
async function openProjectForm(existing, dealId) {
  const ex = existing || {};
  modal(existing ? 'ویرایش پروژه' : 'پروژه جدید',
    field('نام پروژه *', '<input id="pj-name" value="' + esc(ex.name || '') + '">') +
    field('مشتری', '<select id="pj-cust"><option value="">—</option>' + (await customerOptions(ex.customerId)).replace('<option value="">— انتخاب مشتری —</option>', '<option value="">—</option>') + '</select>') +
    field('تاریخ شروع', '<input id="pj-start" type="date" value="' + esc(ex.startDate || Dates.todayStr()) + '">') +
    field('ددلاین', '<input id="pj-deadline" type="date" value="' + esc(ex.deadline || '') + '">') +
    field('وضعیت', '<select id="pj-status"><option value="not_started">شروع نشده</option><option value="in_progress">در جریان</option><option value="on_hold">موقتاً متوقف</option></select>') +
    field('توضیحات', '<textarea id="pj-notes">' + esc(ex.notes || '') + '</textarea>') + formErr() +
    '<button class="btn btn-block" id="pj-save">ذخیره</button>',
    function () {
      $('#pj-save').onclick = function () {
        const data = {
          name: val('pj-name').trim(), customerId: val('pj-cust') || null, dealId: dealId || ex.dealId || null,
          startDate: val('pj-start') || null, deadline: val('pj-deadline') || null,
          status: val('pj-status'), notes: val('pj-notes').trim(),
        };
        guard($('#pj-save'), async function () {
          if (existing) await ProjectService.update(existing.id, data);
          else { const p = await ProjectService.create(data); closeModal(); toast('پروژه ثبت شد', 'ok'); navigate('project', p.id); return; }
          closeModal(); toast('ذخیره شد', 'ok'); navigate('project', existing.id);
        });
      };
    });
}
async function openAppointmentForm(customerId, existing) {
  const ex = existing || {};
  const custSel = existing ? '' : field('مشتری *', '<select id="ap-cust">' + await customerOptions(customerId) + '</select>');
  modal(existing ? 'ویرایش قرار' : 'قرار جدید',
    custSel +
    field('عنوان *', '<input id="ap-title" value="' + esc(ex.title || '') + '">') +
    field('تاریخ و ساعت *', '<input id="ap-dt" type="datetime-local" value="' + esc(ex.datetime || '') + '">') +
    field('مکان', '<input id="ap-loc" value="' + esc(ex.location || '') + '">') +
    field('توضیحات', '<textarea id="ap-notes">' + esc(ex.notes || '') + '</textarea>') + formErr() +
    '<button class="btn btn-block" id="ap-save">ذخیره</button>',
    function () {
      $('#ap-save').onclick = function () {
        guard($('#ap-save'), async function () {
          if (existing) await AppointmentService.update(existing.id, { title: val('ap-title').trim(), datetime: val('ap-dt'), location: val('ap-loc').trim(), notes: val('ap-notes').trim() });
          else await AppointmentService.create({ customerId: val('ap-cust'), title: val('ap-title').trim(), datetime: val('ap-dt'), location: val('ap-loc').trim(), notes: val('ap-notes').trim() });
          closeModal(); toast('ذخیره شد', 'ok'); render();
        });
      };
    });
}
async function openTaskDetail(taskId) {
  const t = await Repo.get('tasks', taskId);
  if (!t) { toast('کار یافت نشد', 'err'); return; }
  const refLabel = { customer: 'مشتری', project: 'پروژه', deal: 'Deal', automation: 'اتوماسیون' }[t.refType] || '';
  let refNav = '';
  if (t.refType === 'customer' && t.refId) refNav = '<button class="btn small ghost" data-nav="customer/' + t.refId + '">مشاهده ' + refLabel + '</button>';
  if (t.refType === 'project' && t.refId) refNav = '<button class="btn small ghost" data-nav="project/' + t.refId + '">مشاهده ' + refLabel + '</button>';
  if (t.refType === 'deal' && t.refId) refNav = '<button class="btn small ghost" data-nav="deal/' + t.refId + '">مشاهده ' + refLabel + '</button>';
  modal('جزئیات کار',
    '<div class="list-item"><span class="muted">عنوان</span><b>' + esc(t.title) + '</b></div>' +
    '<div class="list-item"><span class="muted">وضعیت</span><span>' + (t.status === 'done' ? badge('انجام‌شده', 'ok') : t.status === 'open' ? badge('باز') : badge(t.status)) +
    (t.status !== 'done' && Dates.isOverdue(t.dueDate) ? ' ' + badge('عقب‌افتاده', 'danger') : '') + '</span></div>' +
    '<div class="list-item"><span class="muted">موعد</span><span>' + (t.dueDate ? dateFa(t.dueDate) + (t.dueTime ? ' — ' + t.dueTime : '') : '—') + '</span></div>' +
    '<div class="list-item"><span class="muted">اولویت</span><span>' + (t.priority === 'high' ? badge('بالا', 'danger') : t.priority === 'low' ? badge('کم') : badge('معمولی')) + '</span></div>' +
    (t.refType ? '<div class="list-item"><span class="muted">مرتبط با</span><span>' + esc(refLabel) + '</span></div>' : '') +
    (t.notes ? '<p>' + esc(t.notes) + '</p>' : '') +
    '<div class="btn-row">' + refNav +
    '<button class="btn small" id="td-toggle">' + (t.status === 'done' ? 'بازگردانی' : 'انجام شد') + '</button>' +
    '<button class="btn small danger" id="td-del">حذف</button></div>',
    function () {
      $('#td-toggle').onclick = function () { guard($('#td-toggle'), async function () { await TaskService.toggle(t.id); closeModal(); toast('به‌روزرسانی شد', 'ok'); render(); }); };
      $('#td-del').onclick = function () {
        confirmDlg('حذف این کار؟', function () { guard($('#td-del'), async function () { await TaskService.remove(t.id); closeModal(); toast('حذف شد', 'ok'); render(); }); });
      };
    });
}
async function openCallDetail(callId) {
  const c = await Repo.get('calls', callId);
  if (!c) { toast('تماس یافت نشد', 'err'); return; }
  const cust = c.customerId ? await Repo.get('customers', c.customerId) : null;
  const prod = c.outcomeProductId ? await Repo.get('products', c.outcomeProductId) : null;
  modal('جزئیات تماس',
    '<div class="list-item"><span class="muted">مشتری</span><span>' + (cust ? esc(cust.name) : '—') + '</span></div>' +
    '<div class="list-item"><span class="muted">تاریخ</span><span>' + dateTimeFa(c.createdAt) + '</span></div>' +
    '<div class="list-item"><span class="muted">نتیجه</span><span>' + badge(c.result || '—') + '</span></div>' +
    (c.decision ? '<div class="list-item"><span class="muted">تصمیم مشتری</span><span>' + esc(c.decision) + '</span></div>' : '') +
    (prod ? '<div class="list-item"><span class="muted">محصول موردنظر</span><span>' + esc(prod.name) + '</span></div>' : '') +
    (c.nextCallDate ? '<div class="list-item"><span class="muted">تماس بعدی</span><span>' + dateFa(c.nextCallDate) + '</span></div>' : '') +
    (c.notes ? '<p>' + esc(c.notes) + '</p>' : '') +
    '<div class="btn-row">' + (cust ? '<button class="btn small ghost" data-nav="customer/' + cust.id + '">مشاهده مشتری</button>' : '') + '</div>');
}
Routes.companies = async function () {
  const list = (await Repo.list('companies', c => !c.archived)).slice().sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  let h = '<div class="card" style="padding:.7rem"><input id="co-q" type="search" placeholder="جستجوی شرکت…"></div><button class="btn btn-block" id="add-co">+ شرکت جدید</button>';
  h += list.length ? '<div class="card">' + list.map((c, i) => '<div class="list-item ' + enterCls(i) + '" data-nav="company/' + c.id + '"><b>' + esc(c.name) + '</b><span class="muted">' + esc(c.phone || '') + '</span></div>').join('') + '</div>'
    : emptyState('شرکتی ثبت نشده است. شرکت‌ها برای گروه‌بندی مشتریان استفاده می‌شوند.', 'افزودن شرکت', 'empty-co', 'هنوز شرکتی ثبت نشده');
  setTimeout(function () {
    $('#add-co').onclick = function () { openCompanyForm(); };
    $('#co-q').oninput = function (e) {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.list-item[data-nav^="company/"]').forEach(function (row) { row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    };
    var ea = $('#empty-co'); if (ea) ea.onclick = function () { openCompanyForm(); };
  }, 0);
  return h;
};
async function openCompanyForm(existing) {
  const c = existing || {};
  modal(existing ? 'ویرایش شرکت' : 'شرکت جدید',
    field('نام شرکت *', '<input id="co-name" value="' + esc(c.name || '') + '">') +
    field('تلفن', '<input id="co-phone" type="tel" value="' + esc(c.phone || '') + '">') +
    field('ایمیل', '<input id="co-email" type="email" value="' + esc(c.email || '') + '">') +
    field('آدرس', '<textarea id="co-addr">' + esc(c.address || '') + '</textarea>') +
    '<hr class="divider"><h3 style="font-size:var(--fs-caption);color:var(--muted)">فیلدهای سفارشی</h3><div id="cf-container"></div>' + formErr() +
    '<button class="btn btn-block" id="co-save">ذخیره</button>',
    async function () {
      await renderCustomFieldInputs('company', existing ? existing.id : null, 'cf-container');
      $('#co-save').onclick = function () {
        const data = { name: val('co-name').trim(), phone: val('co-phone').trim(), email: val('co-email').trim(), address: val('co-addr').trim(), archived: c.archived || false };
        guard($('#co-save'), async function () {
          let saved;
          if (existing) saved = await CompanyService.update(existing.id, data);
          else saved = await CompanyService.create(data);
          await saveCustomFields('company', saved.id, 'cf-container');
          closeModal(); toast('ذخیره شد', 'ok');
          if (existing) navigate('company', existing.id); else render();
        });
      };
    });
}
Routes.company = async function (id) {
  const d = await CompanyService.detail(id);
  const c = d.company;
  let h = '<div class="profile-card"><div class="profile-top"><div class="avatar">' + esc((c.name || '؟').charAt(0)) + '</div>' +
    '<div class="who"><h2>' + esc(c.name) + '</h2><div class="sub">' + esc(c.phone || 'بدون تلفن') + '</div></div></div>' +
    (c.email || c.address ? '<div class="profile-meta">' + (c.email ? '<div class="mrow"><span class="mk">ایمیل</span><span class="mv">' + esc(c.email) + '</span></div>' : '') + (c.address ? '<div class="mrow"><span class="mk">آدرس</span><span class="mv">' + esc(c.address) + '</span></div>' : '') + '</div>' : '') + '</div>' +
    '<div class="btn-row"><button class="btn small" id="co-edit">ویرایش</button><button class="btn small secondary" id="co-arch">' + (c.archived ? 'خروج از آرشیو' : 'آرشیو') + '</button><button class="btn small danger" id="co-del">حذف دائمی</button></div>';
  h += secList('مشتریان این شرکت', d.customers, cu => '<div class="list-item" data-nav="customer/' + cu.id + '"><div><b>' + esc(cu.name) + '</b></div><span class="muted">' + esc(cu.phone || '') + '</span></div>');
  h += secList('Dealهای مرتبط', d.deals, dl => '<div class="list-item" data-nav="deal/' + dl.id + '"><div><b>' + esc(dl.title) + '</b></div><span class="muted">' + fmt(dl.value) + '</span></div>');
  h += secTitle('تاریخچه تغییرات') + '<div class="card">' +
    (d.audit.length ? d.audit.slice(0, 20).map(a => '<div class="timeline-item"><b>' + esc(a.action) + '</b>' + (a.field ? ' — ' + esc(a.field) + ': ' + esc(a.oldVal == null ? '—' : a.oldVal) + ' ← ' + esc(a.newVal == null ? '—' : a.newVal) : '') + '<br><span class="muted">' + dateTimeFa(a.at) + '</span></div>').join('') : '<div class="muted">موردی ثبت نشده</div>') + '</div>';
  setTimeout(function () {
    $('#co-edit').onclick = function () { openCompanyForm(c); };
    $('#co-arch').onclick = function () { guard($('#co-arch'), async function () { await CompanyService.archive(id, !c.archived); toast('انجام شد', 'ok'); render(id); }); };
    $('#co-del').onclick = function () {
      confirmDlg('حذف دائمی شرکت؟ در صورت وجود مشتری/Deal وابسته، حذف رد می‌شود.', function () { guard($('#co-del'), async function () { await CompanyService.deleteHard(id); toast('حذف شد', 'ok'); navigate('companies'); }); });
    };
  }, 0);
  return h;
};
Routes.leads = async function () {
  const all = await Repo.list('leads', l => FilterState.leads.archived ? l.archived : !l.archived);
  const statuses = await Repo.list('statuses', s => s.entityType === 'leads');
  const customers = await Repo.list('customers');
  const sources = Array.from(new Set(all.map(l => l.source).filter(Boolean)));
  const f = FilterState.leads;
  let list = all;
  if (f.q) list = list.filter(l => (l.name + ' ' + (l.phone || '') + ' ' + (l.company || '')).toLowerCase().includes(f.q.toLowerCase()));
  if (f.status) list = list.filter(l => l.statusId === f.status);
  if (f.source) list = list.filter(l => l.source === f.source);
  list = list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const custName = function (id) { const c = customers.find(x => x.id === id); return c ? c.name : ''; };
  let h = '<div class="card" style="padding:.7rem"><input id="ld-q" type="search" placeholder="جستجو…" value="' + esc(f.q) + '"></div>' +
    '<div class="filter-bar">' +
    '<select id="ld-status"><option value="">همه وضعیت‌ها</option>' + statuses.map(s => '<option value="' + s.id + '" ' + (f.status === s.id ? 'selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>' +
    '<select id="ld-source"><option value="">همه منابع</option>' + sources.map(s => '<option value="' + esc(s) + '" ' + (f.source === s ? 'selected' : '') + '>' + esc(s) + '</option>').join('') + '</select>' +
    '<label><input type="checkbox" id="ld-arch" ' + (f.archived ? 'checked' : '') + '> آرشیو</label></div>' +
    '<button class="btn btn-block" id="add-lead">+ Lead جدید</button>';
  h += list.length ? '<div class="card">' + list.map((l, i) => {
    const st = statuses.find(s => s.id === l.statusId);
    const converted = !!(l.customerId || l.dealId);
    let acts = '';
    if (converted) acts = '<button class="btn small ghost" data-ld-go="' + l.id + '">مشاهده</button> ';
    else if (!l.archived) acts = '<button class="btn small" data-ld-conv="' + l.id + '">تبدیل</button> <button class="btn small" data-ld-edit="' + l.id + '">ویرایش</button> <button class="btn small secondary" data-ld-arch="' + l.id + '">آرشیو</button> ';
    else acts = '<button class="btn small secondary" data-ld-unarch="' + l.id + '">خروج از آرشیو</button> ';
    acts += '<button class="btn small danger" data-ld-del="' + l.id + '">حذف</button>';
    return '<div class="list-item ' + enterCls(i) + '"><div><b>' + esc(l.name) + '</b> ' + (st ? badge(st.name, converted ? 'info' : 'ok') : '') +
      (converted ? badge('تبدیل‌شده', 'info') : '') + (l.archived ? badge('آرشیو', 'warn') : '') +
      '<br><span class="muted">' + esc(l.phone || '') + (l.company ? ' — ' + esc(l.company) : '') + (l.source ? ' — منبع: ' + esc(l.source) : '') + (l.value ? ' — ارزش: ' + fmt(l.value) : '') + '</span>' +
      (converted && l.customerId ? '<br><span class="muted">مشتری: ' + esc(custName(l.customerId)) + '</span>' : '') + '</div>' +
      '<div style="display:flex;gap:.3rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">' + acts + '</div></div>';
  }).join('') + '</div>'
    : emptyState('Lead‌ای ثبت نشده است. سرنخ‌های جدید را همین‌جا وارد کنید.', 'ایجاد Lead', 'empty-lead', 'هیچ Lead وجود ندارد');
  setTimeout(function () {
    $('#add-lead').onclick = function () { openLeadForm(); };
    $('#ld-q').oninput = function (e) { FilterState.leads.q = e.target.value; render(); };
    $('#ld-status').onchange = function (e) { FilterState.leads.status = e.target.value; render(); };
    $('#ld-source').onchange = function (e) { FilterState.leads.source = e.target.value; render(); };
    $('#ld-arch').onchange = function (e) { FilterState.leads.archived = e.target.checked; render(); };
    var ea = $('#empty-lead'); if (ea) ea.onclick = function () { openLeadForm(); };
    document.querySelectorAll('[data-ld-go]').forEach(b => b.onclick = function () {
      const l = all.find(x => x.id === b.dataset.ldGo);
      if (l && l.customerId) navigate('customer', l.customerId);
    });
    document.querySelectorAll('[data-ld-conv]').forEach(b => b.onclick = function () { openConvertLead(b.dataset.ldConv); });
    document.querySelectorAll('[data-ld-edit]').forEach(b => b.onclick = function () {
      const l = all.find(x => x.id === b.dataset.ldEdit);
      if (l) openLeadForm(l);
    });
    document.querySelectorAll('[data-ld-arch]').forEach(b => b.onclick = function () { guard(b, async function () { await LeadService.archive(b.dataset.ldArch, true); toast('آرشیو شد', 'ok'); render(); }); });
    document.querySelectorAll('[data-ld-unarch]').forEach(b => b.onclick = function () { guard(b, async function () { await LeadService.archive(b.dataset.ldUnarch, false); toast('از آرشیو خارج شد', 'ok'); render(); }); });
    document.querySelectorAll('[data-ld-del]').forEach(b => b.onclick = function () {
      confirmDlg('حذف دائمی Lead؟ در صورت تبدیل‌شده بودن، حذف رد می‌شود.', function () { guard(b, async function () { await LeadService.deleteHard(b.dataset.ldDel); toast('حذف شد', 'ok'); render(); }); });
    });
  }, 0);
  return h;
};
async function openLeadForm(existing) {
  const l = existing || {};
  modal(existing ? 'ویرایش Lead' : 'Lead جدید',
    field('نام *', '<input id="l-name" value="' + esc(l.name || '') + '">') +
    field('تلفن *', '<input id="l-phone" type="tel" value="' + esc(l.phone || '') + '">') +
    field('شرکت', '<input id="l-comp" value="' + esc(l.company || '') + '">') +
    field('منبع Lead', '<input id="l-src" value="' + esc(l.source || '') + '">') +
    field('ارزش احتمالی (تومان)', '<input id="l-value" type="number" min="0" step="any" value="' + esc(l.value || '') + '">') +
    field('محصول/خدمت موردنظر', '<input id="l-want" value="' + esc(l.wanted || '') + '">') +
    field('تاریخ پیگیری بعدی', '<input id="l-fu" type="date" value="' + esc(l.nextFollowUpDate || '') + '">') +
    field('توضیحات', '<textarea id="l-notes">' + esc(l.notes || '') + '</textarea>') + formErr() +
    '<button class="btn btn-block" id="l-save">ذخیره</button>',
    function () {
      $('#l-save').onclick = function () {
        const data = {
          name: val('l-name').trim(), phone: val('l-phone').trim(), company: val('l-comp').trim(),
          source: val('l-src').trim(), value: Number(val('l-value') || 0), wanted: val('l-want').trim(),
          nextFollowUpDate: val('l-fu') || null, notes: val('l-notes').trim(), archived: l.archived || false,
        };
        guard($('#l-save'), async function () {
          if (existing) await LeadService.update(existing.id, data);
          else await LeadService.create(data);
          closeModal(); toast('ذخیره شد', 'ok'); render();
        });
      };
    });
}
async function openConvertLead(leadId) {
  const stages = await Repo.list('stages');
  stages.sort((a, b) => a.order - b.order);
  modal('تبدیل Lead',
    '<p class="muted">Lead به مشتری تبدیل می‌شود (در صورت تبدیل قبلی، همان مشتری استفاده می‌شود).</p>' +
    '<label style="display:flex;align-items:center;gap:.4rem"><input type="checkbox" id="cv-deal" style="width:auto"> ایجاد Deal نیز</label>' +
    field('مرحله Deal', '<select id="cv-stage">' + stages.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('') + '</select>') +
    formErr() + '<button class="btn btn-block" id="cv-go">تبدیل</button>',
    function () {
      $('#cv-go').onclick = function () {
        guard($('#cv-go'), async function () {
          const r = await LeadService.convert(leadId, { createDeal: $('#cv-deal').checked, dealStageId: val('cv-stage') || null });
          closeModal(); toast('تبدیل انجام شد', 'ok');
          navigate('customer', r.customer.id);
        });
      };
    });
}
Routes.deals = async function () {
  const all = await Repo.list('deals', d => FilterState.deals.archived ? d.archived : !d.archived);
  const pipelines = await Repo.list('pipelines');
  const stages = await Repo.list('stages');
  const customers = await Repo.list('customers');
  const f = FilterState.deals;
  let list = all;
  if (f.q) list = list.filter(d => d.title.toLowerCase().includes(f.q.toLowerCase()));
  if (f.pipeline) list = list.filter(d => d.pipelineId === f.pipeline);
  if (f.stage) list = list.filter(d => d.stageId === f.stage);
  if (f.status) list = list.filter(d => d.status === f.status);
  if (f.minVal !== '' && f.minVal != null) list = list.filter(d => num(d.value) >= Number(f.minVal));
  list = list.slice().sort((a, b) => (b.lastActivityAt || b.createdAt).localeCompare(a.lastActivityAt || a.createdAt));
  const stageName = function (id) { const s = stages.find(x => x.id === id); return s ? s.name : ''; };
  const custName = function (id) { const c = customers.find(x => x.id === id); return c ? c.name : ''; };
  const selPipeline = f.pipeline || '';
  const seg = '<div class="seg"><button id="dl-vl" class="' + (f.view !== 'kanban' ? 'active' : '') + '">لیست</button><button id="dl-vk" class="' + (f.view === 'kanban' ? 'active' : '') + '">کانبان</button></div>';
  let h = seg +
    '<div class="card" style="padding:.7rem"><input id="dl-q" type="search" placeholder="جستجو…" value="' + esc(f.q) + '"></div>' +
    '<div class="filter-bar">' +
    '<select id="dl-pipe"><option value="">همه Pipelineها</option>' + pipelines.map(p => '<option value="' + p.id + '" ' + (f.pipeline === p.id ? 'selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>' +
    '<select id="dl-stage"><option value="">همه مراحل</option>' + stages.filter(s => !selPipeline || s.pipelineId === selPipeline).sort((a, b) => a.order - b.order).map(s => '<option value="' + s.id + '" ' + (f.stage === s.id ? 'selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>' +
    '<select id="dl-status"><option value="">همه وضعیت‌ها</option><option value="open" ' + (f.status === 'open' ? 'selected' : '') + '>باز</option><option value="won" ' + (f.status === 'won' ? 'selected' : '') + '>برده شده</option><option value="lost" ' + (f.status === 'lost' ? 'selected' : '') + '>باخته</option></select>' +
    '<input id="dl-minval" type="number" min="0" step="any" placeholder="حداقل ارزش" value="' + esc(f.minVal) + '">' +
    '<label><input type="checkbox" id="dl-arch" ' + (f.archived ? 'checked' : '') + '> آرشیو</label></div>' +
    '<button class="btn btn-block" id="add-deal">+ Deal جدید</button>';
  if (f.view === 'kanban') {
    const pipe = f.pipeline ? pipelines.find(p => p.id === f.pipeline) : (pipelines.find(p => p.isDefault) || pipelines[0]);
    if (!pipe) h += emptyState('برای نمایش کانبان، ابتدا یک Pipeline تعریف کنید.', 'تنظیم Pipelineها', 'empty-pipe', 'Pipeline موجود نیست');
    else {
      const pipeStages = stages.filter(s => s.pipelineId === pipe.id).sort((a, b) => a.order - b.order);
      const kbList = list.filter(d => d.status === 'open');
      h += '<div class="kanban">' + pipeStages.map(s => {
        const items = kbList.filter(d => d.stageId === s.id);
        const sum = items.reduce((t, x) => t + num(x.value), 0);
        return '<div class="kan-col"><div class="kan-col-head"><span>' + esc(s.name) + (s.isWon ? ' (برد)' : s.isLost ? ' (باخت)' : '') + '</span><span class="cnt">' + fmt(items.length) + ' | ' + fmt(sum) + '</span></div>' +
          '<div class="kan-col-body">' + (items.length ? items.map(d => '<div class="kan-card" data-nav="deal/' + d.id + '"><div class="kt">' + esc(d.title) + '</div><div class="km"><span>' + esc(custName(d.customerId) || '—') + (d.probability ? ' — ' + fmt(d.probability) + '٪' : '') + '</span><span class="kv">' + fmt(d.value) + '</span></div></div>').join('') : '<div class="kan-empty">خالی</div>') + '</div></div>';
      }).join('') + '</div>';
    }
  } else {
    h += list.length ? '<div class="card">' + list.map((d, i) =>
      '<div class="list-item ' + enterCls(i) + '" data-nav="deal/' + d.id + '"><div><b>' + esc(d.title) + '</b> ' +
      (stageName(d.stageId) ? badge(stageName(d.stageId)) : '') +
      (d.status === 'won' ? badge('برد', 'ok') : d.status === 'lost' ? badge('باخت', 'danger') : '') +
      (d.archived ? badge('آرشیو', 'warn') : '') +
      '<br><span class="muted">' + esc(custName(d.customerId) || '—') + (d.probability ? ' — احتمال: ' + fmt(d.probability) + '٪' : '') + (d.expectedCloseDate ? ' — فروش مورد انتظار: ' + dateFa(d.expectedCloseDate) : '') + '</span></div>' +
      '<span class="muted"><b>' + fmt(d.value) + '</b></span></div>').join('') + '</div>'
      : emptyState('Deal‌ای ثبت نشده است. از دکمه بالا اولین Deal را بسازید.', 'ایجاد Deal', 'empty-deal', 'هیچ Deal وجود ندارد');
  }
  setTimeout(function () {
    $('#dl-vl').onclick = function () { FilterState.deals.view = 'list'; render(); };
    $('#dl-vk').onclick = function () { FilterState.deals.view = 'kanban'; render(); };
    $('#add-deal').onclick = function () { openDealForm(); };
    $('#dl-q').oninput = function (e) { FilterState.deals.q = e.target.value; render(); };
    $('#dl-pipe').onchange = function (e) { FilterState.deals.pipeline = e.target.value; FilterState.deals.stage = ''; render(); };
    $('#dl-stage').onchange = function (e) { FilterState.deals.stage = e.target.value; render(); };
    $('#dl-status').onchange = function (e) { FilterState.deals.status = e.target.value; render(); };
    $('#dl-minval').oninput = function (e) { FilterState.deals.minVal = e.target.value; };
    $('#dl-minval').onchange = function () { render(); };
    $('#dl-arch').onchange = function (e) { FilterState.deals.archived = e.target.checked; render(); };
    var ea = $('#empty-deal'); if (ea) ea.onclick = function () { openDealForm(); };
    ea = $('#empty-pipe'); if (ea) ea.onclick = function () { navigate('pipelines'); };
  }, 0);
  return h;
};
// Maps AIGateway/AIService error codes to a short, user-facing Persian message
// for the "پیشنهاد اقدام بعدی (AI)" card. Purely presentational — does not add
// any new AI capability or touch the gateway itself.
function ddAiErrorMessage(code) {
  var map = {
    AI_DISABLED: 'قابلیت هوش مصنوعی در حال حاضر غیرفعال است.',
    GATEWAY_NOT_CONFIGURED: 'اتصال به سرویس هوش مصنوعی هنوز تنظیم نشده است.',
    TIMEOUT: 'دریافت پیشنهاد بیش از حد طول کشید. دوباره تلاش کنید.',
    NETWORK_ERROR: 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.',
    UNAUTHORIZED: 'دسترسی به سرویس هوش مصنوعی مجاز نیست.',
    FORBIDDEN: 'دسترسی به سرویس هوش مصنوعی مجاز نیست.',
    INVALID_REQUEST: 'درخواست نامعتبر بود.',
    RATE_LIMIT: 'تعداد درخواست‌ها زیاد بوده است. کمی بعد دوباره تلاش کنید.',
    EMPTY_RESPONSE: 'پاسخی از سرویس هوش مصنوعی دریافت نشد.',
    INVALID_RESPONSE: 'پاسخ نامعتبر از سرویس هوش مصنوعی دریافت شد.',
    UPSTREAM_ERROR: 'سرویس هوش مصنوعی موقتاً در دسترس نیست.',
  };
  return (code && map[code]) || 'دریافت پیشنهاد با خطا مواجه شد. دوباره تلاش کنید.';
}
Routes.deal = async function (id) {
  const d = await DealService.detail(id);
  const deal = d.deal;
  const stages = await Repo.list('stages', s => s.pipelineId === deal.pipelineId);
  stages.sort((a, b) => a.order - b.order);
  const cust = deal.customerId ? await Repo.get('customers', deal.customerId) : null;
  let h = '<div class="profile-card"><div class="profile-top"><div class="avatar">' + esc((deal.title || '؟').charAt(0)) + '</div>' +
    '<div class="who"><h2>' + esc(deal.title) + '</h2><div class="sub">ارزش: ' + fmt(deal.value) + ' تومان' + (deal.probability ? ' — احتمال: ' + fmt(deal.probability) + '٪' : '') + '</div></div></div>' +
    '<div class="profile-meta"><div class="mrow"><span class="mk">وضعیت</span><span class="mv">' + (deal.status === 'won' ? 'برده شده' : deal.status === 'lost' ? 'باخته' : 'باز') + (deal.archived ? ' (آرشیو)' : '') + '</span></div>' +
    '<div class="mrow"><span class="mk">مشتری</span><span class="mv">' + (cust ? esc(cust.name) : '—') + '</span></div>' +
    '<div class="mrow"><span class="mk">آخرین فعالیت</span><span class="mv">' + (deal.lastActivityAt ? dateFa(deal.lastActivityAt) : '—') + '</span></div>' +
    (deal.expectedCloseDate ? '<div class="mrow"><span class="mk">فروش مورد انتظار</span><span class="mv">' + dateFa(deal.expectedCloseDate) + '</span></div>' : '') + '</div></div>' +
    '<div class="btn-row">' + (cust ? '<button class="btn small ghost" data-nav="customer/' + cust.id + '">مشتری</button>' : '') +
    '<button class="btn small" id="dd-edit">ویرایش</button>' +
    '<button class="btn small secondary" id="dd-arch">' + (deal.archived ? 'خروج از آرشیو' : 'آرشیو') + '</button>' +
    '<button class="btn small danger" id="dd-del">حذف دائمی</button></div>' +
    '<div class="card">' + field('تغییر مرحله', '<select id="dd-stage">' + stages.map(s => '<option value="' + s.id + '" ' + (deal.stageId === s.id ? 'selected' : '') + '>' + esc(s.name) + (s.isWon ? ' (برد)' : s.isLost ? ' (باخت)' : '') + '</option>').join('') + '</select>') + '</div>' +
    '<div class="btn-row"><button class="btn small" id="dd-call">+ تماس</button><button class="btn small" id="dd-fu">+ پیگیری</button><button class="btn small" id="dd-task">+ کار</button><button class="btn small" id="dd-proj">+ پروژه</button></div>';

  // AI-powered next-action suggestion — wired to the existing AIService.suggestNextAction(dealId)
  h += '<div class="card" id="dd-ai-card">' +
    '<div class="section-title">پیشنهاد اقدام بعدی (AI)</div>' +
    '<button class="btn small" id="dd-ai-btn">دریافت پیشنهاد</button>' +
    '<div id="dd-ai-result" style="margin-top:.6rem"></div>' +
    '</div>';

  h += secList('تماس‌ها', d.calls, c => '<div class="list-item" data-call="' + c.id + '"><div><b>' + esc(c.result || '—') + '</b></div><span class="muted">' + dateTimeFa(c.createdAt) + '</span></div>');
  h += secList('پیگیری‌ها', d.followups, f => '<div class="list-item"><div><b>' + esc(f.title) + '</b><br><span class="muted">' + dateFa(f.dueDate) + ' — ' + esc(f.status) + '</span></div></div>');
  h += secList('کارها', d.tasks, t => '<div class="list-item" data-task="' + t.id + '"><div><b>' + esc(t.title) + '</b></div><span class="muted">' + dateFa(t.dueDate) + '</span></div>');
  h += secTitle('Timeline') + '<div class="card">' +
    (d.activities.length ? d.activities.map(a => '<div class="timeline-item"><b>' + esc(activityLabel(a.type)) + '</b> — ' + esc(a.note || '') + '<br><span class="muted">' + dateTimeFa(a.createdAt) + '</span></div>').join('') : '<div class="muted">فعالیتی ثبت نشده</div>') + '</div>';
  setTimeout(function () {
    var ddAiBtn = $('#dd-ai-btn');
    if (ddAiBtn) ddAiBtn.onclick = function () {
      guard(ddAiBtn, async function () {
        var box = $('#dd-ai-result');
        if (box) box.innerHTML = '<div class="muted">در حال دریافت پیشنهاد…</div>';
        if (typeof AIService === 'undefined' || !AIService.suggestNextAction) {
          if (box) box.innerHTML = '<div class="error-text">قابلیت پیشنهاد اقدام بعدی در دسترس نیست.</div>';
          return;
        }
        var res = await AIService.suggestNextAction(id);
        if (!box) return;
        if (res && res.ok && res.text) {
          box.innerHTML = '<div>' + esc(res.text).replace(/\n/g, '<br>') + '</div>';
        } else {
          box.innerHTML = '<div class="error-text">' + esc(ddAiErrorMessage(res && res.error)) + '</div>';
        }
      });
    };
    $('#dd-edit').onclick = function () { openDealEditForm(deal); };
    $('#dd-stage').onchange = async function (e) {
      try { await DealService.changeStage(id, e.target.value); toast('مرحله تغییر کرد', 'ok'); render(id); }
      catch (err) { toast(errMsg(err), 'err'); }
    };
    $('#dd-call').onclick = function () { openCallForm(deal.customerId, id); };
    $('#dd-fu').onclick = function () { openFollowupForm(deal.customerId, 'deal', id); };
    $('#dd-task').onclick = function () { openTaskForm('deal', id); };
    $('#dd-proj').onclick = function () { openProjectForm(null, id); };
    $('#dd-arch').onclick = function () { guard($('#dd-arch'), async function () { await DealService.archive(id, !deal.archived); toast('انجام شد', 'ok'); render(id); }); };
    $('#dd-del').onclick = function () {
      confirmDlg('حذف دائمی Deal؟ در صورت وجود رکورد وابسته، حذف رد می‌شود.', function () { guard($('#dd-del'), async function () { await DealService.deleteHard(id); toast('حذف شد', 'ok'); navigate('deals'); }); });
    };
    document.querySelectorAll('[data-call]').forEach(row => row.onclick = function (e) { if (e.target.closest('button')) return; openCallDetail(row.dataset.call); });
    document.querySelectorAll('[data-task]').forEach(row => row.onclick = function (e) { if (e.target.closest('button')) return; openTaskDetail(row.dataset.task); });
  }, 0);
  return h;
};// app.js — PART 2 of 2. Append this content EXACTLY at the end of app-part1
// (after Routes.deal), then rename the merged file to app.js.
var PROJECT_STATUS = { not_started: 'شروع نشده', in_progress: 'در جریان', on_hold: 'موقتاً متوقف', stalled: 'خوابیده', completed: 'تکمیل شده', cancelled: 'لغو شده', lost: 'باخته' };
Routes.projects = async function () {
  const all = await Repo.list('projects', p => FilterState.projects.archived ? p.archived : !p.archived);
  const customers = await Repo.list('customers');
  const stages = await Repo.list('stages');
  const f = FilterState.projects;
  let list = all;
  if (f.q) list = list.filter(p => p.name.toLowerCase().includes(f.q.toLowerCase()));
  if (f.status) list = list.filter(p => p.status === f.status);
  list = list.slice().sort((a, b) => (b.lastActivityAt || b.createdAt).localeCompare(a.lastActivityAt || a.createdAt));
  const custName = function (id) { const c = customers.find(x => x.id === id); return c ? c.name : ''; };
  const stageName = function (id) { const s = stages.find(x => x.id === id); return s ? s.name : ''; };
  let h = '<div class="card" style="padding:.7rem"><input id="pj-q" type="search" placeholder="جستجو…" value="' + esc(f.q) + '"></div>' +
    '<div class="filter-bar"><select id="pj-fstatus"><option value="">همه وضعیت‌ها</option>' +
    Object.keys(PROJECT_STATUS).map(k => '<option value="' + k + '" ' + (f.status === k ? 'selected' : '') + '>' + PROJECT_STATUS[k] + '</option>').join('') + '</select>' +
    '<label><input type="checkbox" id="pj-arch" ' + (f.archived ? 'checked' : '') + '> آرشیو</label></div>' +
    '<button class="btn btn-block" id="add-proj">+ پروژه جدید</button>';
  h += list.length ? '<div class="card">' + list.map((p, i) =>
    '<div class="list-item ' + enterCls(i) + '" data-nav="project/' + p.id + '"><div><b>' + esc(p.name) + '</b> ' +
    badge(PROJECT_STATUS[p.status] || p.status, p.status === 'stalled' ? 'warn' : p.status === 'in_progress' ? 'ok' : '') +
    (p.archived ? badge('آرشیو', 'warn') : '') + (stageName(p.stageId) ? ' ' + badge(stageName(p.stageId)) : '') +
    '<br><span class="muted">' + esc(custName(p.customerId) || 'بدون مشتری') + '</span>' +
    '<br><span class="muted">شروع: ' + (p.startDate ? dateFa(p.startDate) : '—') + ' — ددلاین: ' + (p.deadline ? dateFa(p.deadline) : '—') + '</span>' +
    '<br><span class="muted">آخرین فعالیت: ' + (p.lastActivityAt ? dateFa(p.lastActivityAt) : '—') + '</span></div></div>').join('') + '</div>'
    : emptyState('هیچ پروژه‌ای وجود ندارد. پروژه‌ها می‌توانند به مشتری یا Deal متصل شوند.', 'ایجاد پروژه', 'empty-proj', 'هنوز پروژه‌ای ثبت نشده');
  setTimeout(function () {
    $('#add-proj').onclick = function () { openProjectForm(); };
    $('#pj-q').oninput = function (e) { FilterState.projects.q = e.target.value; render(); };
    $('#pj-fstatus').onchange = function (e) { FilterState.projects.status = e.target.value; render(); };
    $('#pj-arch').onchange = function (e) { FilterState.projects.archived = e.target.checked; render(); };
    var ea = $('#empty-proj'); if (ea) ea.onclick = function () { openProjectForm(); };
  }, 0);
  return h;
};
Routes.project = async function (id) {
  const d = await ProjectService.detail(id);
  const p = d.project;
  const cust = p.customerId ? await Repo.get('customers', p.customerId) : null;
  const deal = p.dealId ? await Repo.get('deals', p.dealId) : null;
  let h = '<div class="profile-card"><div class="profile-top"><div class="avatar">' + esc((p.name || '؟').charAt(0)) + '</div>' +
    '<div class="who"><h2>' + esc(p.name) + '</h2><div class="sub">' + (PROJECT_STATUS[p.status] || p.status) + (p.archived ? ' (آرشیو)' : '') + '</div></div></div>' +
    '<div class="profile-meta"><div class="mrow"><span class="mk">مشتری</span><span class="mv">' + (cust ? esc(cust.name) : '—') + '</span></div>' +
    (deal ? '<div class="mrow"><span class="mk">Deal مرتبط</span><span class="mv">' + esc(deal.title) + '</span></div>' : '') +
    '<div class="mrow"><span class="mk">شروع</span><span class="mv">' + (p.startDate ? dateFa(p.startDate) : '—') + '</span></div>' +
    '<div class="mrow"><span class="mk">ددلاین</span><span class="mv">' + (p.deadline ? dateFa(p.deadline) : '—') + '</span></div>' +
    '<div class="mrow"><span class="mk">آخرین فعالیت</span><span class="mv">' + (p.lastActivityAt ? dateFa(p.lastActivityAt) : '—') + '</span></div></div></div>' +
    '<div class="card">' + field('تغییر وضعیت', '<select id="pd-status">' +
    Object.keys(PROJECT_STATUS).map(k => '<option value="' + k + '" ' + (p.status === k ? 'selected' : '') + '>' + PROJECT_STATUS[k] + '</option>').join('') + '</select>') + '</div>' +
    '<div class="btn-row"><button class="btn small" id="pd-edit">ویرایش</button>' +
    (cust ? '<button class="btn small ghost" data-nav="customer/' + cust.id + '">مشتری</button>' : '') +
    (deal ? '<button class="btn small ghost" data-nav="deal/' + deal.id + '">Deal</button>' : '') +
    '<button class="btn small secondary" id="pd-arch">' + (p.archived ? 'خروج از آرشیو' : 'آرشیو') + '</button>' +
    '<button class="btn small danger" id="pd-del">حذف دائمی</button></div>' +
    '<div class="btn-row"><button class="btn small" id="pd-call">+ تماس</button><button class="btn small" id="pd-fu">+ پیگیری</button><button class="btn small" id="pd-task">+ کار</button></div>';
  h += secList('کارها', d.tasks, t => '<div class="list-item" data-task="' + t.id + '"><div><b>' + esc(t.title) + '</b><br><span class="muted">' + (t.dueDate ? dateFa(t.dueDate) : '—') + ' — ' + (t.status === 'done' ? 'انجام‌شده' : 'باز') + '</span></div></div>');
  h += secList('تماس‌ها', d.calls, c => '<div class="list-item" data-call="' + c.id + '"><div><b>' + esc(c.result || '—') + '</b></div><span class="muted">' + dateTimeFa(c.createdAt) + '</span></div>');
  h += secList('پیگیری‌ها', d.followups, f => '<div class="list-item"><div><b>' + esc(f.title) + '</b><br><span class="muted">' + dateFa(f.dueDate) + ' — ' + esc(f.status) + '</span></div></div>');
  h += secTitle('Timeline') + '<div class="card">' +
    (d.activities.length ? d.activities.map(a => '<div class="timeline-item"><b>' + esc(activityLabel(a.type)) + '</b> — ' + esc(a.note || '') + '<br><span class="muted">' + dateTimeFa(a.createdAt) + '</span></div>').join('') : '<div class="muted">فعالیتی ثبت نشده</div>') + '</div>';
  setTimeout(function () {
    $('#pd-status').onchange = async function (e) {
      try { await ProjectService.update(id, { status: e.target.value }); toast('وضعیت تغییر کرد', 'ok'); render(id); }
      catch (err) { toast(errMsg(err), 'err'); }
    };
    $('#pd-edit').onclick = function () { openProjectForm(p); };
    $('#pd-call').onclick = function () { openCallForm(p.customerId, null, id); };
    $('#pd-fu').onclick = function () { openFollowupForm(p.customerId, 'project', id); };
    $('#pd-task').onclick = function () { openTaskForm('project', id); };
    $('#pd-arch').onclick = function () { guard($('#pd-arch'), async function () { await ProjectService.archive(id, !p.archived); toast('انجام شد', 'ok'); render(id); }); };
    $('#pd-del').onclick = function () {
      confirmDlg('حذف دائمی پروژه؟ در صورت وجود رکورد وابسته، حذف رد می‌شود.', function () { guard($('#pd-del'), async function () { await ProjectService.deleteHard(id); toast('حذف شد', 'ok'); navigate('projects'); }); });
    };
    document.querySelectorAll('[data-call]').forEach(row => row.onclick = function (e) { if (e.target.closest('button')) return; openCallDetail(row.dataset.call); });
    document.querySelectorAll('[data-task]').forEach(row => row.onclick = function (e) { if (e.target.closest('button')) return; openTaskDetail(row.dataset.task); });
  }, 0);
  return h;
};
Routes.tasks = async function () {
  const all = await Repo.list('tasks');
  all.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const open = all.filter(t => t.status !== 'done');
  const done = all.filter(t => t.status === 'done').slice(-20).reverse();
  const renderTask = function (t, i) {
    return '<div class="list-item ' + enterCls(i) + '" data-task="' + t.id + '"><div>' +
      '<b style="' + (t.status === 'done' ? 'text-decoration:line-through;color:var(--faint)' : '') + '">' + esc(t.title) + '</b>' +
      (t.priority === 'high' ? ' ' + badge('اولویت بالا', 'danger') : '') +
      (t.status !== 'done' && Dates.isOverdue(t.dueDate) ? ' ' + badge('عقب‌افتاده', 'danger') : '') +
      '<br><span class="muted">' + (t.dueDate ? dateFa(t.dueDate) : 'بدون تاریخ') + (t.dueTime ? ' — ' + t.dueTime : '') + '</span></div>' +
      '<div style="display:flex;gap:.3rem;flex-shrink:0"><button class="btn small" data-tk-toggle="' + t.id + '">' + (t.status === 'done' ? 'بازگردانی' : 'انجام') + '</button>' +
      '<button class="btn small danger" data-tk-del="' + t.id + '">حذف</button></div></div>';
  };
  let h = '<button class="btn btn-block" id="add-task">+ کار جدید</button>';
  h += secTitle('باز', open.length) + '<div class="card">' + (open.length ? open.map(renderTask).join('') : '<div class="muted">کاری باز نیست</div>') + '</div>';
  h += secTitle('انجام‌شده (آخرین‌ها)') + '<div class="card">' + (done.length ? done.map(renderTask).join('') : '<div class="muted">موردی نیست</div>') + '</div>';
  setTimeout(function () {
    $('#add-task').onclick = function () { openTaskForm(); };
    document.querySelectorAll('[data-tk-toggle]').forEach(b => b.onclick = function (e) {
      e.stopPropagation();
      guard(b, async function () { await TaskService.toggle(b.dataset.tkToggle); render(); });
    });
    document.querySelectorAll('[data-tk-del]').forEach(b => b.onclick = function (e) {
      e.stopPropagation();
      confirmDlg('حذف این کار؟', function () { guard(b, async function () { await TaskService.remove(b.dataset.tkDel); toast('حذف شد', 'ok'); render(); }); });
    });
    document.querySelectorAll('[data-task]').forEach(row => row.onclick = function (e) {
      if (e.target.closest('button')) return;
      openTaskDetail(row.dataset.task);
    });
  }, 0);
  return h;
};
var CalState = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: null };
Routes.calendar = async function () {
  let h = '<div class="cal-head"><button class="btn small secondary" id="cal-prev">ماه قبل</button><b id="cal-title"></b><button class="btn small secondary" id="cal-next">ماه بعد</button></div>' +
    '<div class="card"><div class="cal-grid" id="cal-grid"></div></div><div id="cal-day"></div>';
  setTimeout(function () {
    const grid = $('#cal-grid'), title = $('#cal-title');
    async function showDay() {
      const box = $('#cal-day');
      if (!CalState.sel) { box.innerHTML = ''; return; }
      const byDay = await CalendarService.forMonth(CalState.y, CalState.m);
      const ev = byDay[CalState.sel] || [];
      const kindLabel = { task: 'کار', followup: 'پیگیری', appointment: 'قرار', deadline: 'ددلاین', call: 'تماس' };
      box.innerHTML = secTitle(dateFa(CalState.sel), ev.length) + '<div class="card cal-body-anim">' +
        (ev.length ? ev.map(function (e) {
          let attrs = '';
          if (e.type === 'task') attrs = 'data-task="' + e.id + '"';
          else if (e.type === 'followup') attrs = 'data-nav="followups"';
          else if (e.type === 'appointment') attrs = 'data-nav="appointments"';
          else if (e.type === 'deadline' && e.id) attrs = 'data-nav="project/' + e.id + '"';
          else if (e.type === 'call') attrs = 'data-nav="calls"';
          return '<div class="list-item" ' + attrs + '><div><b>' + esc(e.title) + '</b></div>' + badge(kindLabel[e.type] || e.type) + '</div>';
        }).join('') : '<div class="muted">موردی در این روز نیست</div>') + '</div>';
      box.querySelectorAll('[data-task]').forEach(r => r.onclick = function (ev) { if (ev.target.closest('button')) return; openTaskDetail(r.dataset.task); });
    }
    async function draw() {
      title.textContent = new Date(CalState.y, CalState.m, 1).toLocaleDateString('fa-IR', { month: 'long', year: 'numeric' });
      const byDay = await CalendarService.forMonth(CalState.y, CalState.m);
      const today = Dates.todayStr();
      const dows = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
      let g = dows.map(function (d) { return '<div class="dow">' + d + '</div>'; }).join('');
      const firstDow = new Date(Date.UTC(CalState.y, CalState.m, 1)).getUTCDay();
      const offset = (firstDow + 1) % 7;
      for (let i = 0; i < offset; i++) g += '<div></div>';
      const last = new Date(Date.UTC(CalState.y, CalState.m + 1, 0)).getUTCDate();
      for (let day = 1; day <= last; day++) {
        const iso = new Date(Date.UTC(CalState.y, CalState.m, day)).toISOString().slice(0, 10);
        const ev = byDay[iso] || [];
        g += '<div class="day' + (iso === today ? ' today' : '') + (iso === CalState.sel ? ' selected' : '') + '" data-cal="' + iso + '">' + day +
          (ev.length ? '<br>' + ev.slice(0, 3).map(function () { return '<span class="dot"></span>'; }).join('') : '') + '</div>';
      }
      grid.innerHTML = g;
      grid.querySelectorAll('[data-cal]').forEach(c => c.onclick = async function () {
        CalState.sel = c.dataset.cal;
        await draw();
        showDay();
      });
    }
    $('#cal-prev').onclick = async function () { CalState.m--; if (CalState.m < 0) { CalState.m = 11; CalState.y--; } await draw(); showDay(); };
    $('#cal-next').onclick = async function () { CalState.m++; if (CalState.m > 11) { CalState.m = 0; CalState.y++; } await draw(); showDay(); };
    draw();
    if (CalState.sel) showDay();
  }, 0);
  return h;
};
Routes.products = async function () {
  const all = await Repo.list('products', p => FilterState.products.archived ? p.archived : !p.archived);
  const f = FilterState.products;
  let list = all;
  if (f.q) list = list.filter(p => ((p.name || '') + ' ' + (p.sku || '')).toLowerCase().includes(f.q.toLowerCase()));
  if (f.stock === 'low') list = list.filter(p => p.trackInventory && num(p.stock) <= num(p.minStock) && num(p.stock) > 0);
  if (f.stock === 'out') list = list.filter(p => p.trackInventory && num(p.stock) === 0);
  list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  const stockBadge = function (p) {
    if (!p.trackInventory) return badge('بدون ردیابی');
    if (num(p.stock) === 0) return badge('ناموجود', 'danger');
    if (num(p.stock) <= num(p.minStock)) return badge('کم', 'warn');
    return badge('موجود', 'ok');
  };
  let h = '<div class="card" style="padding:.7rem"><input id="pr-q" type="search" placeholder="جستجوی نام یا کد محصول…" value="' + esc(f.q) + '"></div>' +
    '<div class="filter-bar"><select id="pr-stock"><option value="">همه موجودی‌ها</option><option value="low" ' + (f.stock === 'low' ? 'selected' : '') + '>موجودی کم</option><option value="out" ' + (f.stock === 'out' ? 'selected' : '') + '>ناموجود</option></select>' +
    '<label><input type="checkbox" id="pr-arch" ' + (f.archived ? 'checked' : '') + '> آرشیو</label></div>' +
    '<button class="btn btn-block" id="add-prod">+ محصول جدید</button>';
  h += list.length ? '<div class="card">' + list.map((p, i) =>
    '<div class="list-item ' + enterCls(i) + '" data-nav="product/' + p.id + '"><div><b>' + esc(p.name) + '</b> ' + stockBadge(p) + (p.archived ? badge('آرشیو', 'warn') : '') + (p.sku ? ' ' + badge('SKU: ' + p.sku) : '') +
    '<br><span class="muted">قیمت: ' + fmt(p.price) + ' تومان' + (p.trackInventory ? ' — موجودی: ' + fmt(p.stock) + ' ' + esc(p.unit || '') : '') + '</span></div></div>').join('') + '</div>'
    : emptyState('محصولی ثبت نشده است. محصولات برای سفارش‌ها و ثبت تماس استفاده می‌شوند.', 'افزودن محصول', 'empty-prod', 'هنوز محصولی ثبت نشده');
  setTimeout(function () {
    $('#add-prod').onclick = function () { openProductForm(); };
    $('#pr-q').oninput = function (e) { FilterState.products.q = e.target.value; render(); };
    $('#pr-stock').onchange = function (e) { FilterState.products.stock = e.target.value; render(); };
    $('#pr-arch').onchange = function (e) { FilterState.products.archived = e.target.checked; render(); };
    var ea = $('#empty-prod'); if (ea) ea.onclick = function () { openProductForm(); };
  }, 0);
  return h;
};
async function openProductForm(existing) {
  const p = existing || {};
  modal(existing ? 'ویرایش محصول' : 'محصول جدید',
    field('نام محصول *', '<input id="prf-name" value="' + esc(p.name || '') + '">') +
    field('کد (SKU)', '<input id="prf-sku" value="' + esc(p.sku || '') + '">') +
    field('واحد', '<input id="prf-unit" value="' + esc(p.unit || 'عدد') + '">') +
    field('قیمت (تومان) *', '<input id="prf-price" type="number" min="0" step="any" value="' + esc(p.price == null ? '' : p.price) + '">') +
    '<label style="display:flex;align-items:center;gap:.4rem"><input type="checkbox" id="prf-track" ' + (p.trackInventory ? 'checked' : '') + '> ردیابی موجودی</label>' +
    field('موجودی فعلی', '<input id="prf-stock" type="number" min="0" step="any" value="' + esc(p.stock == null ? 0 : p.stock) + '">') +
    field('حداقل موجودی', '<input id="prf-min" type="number" min="0" step="any" value="' + esc(p.minStock == null ? 0 : p.minStock) + '">') +
    field('توضیحات', '<textarea id="prf-desc">' + esc(p.description || '') + '</textarea>') + formErr() +
    '<button class="btn btn-block" id="prf-save">ذخیره</button>',
    function () {
      $('#prf-save').onclick = function () {
        if (!val('prf-name').trim()) { showErr(new Error('نام محصول الزامی است')); return; }
        const data = {
          name: val('prf-name').trim(), sku: val('prf-sku').trim(), unit: val('prf-unit').trim() || 'عدد',
          price: Number(val('prf-price') || 0), trackInventory: $('#prf-track').checked,
          stock: Number(val('prf-stock') || 0), minStock: Number(val('prf-min') || 0),
          description: val('prf-desc').trim(), archived: p.archived || false,
        };
        guard($('#prf-save'), async function () {
          let saved;
          if (existing) saved = await ProductService.update(existing.id, data);
          else saved = await ProductService.create(data);
          closeModal(); toast('ذخیره شد', 'ok');
          navigate('product', saved.id);
        });
      };
    });
}
Routes.product = async function (id) {
  const p = await Repo.get('products', id);
  if (!p) return emptyState('محصول یافت نشد', 'بازگشت به محصولات', 'go-today');
  const audit = await Repo.getAudit('product', id);
  const soldItems = await Repo.list('orderItems', i => i.productId === id);
  let h = '<div class="profile-card"><div class="profile-top"><div class="avatar">' + esc((p.name || '؟').charAt(0)) + '</div>' +
    '<div class="who"><h2>' + esc(p.name) + '</h2><div class="sub">' + fmt(p.price) + ' تومان</div></div></div>' +
    '<div class="profile-meta">' +
    (p.sku ? '<div class="mrow"><span class="mk">کد</span><span class="mv">' + esc(p.sku) + '</span></div>' : '') +
    '<div class="mrow"><span class="mk">واحد</span><span class="mv">' + esc(p.unit || 'عدد') + '</span></div>' +
    (p.trackInventory ? '<div class="mrow"><span class="mk">موجودی</span><span class="mv">' + fmt(p.stock) + ' (حداقل: ' + fmt(p.minStock) + ')</span></div>' : '<div class="mrow"><span class="mk">ردیابی موجودی</span><span class="mv">غیرفعال</span></div>') +
    '<div class="mrow"><span class="mk">وضعیت</span><span class="mv">' + (p.archived ? 'آرشیو' : 'فعال') + '</span></div></div></div>' +
    '<div class="btn-row"><button class="btn small" id="pd-edit">ویرایش</button>' +
    '<button class="btn small secondary" id="pd-arch">' + (p.archived ? 'خروج از آرشیو' : 'آرشیو') + '</button>' +
    '<button class="btn small danger" id="pd-del">حذف دائمی</button></div>';
  if (p.description) h += '<div class="card"><div class="card-head"><h3>توضیحات</h3></div><p>' + esc(p.description) + '</p></div>';
  if (p.trackInventory) {
    h += secTitle('تغییر موجودی') + '<div class="card">' +
      field('مقدار تغییر (مثلاً ۵ یا -۳)', '<input id="pd-delta" type="number" step="any" value="0">') +
      field('دلیل', '<input id="pd-reason">') +
      '<button class="btn btn-block" id="pd-adjust">اعمال تغییر</button></div>';
  }
  if (soldItems.length) {
    const orders = await Repo.list('orders');
    const orderById = {};
    orders.forEach(o => { orderById[o.id] = o; });
    const byOrder = {};
    soldItems.forEach(it => { byOrder[it.orderId] = (byOrder[it.orderId] || 0) + num(it.quantity); });
    h += secTitle('دفعات فروش', Object.keys(byOrder).length) + '<div class="card">' + Object.keys(byOrder).map(oid =>
      '<div class="list-item" data-nav="order/' + oid + '"><div><b>' + esc((orderById[oid] || {}).number || 'سفارش') + '</b></div><span class="muted">تعداد: ' + fmt(byOrder[oid]) + '</span></div>').join('') + '</div>';
  }
  h += secTitle('تاریخچه تغییرات') + '<div class="card">' +
    (audit.length ? audit.slice(0, 20).map(a => '<div class="timeline-item"><b>' + esc(a.action) + '</b>' +
      (a.field ? ' — ' + esc(a.field) + ': ' + esc(a.oldVal == null ? '—' : a.oldVal) + ' ← ' + esc(a.newVal == null ? '—' : a.newVal) : '') +
      '<br><span class="muted">' + dateTimeFa(a.at) + '</span></div>').join('') : '<div class="muted">موردی ثبت نشده</div>') + '</div>';
  setTimeout(function () {
    bindGoToday();
    $('#pd-edit').onclick = function () { openProductForm(p); };
    $('#pd-arch').onclick = function () { guard($('#pd-arch'), async function () { await ProductService.archive(id, !p.archived); toast('انجام شد', 'ok'); render(id); }); };
    $('#pd-del').onclick = function () {
      confirmDlg('حذف دائمی محصول؟ در صورت استفاده در سفارش‌ها، حذف رد می‌شود.', function () {
        guard($('#pd-del'), async function () { await ProductService.deleteHard(id); toast('حذف شد', 'ok'); navigate('products'); });
      });
    };
    var adj = $('#pd-adjust');
    if (adj) adj.onclick = function () {
      guard(adj, async function () {
        await ProductService.adjustStock(id, Number(val('pd-delta') || 0), val('pd-reason').trim());
        toast('موجودی به‌روزرسانی شد', 'ok');
        render(id);
      });
    };
  }, 0);
  return h;
};
Routes.orders = async function () {
  const all = (await Repo.list('orders')).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const customers = await Repo.list('customers');
  const sts = await Repo.list('statuses', s => s.entityType === 'orders');
  const f = FilterState.orders;
  let list = all;
  if (f.q) list = list.filter(o => ((o.number || '') + ' ' + (o.notes || '')).toLowerCase().includes(f.q.toLowerCase()));
  if (f.status) list = list.filter(o => o.status === f.status);
  const custName = function (id) { const c = customers.find(x => x.id === id); return c ? c.name : '—'; };
  Array.from(new Set(all.map(o => o.status).filter(Boolean))).forEach(us => { if (!sts.some(s => s.name === us)) sts.push({ id: 'dyn_' + us, name: us }); });
  let h = '<div class="card" style="padding:.7rem"><input id="or-q" type="search" placeholder="جستجوی شماره سفارش…" value="' + esc(f.q) + '"></div>' +
    '<div class="filter-bar"><select id="or-status"><option value="">همه وضعیت‌ها</option>' +
    sts.map(s => '<option value="' + esc(s.name) + '" ' + (f.status === s.name ? 'selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></div>' +
    '<button class="btn btn-block" id="add-order">+ سفارش جدید</button>';
  h += list.length ? '<div class="card">' + list.map((o, i) =>
    '<div class="list-item ' + enterCls(i) + '" data-nav="order/' + o.id + '"><div>' +
    '<b>' + esc(o.number) + '</b> ' + badge(o.status, o.status === 'لغو شده' || o.status === 'cancelled' ? 'danger' : o.status === 'ارسال شده' || o.status === 'پرداخت شده' ? 'ok' : '') +
    '<br><span class="muted">' + esc(custName(o.customerId)) + ' — ' + dateFa(o.createdAt) + '</span></div>' +
    '<span class="muted"><b>' + fmt(o.total) + '</b></span></div>').join('') + '</div>'
    : emptyState('سفارشی ثبت نشده است. سفارش‌ها به مشتری و محصولات متصل می‌شوند و موجودی را به‌روزرسانی می‌کنند.', 'ثبت سفارش', 'empty-order', 'هنوز سفارشی ثبت نشده');
  setTimeout(function () {
    $('#add-order').onclick = function () { openOrderForm(); };
    $('#or-q').oninput = function (e) { FilterState.orders.q = e.target.value; render(); };
    $('#or-status').onchange = function (e) { FilterState.orders.status = e.target.value; render(); };
    var ea = $('#empty-order'); if (ea) ea.onclick = function () { openOrderForm(); };
  }, 0);
  return h;
};
async function openOrderForm(customerId) {
  const prods = await Repo.list('products', p => !p.archived);
  if (!prods.length) { toast('ابتدا از بخش محصولات، محصول اضافه کنید', 'warn'); navigate('products'); return; }
  let rowCount = 0;
  function addRow(it) {
    it = it || { productId: '', quantity: 1, discount: 0 };
    const rid = 'oi-' + (rowCount++);
    const div = document.createElement('div');
    div.className = 'filter-bar';
    div.innerHTML = '<select data-op="' + rid + '" style="margin:0;flex:2;min-width:8rem"><option value="">— محصول —</option>' +
      prods.map(p => '<option value="' + p.id + '" ' + (it.productId === p.id ? 'selected' : '') + '>' + esc(p.name) + ' (' + fmt(p.price) + ')</option>').join('') + '</select>' +
      '<input data-oq="' + rid + '" type="number" min="0.01" step="any" placeholder="تعداد" value="' + esc(it.quantity) + '" style="margin:0;flex:1;min-width:4rem">' +
      '<input data-od="' + rid + '" type="number" min="0" step="any" placeholder="تخفیف" value="' + esc(it.discount || 0) + '" style="margin:0;flex:1;min-width:4rem">' +
      '<button type="button" class="btn small danger" data-or="' + rid + '">حذف</button>';
    $('#order-items').appendChild(div);
    div.querySelector('[data-or]').onclick = function () { div.remove(); };
  }
  modal('سفارش جدید',
    field('مشتری *', '<select id="o-cust">' + await customerOptions(customerId) + '</select>') +
    '<div id="order-items"></div>' +
    '<button type="button" class="btn small secondary btn-block" id="o-add">+ افزودن قلم</button>' +
    field('تخفیف کلی (تومان)', '<input id="o-disc" type="number" min="0" step="any" value="0">') +
    field('مالیات (٪)', '<input id="o-tax" type="number" min="0" step="any" value="0">') +
    field('یادداشت', '<textarea id="o-notes"></textarea>') + formErr() +
    '<button class="btn btn-block" id="o-save">ثبت سفارش</button>',
    function () {
      addRow();
      $('#o-add').onclick = function () { addRow(); };
      $('#o-save').onclick = function () {
        const items = [];
        document.querySelectorAll('#order-items .filter-bar').forEach(function (row) {
          const pid = row.querySelector('[data-op]').value;
          if (!pid) return;
          items.push({
            productId: pid,
            quantity: Number(row.querySelector('[data-oq]').value || 0),
            discount: Number(row.querySelector('[data-od]').value || 0),
          });
        });
        if (!val('o-cust')) { showErr(new Error('انتخاب مشتری الزامی است')); return; }
        if (!items.length) { showErr(new Error('حداقل یک قلم سفارش لازم است')); return; }
        guard($('#o-save'), async function () {
          const o = await OrderService.create({
            customerId: val('o-cust'), items: items,
            extraDiscount: Number(val('o-disc') || 0), taxPercent: Number(val('o-tax') || 0),
            notes: val('o-notes').trim(),
          });
          closeModal(); toast('سفارش ' + o.number + ' ثبت شد', 'ok');
          navigate('order', o.id);
        });
      };
    });
}
Routes.order = async function (id) {
  const d = await OrderService.detail(id);
  const o = d.order;
  const cust = o.customerId ? await Repo.get('customers', o.customerId) : null;
  const sts = await Repo.list('statuses', s => s.entityType === 'orders');
  if (o.status && !sts.some(s => s.name === o.status)) sts.push({ id: 'dyn_' + o.status, name: o.status });
  const lineTotal = function (it) { return Math.round(num(it.quantity) * num(it.unitPriceSnapshot) - num(it.discount || 0)); };
  let h = '<div class="profile-card"><div class="profile-top"><div class="avatar">' + esc((o.number || '؟').charAt(0)) + '</div>' +
    '<div class="who"><h2>' + esc(o.number) + '</h2><div class="sub">' + fmt(o.total) + ' تومان</div></div></div>' +
    '<div class="profile-meta">' +
    '<div class="mrow"><span class="mk">مشتری</span><span class="mv">' + (cust ? esc(cust.name) : '—') + '</span></div>' +
    '<div class="mrow"><span class="mk">تاریخ ثبت</span><span class="mv">' + dateTimeFa(o.createdAt) + '</span></div>' +
    '<div class="mrow"><span class="mk">وضعیت</span><span class="mv">' + esc(o.status) + '</span></div></div></div>' +
    '<div class="btn-row">' + (cust ? '<button class="btn small ghost" data-nav="customer/' + cust.id + '">مشتری</button>' : '') + '</div>' +
    '<div class="card">' + field('تغییر وضعیت', '<select id="od-status">' +
    sts.map(s => '<option value="' + esc(s.name) + '" ' + (o.status === s.name ? 'selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>') + '</div>';
  h += secTitle('اقلام سفارش', d.items.length) + '<div class="card">' +
    d.items.map(it =>
      '<div class="list-item"><div><b>' + esc(it.productNameSnapshot || 'محصول') + '</b>' +
      '<br><span class="muted">تعداد: ' + fmt(it.quantity) + ' — قیمت واحد: ' + fmt(it.unitPriceSnapshot) +
      (num(it.discount || 0) ? ' — تخفیف: ' + fmt(it.discount) : '') + '</span></div>' +
      '<span class="muted"><b>' + fmt(lineTotal(it)) + '</b></span></div>').join('') + '</div>';
  h += secTitle('جمع فاکتور') + '<div class="card">' +
    '<div class="list-item"><span class="muted">جمع اقلام</span><span>' + fmt(o.subtotal) + '</span></div>' +
    '<div class="list-item"><span class="muted">تخفیف</span><span>' + fmt(o.discount) + '</span></div>' +
    '<div class="list-item"><span class="muted">مالیات</span><span>' + fmt(o.tax) + '</span></div>' +
    '<div class="list-item"><span><b>مبلغ نهایی</b></span><span><b>' + fmt(o.total) + ' تومان</b></span></div></div>';
  if (o.notes) h += '<div class="card"><div class="card-head"><h3>یادداشت</h3></div><p>' + esc(o.notes) + '</p></div>';
  setTimeout(function () {
    $('#od-status').onchange = async function (e) {
      try { await OrderService.updateStatus(id, e.target.value); toast('وضعیت تغییر کرد', 'ok'); render(id); }
      catch (err) { toast(errMsg(err), 'err'); }
    };
  }, 0);
  return h;
};
Routes.calls = async function () {
  const all = (await Repo.list('calls')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const customers = await Repo.list('customers');
  const q = FilterState.calls.q;
  let list = all;
  if (q) list = list.filter(c => ((c.result || '') + ' ' + (c.notes || '') + ' ' + (c.phone || '')).toLowerCase().includes(q.toLowerCase()));
  const custName = function (id) { const c = customers.find(x => x.id === id); return c ? c.name : '—'; };
  let h = '<div class="card" style="padding:.7rem"><input id="ca-q" type="search" placeholder="جستجو در تماس‌ها…" value="' + esc(q) + '"></div>' +
    '<button class="btn btn-block" id="add-call">+ ثبت تماس</button>';
  h += list.length ? '<div class="card">' + list.map((c, i) =>
    '<div class="list-item ' + enterCls(i) + '" data-call="' + c.id + '"><div>' +
    '<b>' + esc(c.result || 'بدون نتیجه') + '</b> ' + badge(custName(c.customerId)) +
    (c.nextCallDate ? ' ' + badge('تماس بعدی: ' + dateFa(c.nextCallDate), 'warn') : '') +
    '<br><span class="muted">' + dateTimeFa(c.createdAt) + (c.notes ? ' — ' + esc(c.notes.slice(0, 60)) : '') + '</span></div></div>').join('') + '</div>'
    : emptyState('تماسی ثبت نشده است. تماس‌ها در Timeline مشتری و گزارش‌ها استفاده می‌شوند.', 'ثبت تماس', 'empty-call', 'هنوز تماسی ثبت نشده');
  setTimeout(function () {
    $('#add-call').onclick = function () { openCallForm(); };
    $('#ca-q').oninput = function (e) { FilterState.calls.q = e.target.value; render(); };
    var ea = $('#empty-call'); if (ea) ea.onclick = function () { openCallForm(); };
    document.querySelectorAll('[data-call]').forEach(row => row.onclick = function (e) {
      if (e.target.closest('button')) return;
      openCallDetail(row.dataset.call);
    });
  }, 0);
  return h;
};
Routes.followups = async function () {
  const all = await Repo.list('followups');
  const customers = await Repo.list('customers');
  const f = FilterState.followups;
  const today = Dates.todayStr();
  let list;
  if (f.status === 'overdue') list = all.filter(x => x.status === 'open' && x.dueDate && x.dueDate < today);
  else if (f.status === 'today') list = all.filter(x => x.status === 'open' && x.dueDate === today);
  else if (f.status === 'done') list = all.filter(x => x.status === 'done');
  else list = all.filter(x => x.status === 'open');
  list = list.slice().sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const custName = function (id) { const c = customers.find(x => x.id === id); return c ? c.name : '—'; };
  const seg = '<div class="seg">' +
    '<button data-fst="open" class="' + (f.status === 'open' ? 'active' : '') + '">باز</button>' +
    '<button data-fst="today" class="' + (f.status === 'today' ? 'active' : '') + '">امروز</button>' +
    '<button data-fst="overdue" class="' + (f.status === 'overdue' ? 'active' : '') + '">عقب‌افتاده</button>' +
    '<button data-fst="done" class="' + (f.status === 'done' ? 'active' : '') + '">انجام‌شده</button></div>';
  let h = seg + '<button class="btn btn-block" id="add-fu">+ پیگیری جدید</button>';
  h += list.length ? '<div class="card">' + list.map((x, i) => {
    const overdue = x.status === 'open' && x.dueDate && x.dueDate < today;
    let acts = '';
    if (x.status === 'open') acts = '<button class="btn small" data-fu-done="' + x.id + '">انجام شد</button> ' +
      '<button class="btn small secondary" data-fu-snooze="' + x.id + '">تعویق</button> ' +
      '<button class="btn small ghost" data-fu-cancel="' + x.id + '">لغو</button>';
    return '<div class="list-item ' + enterCls(i) + '" data-nav="customer/' + x.customerId + '"><div>' +
      '<b>' + esc(x.title) + '</b> ' + (overdue ? badge('عقب‌افتاده', 'danger') : x.status === 'done' ? badge('انجام‌شده', 'ok') : badge(dateFa(x.dueDate))) +
      (x.priority === 'high' && x.status === 'open' ? ' ' + badge('اولویت بالا', 'danger') : '') +
      '<br><span class="muted">' + esc(custName(x.customerId)) + ' — ' + (x.dueDate ? dateFa(x.dueDate) : '—') + (x.dueTime ? ' ' + x.dueTime : '') + '</span>' +
      (x.result ? '<br><span class="muted">نتیجه: ' + esc(x.result) + '</span>' : '') + '</div>' +
      '<div style="display:flex;gap:.3rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">' + acts + '</div></div>';
  }).join('') + '</div>'
    : emptyState('پیگیری‌ای در این وضعیت وجود ندارد.', 'پیگیری جدید', 'empty-fu', 'فهرست خالی است');
  setTimeout(function () {
    $('#add-fu').onclick = function () { openFollowupForm(); };
    document.querySelectorAll('[data-fst]').forEach(b => b.onclick = function () { FilterState.followups.status = b.dataset.fst; render(); });
    var ea = $('#empty-fu'); if (ea) ea.onclick = function () { openFollowupForm(); };
    document.querySelectorAll('[data-fu-done]').forEach(b => b.onclick = function (e) {
      e.stopPropagation();
      guard(b, async function () { await FollowUpService.complete(b.dataset.fuDone, ''); toast('پیگیری انجام شد', 'ok'); render(); });
    });
    document.querySelectorAll('[data-fu-snooze]').forEach(b => b.onclick = function (e) {
      e.stopPropagation();
      guard(b, async function () { await FollowUpService.snooze(b.dataset.fuSnooze, 1); toast('یک روز به تعویق افتاد', 'info'); render(); });
    });
    document.querySelectorAll('[data-fu-cancel]').forEach(b => b.onclick = function (e) {
      e.stopPropagation();
      guard(b, async function () { await FollowUpService.cancel(b.dataset.fuCancel); toast('لغو شد', 'ok'); render(); });
    });
  }, 0);
  return h;
};
Routes.appointments = async function () {
  const all = (await Repo.list('appointments')).sort((a, b) => String(b.datetime || '').localeCompare(String(a.datetime || '')));
  const customers = await Repo.list('customers');
  const custName = function (id) { const c = customers.find(x => x.id === id); return c ? c.name : '—'; };
  let h = '<button class="btn btn-block" id="add-appt">+ قرار جدید</button>';
  h += all.length ? '<div class="card">' + all.map((a, i) =>
    '<div class="list-item ' + enterCls(i) + '"><div>' +
    '<b>' + esc(a.title) + '</b> ' + (a.status === 'cancelled' ? badge('لغو شده', 'danger') : badge('برنامه‌ریزی شده', 'ok')) +
    '<br><span class="muted">' + esc(custName(a.customerId)) + ' — ' + dateTimeFa(a.datetime) +
    (a.location ? ' — ' + esc(a.location) : '') + '</span></div>' +
    '<div style="display:flex;gap:.3rem;flex-shrink:0">' +
    (a.status !== 'cancelled' ? '<button class="btn small" data-ap-edit="' + a.id + '">ویرایش</button>' +
      '<button class="btn small secondary" data-ap-cancel="' + a.id + '">لغو</button>' : '') +
    '</div></div>').join('') + '</div>'
    : emptyState('قراری ثبت نشده است. قرارها به مشتری و در صورت نیاز به Deal یا پروژه متصل می‌شوند.', 'قرار جدید', 'empty-appt', 'هنوز قراری ثبت نشده');
  setTimeout(function () {
    $('#add-appt').onclick = function () { openAppointmentForm(null); };
    var ea = $('#empty-appt'); if (ea) ea.onclick = function () { openAppointmentForm(null); };
    document.querySelectorAll('[data-ap-edit]').forEach(b => b.onclick = function () {
      const a = all.find(x => x.id === b.dataset.apEdit);
      if (a) openAppointmentForm(a.customerId, a);
    });
    document.querySelectorAll('[data-ap-cancel]').forEach(b => b.onclick = function () {
      guard(b, async function () { await AppointmentService.cancel(b.dataset.apCancel); toast('لغو شد', 'ok'); render(); });
    });
  }, 0);
  return h;
};
Routes.reports = async function () {
  const [orders, deals, projects, customers, activities, items] = await Promise.all([
    Repo.list('orders'),
    Repo.list('deals', d => !d.archived),
    Repo.list('projects', p => !p.archived),
    Repo.list('customers'),
    Repo.list('activities'),
    Repo.list('orderItems'),
  ]);
  const valid = orders.filter(o => o.status !== 'لغو شده' && o.status !== 'cancelled');
  const salesTotal = valid.reduce((s, o) => s + num(o.total), 0);
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(); dt.setMonth(dt.getMonth() - i);
    months.push(dt.toISOString().slice(0, 7));
  }
  const byMonth = months.map(m => ({
    m: m,
    sum: valid.filter(o => String(o.createdAt).slice(0, 7) === m).reduce((s, o) => s + num(o.total), 0),
    n: valid.filter(o => String(o.createdAt).slice(0, 7) === m).length,
  }));
  const maxMonth = Math.max.apply(null, byMonth.map(x => x.sum).concat([1]));
  const won = deals.filter(d => d.status === 'won');
  const lost = deals.filter(d => d.status === 'lost');
  const open = deals.filter(d => d.status === 'open');
  const byCust = {};
  valid.forEach(o => { byCust[o.customerId] = (byCust[o.customerId] || 0) + num(o.total); });
  const topCustomers = Object.keys(byCust).sort((a, b) => byCust[b] - byCust[a]).slice(0, 5)
    .map(id => ({ id: id, name: (customers.find(c => c.id === id) || {}).name || '—', total: byCust[id] }));
  const maxCust = Math.max.apply(null, topCustomers.map(x => x.total).concat([1]));
  const byProd = {};
  items.forEach(it => { byProd[it.productNameSnapshot] = (byProd[it.productNameSnapshot] || 0) + num(it.quantity); });
  const topProducts = Object.keys(byProd).sort((a, b) => byProd[b] - byProd[a]).slice(0, 5)
    .map(name => ({ name: name, qty: byProd[name] }));
  const maxProd = Math.max.apply(null, topProducts.map(x => x.qty).concat([1]));
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const recent = activities.filter(a => a.createdAt >= cutoff);
  const byType = {};
  recent.forEach(a => { byType[activityLabel(a.type)] = (byType[activityLabel(a.type)] || 0) + 1; });
  const stalled = await StaleService.findStalled();
  const lowStock = await ProductService.lowStock();
  let h = '<div class="stat-cards two">' +
    '<div class="stat"><div class="v v-anim">' + fmt(salesTotal) + '</div><div class="l">فروش کل (تومان)</div></div>' +
    '<div class="stat"><div class="v v-anim">' + fmt(valid.length) + '</div><div class="l">سفارش موثر</div></div>' +
    '<div class="stat"><div class="v v-anim">' + fmt(open.length) + '</div><div class="l">Deal باز</div></div>' +
    '<div class="stat"><div class="v v-anim">' + fmt(activities.length) + '</div><div class="l">کل فعالیت‌ها</div></div></div>';
  h += secTitle('فروش ۶ ماه اخیر') + '<div class="card">' +
    byMonth.map(x => hbar(new Date(x.m + '-01').toLocaleDateString('fa-IR', { month: 'long' }), x.sum, maxMonth, fmt(x.n) + ' سفارش — ' + fmt(x.sum))).join('') + '</div>';
  h += secTitle('وضعیت Dealها') + '<div class="card">' +
    '<div class="list-item"><span>' + badge('باز', 'info') + ' Deal باز</span><span class="muted">' + fmt(open.length) + ' — ارزش: ' + fmt(open.reduce((s, d) => s + num(d.value), 0)) + '</span></div>' +
    '<div class="list-item"><span>' + badge('برد', 'ok') + ' برده شده</span><span class="muted">' + fmt(won.length) + ' — ارزش: ' + fmt(won.reduce((s, d) => s + num(d.value), 0)) + '</span></div>' +
    '<div class="list-item"><span>' + badge('باخت', 'danger') + ' باخته</span><span class="muted">' + fmt(lost.length) + '</span></div></div>';
  if (topCustomers.length) h += secTitle('مشتریان برتر (بر اساس خرید)') + '<div class="card">' +
    topCustomers.map(x => '<div class="list-item" data-nav="customer/' + x.id + '"><div><b>' + esc(x.name) + '</b></div><span class="muted"><b>' + fmt(x.total) + '</b></span></div>').join('') + '</div>';
  if (topProducts.length) h += secTitle('محصولات پرفروش (بر اساس تعداد)') + '<div class="card">' +
    topProducts.map(x => hbar(x.name, x.qty, maxProd, fmt(x.qty))).join('') + '</div>';
  h += secTitle('فعالیت‌های ۳۰ روز اخیر', recent.length) + '<div class="card">' +
    (Object.keys(byType).length ? Object.keys(byType).map(t =>
      '<div class="list-item"><span>' + esc(t) + '</span><span class="muted">' + fmt(byType[t]) + '</span></div>').join('') : '<div class="muted">فعالیتی ثبت نشده</div>') + '</div>';
  h += secTitle('هشدارهای عملیاتی') + '<div class="card">' +
    '<div class="list-item" data-nav="reports"><span>' + badge('خوابیده', 'warn') + ' Deal خوابیده</span><span class="muted">' + fmt(stalled.deals.length) + '</span></div>' +
    '<div class="list-item" data-nav="reports"><span>' + badge('خوابیده', 'warn') + ' پروژه خوابیده</span><span class="muted">' + fmt(stalled.projects.length) + '</span></div>' +
    '<div class="list-item" data-nav="products"><span>' + badge('موجودی کم', 'danger') + ' محصولات کم‌موجودی</span><span class="muted">' + fmt(lowStock.length) + '</span></div></div>';
  setTimeout(bindGoToday, 0);
  return h;
};
// Badge for the notification "وضعیت Permission" row. Input is the normalized state used
// everywhere else: 'granted' | 'denied' | 'prompt' | 'unsupported' | 'error'.
// 'unsupported' means only "no notification API at all" (neither native plugin nor browser).
function notifPermBadge(st) {
  return st === 'granted' ? badge('فعال', 'ok')
    : st === 'denied' ? badge('رد شده', 'danger')
    : st === 'unsupported' ? badge('پشتیبانی نمی‌شود', 'warn')
    : st === 'error' ? badge('بررسی ناموفق بود', 'danger')
    : badge('تعیین نشده');
}
Routes.settings = async function () {
  const s = await Repo.getSettings();
  // The Web Notification API does not exist inside the Android WebView, so testing
  // 'Notification' in window reported "unsupported" even while the native permission was
  // granted. The real state comes from CRMNative.notifStatus() (backed by
  // @capacitor/local-notifications on Android, by the Web API in a browser).
  let perm = 'unsupported';
  try {
    if (window.CRMNative && typeof CRMNative.notifStatus === 'function') perm = await CRMNative.notifStatus();
    else if ('Notification' in window) perm = Notification.permission === 'default' ? 'prompt' : Notification.permission;
  } catch (e) { perm = 'error'; }
  let h = secTitle('تنظیمات عمومی') + '<div class="card">' +
    field('روزهای بدون فعالیت برای «خوابیده»', '<input id="st-inact" type="number" min="1" step="1" value="' + esc(s.inactivityDays) + '">') +
    field('درصد مالیات پیش‌فرض', '<input id="st-tax" type="number" min="0" max="100" step="any" value="' + esc(s.taxDefault) + '">') +
    '<button class="btn btn-block" id="st-save">ذخیره تنظیمات</button></div>';
  h += secTitle('اعلان‌ها') + '<div class="card">' +
    '<div class="list-item"><span class="muted">وضعیت Permission</span><span id="st-notif-perm">' +
    notifPermBadge(perm) + '</span></div>' +
    '<button class="btn btn-block" id="st-notif">فعال‌سازی اعلان‌ها</button>' +
    '<p class="muted">یادآوری‌ها برای پیگیری، کار و قرار زمان‌بندی می‌شوند. در نسخه Android، اعلان‌ها به‌صورت Native نمایش داده می‌شوند.</p></div>';
  h += secTitle('پشتیبان‌گیری و داده') + '<div class="card">' +
    '<button class="btn btn-block" id="st-export">دانلود پشتیبان JSON</button>' +
    '<button class="btn secondary btn-block" id="st-csv">دانلود مشتریان (CSV)</button>' +
    '<hr class="divider">' +
    '<input type="file" id="st-import" accept=".json" aria-label="فایل پشتیبان">' +
    '<div id="st-preview"></div></div>';
  setTimeout(function () {
    $('#st-save').onclick = function () {
      guard($('#st-save'), async function () {
        await Repo.saveSettings({ inactivityDays: Number(val('st-inact') || 7), taxDefault: Number(val('st-tax') || 0) });
        toast('تنظیمات ذخیره شد', 'ok');
      });
    };
    $('#st-notif').onclick = function () {
      guard($('#st-notif'), async function () {
        const r = await NotifService.requestPermission();
        if (r.ok) toast('اعلان‌ها فعال شد', 'ok'); else toast(r.reason || 'فعال‌سازی ناموفق بود', 'err');
        render();
      });
    };
    $('#st-export').onclick = function () {
      guard($('#st-export'), async function () {
        const dump = await BackupService.exportJSON();
        await Repo.saveSettings({ lastBackupAt: new Date().toISOString() });
        dlBlob(JSON.stringify(dump, null, 2), 'crm-backup-' + Dates.todayStr() + '.json', 'application/json;charset=utf-8');
        toast('پشتیبان ایجاد شد', 'ok');
      });
    };
    $('#st-csv').onclick = function () {
      guard($('#st-csv'), async function () {
        const cs = await Repo.list('customers');
        const csv = await BackupService.exportCSV(cs, ['name', 'phone', 'email', 'notes']);
        dlBlob(csv, 'customers-' + Dates.todayStr() + '.csv', 'text/csv;charset=utf-8');
        toast('CSV آماده شد', 'ok');
      });
    };
    $('#st-import').onchange = function (e) {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async function () {
        try {
          const dump = JSON.parse(reader.result);
          if (!dump || !dump.data) throw new Error('فایل پشتیبان نامعتبر است');
          let total = 0, dup = 0;
          const rows = [];
          for (const st of Object.keys(dump.data)) {
            if (BackupService.STORES.indexOf(st) === -1) continue;
            let d = 0;
            for (const row of dump.data[st]) { if (await DB.get(st, row.id)) d++; }
            total += dump.data[st].length; dup += d;
            if (dump.data[st].length) rows.push('<div class="list-item"><span>' + esc(st) + '</span><span class="muted">' + fmt(dump.data[st].length) + ' رکورد' + (d ? ' — ' + fmt(d) + ' تکراری' : '') + '</span></div>');
          }
          $('#st-preview').innerHTML = secTitle('پیش‌نمایش ورود', total) + '<div class="card">' + rows.join('') +
            '<button class="btn btn-block" id="st-impgo">تایید و ورود داده</button></div>';
          $('#st-impgo').onclick = function () {
            confirmDlg('ورود ' + total + ' رکورد تأیید می‌شود؟ رکوردهای تکراری رد می‌شوند.', function () {
              guard($('#st-impgo'), async function () {
                const r = await BackupService.importJSON(dump);
                toast(r.added + ' رکورد وارد شد، ' + r.skipped + ' رد شد', 'ok');
                $('#st-preview').innerHTML = '';
              });
            });
          };
        } catch (err) { $('#st-preview').innerHTML = '<div class="error-text">' + esc(errMsg(err)) + '</div>'; }
      };
      reader.readAsText(f);
    };
  }, 0);
  return h;
};
function dlBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}
Routes.pipelines = async function () {
  const pipelines = await Repo.list('pipelines');
  pipelines.sort((a, b) => (a.order || 0) - (b.order || 0));
  const stages = await Repo.list('stages');
  let h = '<button class="btn btn-block" id="pl-add">+ Pipeline جدید</button>';
  h += pipelines.length ? pipelines.map(p => {
    const ps = stages.filter(s => s.pipelineId === p.id).sort((a, b) => a.order - b.order);
    return secTitle(p.name, ps.length) + '<div class="card">' +
      '<div class="card-head"><h3>' + esc(p.name) + (p.isDefault ? ' ' + badge('پیش‌فرض', 'ok') : '') + '</h3>' +
      '<div style="display:flex;gap:.3rem">' + (p.isDefault ? '' : '<button class="btn small secondary" data-pl-def="' + p.id + '">پیش‌فرض</button>') +
      '<button class="btn small" data-pl-stage="' + p.id + '">+ مرحله</button></div></div>' +
      (ps.length ? ps.map(s =>
        '<div class="list-item"><div><b>' + esc(s.name) + '</b>' +
        (s.isWon ? ' ' + badge('برد', 'ok') : '') + (s.isLost ? ' ' + badge('باخت', 'danger') : '') + '</div>' +
        '<button class="btn small danger" data-pl-del="' + s.id + '">حذف</button></div>').join('')
      : '<div class="muted">مرحله‌ای تعریف نشده</div>') + '</div>';
  }).join('') : emptyState('Pipeline‌ای وجود ندارد.', 'ایجاد Pipeline', 'empty-pl', 'فهرست خالی است');
  setTimeout(function () {
    $('#pl-add').onclick = function () {
      modal('Pipeline جدید', field('نام *', '<input id="pn-name">') + formErr() +
        '<button class="btn btn-block" id="pn-save">ایجاد</button>', function () {
        $('#pn-save').onclick = function () {
          guard($('#pn-save'), async function () {
            await PipelineService.createPipeline(val('pn-name').trim());
            closeModal(); toast('Pipeline ایجاد شد', 'ok'); render();
          });
        };
      });
    };
    var ea = $('#empty-pl'); if (ea) ea.onclick = function () { $('#pl-add').click(); };
    document.querySelectorAll('[data-pl-def]').forEach(b => b.onclick = function () {
      guard(b, async function () { await PipelineService.setDefault(b.dataset.plDef); toast('پیش‌فرض شد', 'ok'); render(); });
    });
    document.querySelectorAll('[data-pl-stage]').forEach(b => b.onclick = function () {
      modal('مرحله جدید', field('نام *', '<input id="sn-name">') +
        '<label style="display:flex;align-items:center;gap:.4rem"><input type="checkbox" id="sn-won"> مرحله برد (Deal برده‌شده)</label>' +
        '<label style="display:flex;align-items:center;gap:.4rem"><input type="checkbox" id="sn-lost"> مرحله باخت (Deal باخته)</label>' +
        formErr() + '<button class="btn btn-block" id="sn-save">افزودن</button>', function () {
        $('#sn-save').onclick = function () {
          guard($('#sn-save'), async function () {
            await PipelineService.addStage(b.dataset.plStage, val('sn-name').trim(), $('#sn-won').checked, $('#sn-lost').checked);
            closeModal(); toast('مرحله اضافه شد', 'ok'); render();
          });
        };
      });
    });
    document.querySelectorAll('[data-pl-del]').forEach(b => b.onclick = function () {
      confirmDlg('حذف این مرحله؟ در صورت استفاده در Deal یا پروژه، حذف رد می‌شود.', function () {
        guard(b, async function () { await PipelineService.removeStage(b.dataset.plDel); toast('حذف شد', 'ok'); render(); });
      });
    });
  }, 0);
  return h;
};
Routes.customfields = async function () {
  const fields = await Repo.list('customFields');
  const entities = CustomFieldService.ENTITIES, labels = CustomFieldService.ENTITY_LABELS;
  let h = '<button class="btn btn-block" id="cf-add">+ فیلد سفارشی جدید</button>';
  h += entities.map(en => {
    const list = fields.filter(f => f.entityType === en).sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!list.length) return '';
    return secTitle(labels[en], list.length) + '<div class="card">' + list.map(f =>
      '<div class="list-item"><div><b>' + esc(f.label) + '</b> ' + badge(CustomFieldService.TYPE_LABELS[f.type] || f.type) +
      (f.options && f.options.length ? '<br><span class="muted">گزینه‌ها: ' + esc(f.options.join('، ')) + '</span>' : '') + '</div>' +
      '<button class="btn small danger" data-cf-del="' + f.id + '">حذف</button></div>').join('') + '</div>';
  }).join('');
  if (!fields.length) h += emptyState('فیلد سفارشی‌ای تعریف نشده است. فیلدها در فرم‌های ایجاد/ویرایش و صفحه جزئیات نمایش داده می‌شوند.', 'فیلد جدید', 'empty-cf', 'فهرست خالی است');
  setTimeout(function () {
    $('#cf-add').onclick = function () {
      modal('فیلد سفارشی جدید',
        field('موجودیت *', '<select id="cfn-ent">' + entities.map(e => '<option value="' + e + '">' + labels[e] + '</option>').join('') + '</select>') +
        field('عنوان *', '<input id="cfn-label">') +
        field('نوع *', '<select id="cfn-type">' + CustomFieldService.TYPES.map(t => '<option value="' + t + '">' + CustomFieldService.TYPE_LABELS[t] + '</option>').join('') + '</select>') +
        field('گزینه‌ها (برای نوع انتخابی — با ویرگول جدا کنید)', '<input id="cfn-opts">') +
        formErr() + '<button class="btn btn-block" id="cfn-save">ایجاد</button>', function () {
        $('#cfn-save').onclick = function () {
          guard($('#cfn-save'), async function () {
            await CustomFieldService.create({
              entityType: val('cfn-ent'), label: val('cfn-label').trim(), type: val('cfn-type'),
              options: val('cfn-opts').split('،').concat(val('cfn-opts').split(',')).map(x => x.trim()).filter(Boolean),
            });
            closeModal(); toast('فیلد ایجاد شد', 'ok'); render();
          });
        };
      });
    };
    var ea = $('#empty-cf'); if (ea) ea.onclick = function () { $('#cf-add').click(); };
    document.querySelectorAll('[data-cf-del]').forEach(b => b.onclick = function () {
      confirmDlg('حذف این فیلد؟ مقادیر ذخیره‌شده آن نیز حذف می‌شود.', function () {
        guard(b, async function () { await CustomFieldService.remove(b.dataset.cfDel); toast('حذف شد', 'ok'); render(); });
      });
    });
  }, 0);
  return h;
};
Routes.more = async function () {
  const items = [
    ['contacts', 'مخاطبین'], ['companies', 'شرکت‌ها'], ['leads', 'Leadها'], ['projects', 'پروژه‌ها'],
    ['calendar', 'تقویم'], ['products', 'محصولات'], ['orders', 'سفارش‌ها'], ['calls', 'تماس‌ها'],
    ['followups', 'پیگیری‌ها'], ['appointments', 'قرارها'], ['reports', 'گزارش‌ها'],
    ['pipelines', 'Pipelineها'], ['customfields', 'فیلدهای سفارشی'], ['settings', 'تنظیمات'],
  ];
  return '<div class="card">' + items.map(i =>
    '<div class="list-item" data-nav="' + i[0] + '"><span>' + esc(i[1]) + '</span></div>').join('') + '</div>';
};
(function initRoute() {
  var h = (location.hash || '').slice(1);
  var parts = h ? h.split('/') : [];
  currentRoute = parts[0] || 'today';
  render(parts[1] ? decodeURIComponent(parts[1]) : '', 'fwd');
})();// app.js ADDITIONS — STAGE 8 PART 2. Append this content EXACTLY at the end of
// app.js (after the final initRoute block). It only ADDS routes and wraps two
// existing routes (product: inventory history, customer/project: attachments,
// customers: bulk actions). Existing route logic is untouched.
/* global Routes, TITLES, Repo, DB, QuoteService, InventoryService, AttachmentService, SegmentService,
   KPIService, CustomerService, DealService, OrderService, ProductService, num, Dates, $, app, fmt, esc,
   dateFa, dateTimeFa, enterCls, toast, modal, closeModal, confirmDlg, errMsg, emptyState, field, formErr,
   showErr, badge, val, secTitle, secList, hbar, guard, navigate, render, FilterState, customerOptions,
   productOptions, dlBlob, BackupService */

Object.assign(TITLES, { quotes: 'پیشنهادهای قیمت', quote: 'پیشنهاد قیمت', segments: 'بخش‌بندی مشتریان', kpi: 'شاخص‌های فروش' });

// ============ QUOTES (پیشنهاد قیمت) ============
var QUOTE_STATUS_CLS = { 'پیش‌نویس': '', 'ارسال‌شده': 'info', 'پذیرفته‌شده': 'ok', 'ردشده': 'danger', 'منقضی‌شده': 'warn' };
Routes.quotes = async function () {
  const all = (await Repo.list('quotes')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const customers = await Repo.list('customers');
  const custName = function (id) { const c = customers.find(x => x.id === id); return c ? c.name : '—'; };
  let h = '<button class="btn btn-block" id="qt-add">+ پیشنهاد قیمت جدید</button>';
  h += all.length ? '<div class="card">' + all.map((q, i) =>
    '<div class="list-item ' + enterCls(i) + '" data-nav="quote/' + q.id + '"><div>' +
    '<b>' + esc(q.number) + '</b> ' + badge(q.status, QUOTE_STATUS_CLS[q.status] || '') +
    '<br><span class="muted">' + esc(custName(q.customerId)) + ' — ' + dateFa(q.issueDate) +
    (q.validUntil ? ' — اعتبار تا ' + dateFa(q.validUntil) : '') + '</span></div>' +
    '<span class="muted"><b>' + fmt(q.total) + '</b></span></div>').join('') + '</div>'
    : emptyState('پیشنهاد قیمتی ثبت نشده است. پیشنهاد قیمت به مشتری و در صورت نیاز به فرصت فروش متصل می‌شود و پیشنهاد پذیرفته‌شده مستقیماً به سفارش تبدیل می‌شود.', 'پیشنهاد جدید', 'empty-qt', 'هنوز پیشنهاد قیمتی ثبت نشده');
  setTimeout(function () {
    $('#qt-add').onclick = function () { openQuoteForm(); };
    var ea = $('#empty-qt'); if (ea) ea.onclick = function () { openQuoteForm(); };
  }, 0);
  return h;
};
async function openQuoteForm(customerId, dealId) {
  const prods = await Repo.list('products', p => !p.archived);
  if (!prods.length) { toast('ابتدا از بخش محصولات، محصول اضافه کنید', 'warn'); navigate('products'); return; }
  const settings = await Repo.getSettings();
  let rowCount = 0;
  function addRow(it) {
    it = it || { productId: '', quantity: 1, discount: 0 };
    const rid = 'qi-' + (rowCount++);
    const div = document.createElement('div');
    div.className = 'filter-bar';
    div.innerHTML = '<select data-op="' + rid + '" style="margin:0;flex:2;min-width:8rem"><option value="">— محصول —</option>' +
      prods.map(p => '<option value="' + p.id + '" ' + (it.productId === p.id ? 'selected' : '') + '>' + esc(p.name) + ' (' + fmt(p.price) + ')</option>').join('') + '</select>' +
      '<input data-oq="' + rid + '" type="number" min="0.01" step="any" placeholder="تعداد" value="' + esc(it.quantity) + '" style="margin:0;flex:1;min-width:4rem">' +
      '<input data-od="' + rid + '" type="number" min="0" step="any" placeholder="تخفیف" value="' + esc(it.discount || 0) + '" style="margin:0;flex:1;min-width:4rem">' +
      '<button type="button" class="btn small danger" data-or="' + rid + '">حذف</button>';
    $('#quote-items').appendChild(div);
    div.querySelector('[data-or]').onclick = function () { div.remove(); };
  }
  const deals = await Repo.list('deals', d => !d.archived && d.status === 'open');
  modal('پیشنهاد قیمت جدید',
    field('مشتری *', '<select id="q-cust">' + await customerOptions(customerId) + '</select>') +
    field('فرصت فروش مرتبط', '<select id="q-deal"><option value="">—</option>' + deals.map(d => '<option value="' + d.id + '" ' + (dealId === d.id ? 'selected' : '') + '>' + esc(d.title) + '</option>').join('') + '</select>') +
    field('تاریخ صدور', '<input id="q-issue" type="date" value="' + Dates.todayStr() + '">') +
    field('تاریخ اعتبار', '<input id="q-valid" type="date" value="' + Dates.addDays(30) + '">') +
    '<div id="quote-items"></div>' +
    '<button type="button" class="btn small secondary btn-block" id="q-add">+ افزودن قلم</button>' +
    field('تخفیف کلی (تومان)', '<input id="q-disc" type="number" min="0" step="any" value="0">') +
    field('مالیات (٪)', '<input id="q-tax" type="number" min="0" step="any" value="' + esc(settings.taxDefault || 0) + '">') +
    field('یادداشت', '<textarea id="q-notes"></textarea>') + formErr() +
    '<button class="btn btn-block" id="q-save">ثبت پیشنهاد</button>',
    function () {
      addRow();
      $('#q-add').onclick = function () { addRow(); };
      $('#q-save').onclick = function () {
        const items = [];
        document.querySelectorAll('#quote-items .filter-bar').forEach(function (row) {
          const pid = row.querySelector('[data-op]').value;
          if (!pid) return;
          items.push({ productId: pid, quantity: Number(row.querySelector('[data-oq]').value || 0), discount: Number(row.querySelector('[data-od]').value || 0) });
        });
        if (!val('q-cust')) { showErr(new Error('انتخاب مشتری الزامی است')); return; }
        if (!items.length) { showErr(new Error('حداقل یک قلم لازم است')); return; }
        guard($('#q-save'), async function () {
          const q = await QuoteService.create({
            customerId: val('q-cust'), dealId: val('q-deal') || null, items: items,
            issueDate: val('q-issue'), validUntil: val('q-valid') || null,
            discount: Number(val('q-disc') || 0), taxPercent: Number(val('q-tax') || 0),
            notes: val('q-notes').trim(),
          });
          closeModal(); toast('پیشنهاد ' + q.number + ' ثبت شد', 'ok');
          navigate('quote', q.id);
        });
      };
    });
}
Routes.quote = async function (id) {
  const d = await QuoteService.detail(id);
  const q = d.quote;
  const cust = q.customerId ? await Repo.get('customers', q.customerId) : null;
  const company = q.companyId ? await Repo.get('companies', q.companyId) : null;
  const deal = q.dealId ? await Repo.get('deals', q.dealId) : null;
  const lineTotal = function (it) { return Math.round(num(it.quantity) * num(it.unitPriceSnapshot) - num(it.discount || 0)); };
  let h = '<div class="profile-card"><div class="profile-top"><div class="avatar">' + esc((q.number || '؟').charAt(0)) + '</div>' +
    '<div class="who"><h2>' + esc(q.number) + '</h2><div class="sub">' + fmt(q.total) + ' تومان</div></div></div>' +
    '<div class="profile-meta">' +
    '<div class="mrow"><span class="mk">مشتری</span><span class="mv">' + (cust ? esc(cust.name) : '—') + '</span></div>' +
    (company ? '<div class="mrow"><span class="mk">شرکت</span><span class="mv">' + esc(company.name) + '</span></div>' : '') +
    (deal ? '<div class="mrow"><span class="mk">فرصت فروش</span><span class="mv">' + esc(deal.title) + '</span></div>' : '') +
    '<div class="mrow"><span class="mk">تاریخ صدور</span><span class="mv">' + dateFa(q.issueDate) + '</span></div>' +
    (q.validUntil ? '<div class="mrow"><span class="mk">اعتبار تا</span><span class="mv">' + dateFa(q.validUntil) + '</span></div>' : '') +
    '<div class="mrow"><span class="mk">وضعیت</span><span class="mv">' + esc(q.status) + '</span></div></div></div>' +
    '<div class="card">' + field('تغییر وضعیت', '<select id="qd-status">' +
    QuoteService.STATUSES.map(s => '<option value="' + s + '" ' + (q.status === s ? 'selected' : '') + '>' + s + '</option>').join('') + '</select>') + '</div>' +
    '<div class="btn-row">' +
    (q.status === 'پذیرفته‌شده' ? '<button class="btn" id="qd-convert">تبدیل به سفارش</button>' : '') + '</div>';
  h += secTitle('اقلام پیشنهاد', d.items.length) + '<div class="card">' +
    d.items.map(it => '<div class="list-item"><div><b>' + esc(it.productNameSnapshot || 'محصول') + '</b>' +
      '<br><span class="muted">تعداد: ' + fmt(it.quantity) + ' — قیمت واحد: ' + fmt(it.unitPriceSnapshot) +
      (num(it.discount || 0) ? ' — تخفیف: ' + fmt(it.discount) : '') + '</span></div>' +
      '<span class="muted"><b>' + fmt(lineTotal(it)) + '</b></span></div>').join('') + '</div>';
  h += secTitle('جمع') + '<div class="card">' +
    '<div class="list-item"><span class="muted">جمع اقلام</span><span>' + fmt(q.subtotal) + '</span></div>' +
    '<div class="list-item"><span class="muted">تخفیف</span><span>' + fmt(q.discount) + '</span></div>' +
    '<div class="list-item"><span class="muted">مالیات</span><span>' + fmt(q.tax) + '</span></div>' +
    '<div class="list-item"><span><b>مبلغ نهایی</b></span><span><b>' + fmt(q.total) + ' تومان</b></span></div></div>';
  if (q.notes) h += '<div class="card"><div class="card-head"><h3>یادداشت</h3></div><p>' + esc(q.notes) + '</p></div>';
  h += '<div class="btn-row"><button class="btn small danger" id="qd-del">حذف دائمی</button></div>';
  setTimeout(function () {
    $('#qd-status').onchange = async function (e) {
      try { await QuoteService.setStatus(id, e.target.value); toast('وضعیت تغییر کرد', 'ok'); render(id); }
      catch (err) { toast(errMsg(err), 'err'); }
    };
    var cv = $('#qd-convert');
    if (cv) cv.onclick = function () {
      confirmDlg('تبدیل این پیشنهاد به سفارش؟ اقلام و قیمت‌ها عیناً منتقل می‌شوند و موجودی کسر می‌شود.', function () {
        guard(cv, async function () {
          const o = await QuoteService.convertToOrder(id);
          toast('سفارش ' + o.number + ' ساخته شد', 'ok');
          navigate('order', o.id);
        });
      });
    };
    $('#qd-del').onclick = function () {
      confirmDlg('حذف دائمی پیشنهاد قیمت؟', function () {
        guard($('#qd-del'), async function () { await QuoteService.deleteHard(id); toast('حذف شد', 'ok'); navigate('quotes'); });
      });
    };
  }, 0);
  return h;
};

// ============ SEGMENTS (بخش‌بندی مشتریان) ============
var SEG_OPS = [
  ['spend_gt', 'ارزش خرید بیشتر از'], ['spend_lt', 'ارزش خرید کمتر از'],
  ['calls_lt', 'تعداد تماس کمتر از'], ['calls_gt', 'تعداد تماس بیشتر از'],
  ['inactive_days_ge', 'بدون فعالیت به مدت (روز)'], ['has_open_deal', 'دارای فرصت فروش باز'],
];
Routes.segments = async function () {
  const all = await Repo.list('segments');
  let h = '<button class="btn btn-block" id="sg-add">+ بخش جدید</button>';
  h += all.length ? '<div class="card">' + all.map(s =>
    '<div class="list-item"><div><b>' + esc(s.name) + '</b> ' + badge((s.conditions || []).length + ' شرط') + '</div>' +
    '<div style="display:flex;gap:.3rem;flex-shrink:0"><button class="btn small" data-sg-run="' + s.id + '">اجرا</button>' +
    '<button class="btn small danger" data-sg-del="' + s.id + '">حذف</button></div></div>').join('') + '</div>'
    : emptyState('بخشی تعریف نشده است. بخش‌بندی بر اساس داده واقعی (ارزش خرید، تماس‌ها، فعالیت، فرصت فروش) اجرا می‌شود.', 'بخش جدید', 'empty-sg', 'فهرست خالی است');
  h += '<div id="sg-result"></div>';
  setTimeout(function () {
    $('#sg-add').onclick = function () { openSegmentForm(); };
    var ea = $('#empty-sg'); if (ea) ea.onclick = function () { openSegmentForm(); };
    document.querySelectorAll('[data-sg-run]').forEach(b => b.onclick = function () {
      guard(b, async function () {
        const s = all.find(x => x.id === b.dataset.sgRun);
        const rows = await SegmentService.evaluate(s);
        $('#sg-result').innerHTML = secTitle('نتیجه: ' + s.name, rows.length) + '<div class="card">' +
          (rows.length ? rows.map(r => '<div class="list-item" data-nav="customer/' + r.customer.id + '"><div><b>' + esc(r.customer.name) + '</b>' +
            '<br><span class="muted">خرید: ' + fmt(r.totalSpend) + ' — تماس: ' + fmt(r.callCount) + ' — فرصت باز: ' + fmt(r.openDeals) + '</span></div></div>').join('')
          : '<div class="muted">هیچ مشتری با این شرایط یافت نشد</div>') + '</div>';
      });
    });
    document.querySelectorAll('[data-sg-del]').forEach(b => b.onclick = function () {
      confirmDlg('حذف این بخش؟', function () {
        guard(b, async function () { await SegmentService.remove(b.dataset.sgDel); toast('حذف شد', 'ok'); render(); });
      });
    });
  }, 0);
  return h;
};
function openSegmentForm() {
  let condCount = 0;
  function addCond() {
    const cid = 'sgc-' + (condCount++);
    const div = document.createElement('div');
    div.className = 'filter-bar';
    div.innerHTML = '<select data-cop="' + cid + '" style="margin:0;flex:2;min-width:9rem">' +
      SEG_OPS.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select>' +
      '<input data-cv="' + cid + '" type="number" step="any" placeholder="مقدار" value="0" style="margin:0;flex:1;min-width:4rem">' +
      '<button type="button" class="btn small danger" data-cr="' + cid + '">حذف</button>';
    $('#sg-conds').appendChild(div);
    div.querySelector('[data-cr]').onclick = function () { div.remove(); };
  }
  modal('بخش جدید',
    field('نام *', '<input id="sg-name">') +
    '<div id="sg-conds"></div>' +
    '<button type="button" class="btn small secondary btn-block" id="sg-addcond">+ افزودن شرط</button>' +
    formErr() + '<button class="btn btn-block" id="sg-save">ذخیره</button>',
    function () {
      addCond();
      $('#sg-addcond').onclick = addCond;
      $('#sg-save').onclick = function () {
        const conds = [];
        document.querySelectorAll('#sg-conds .filter-bar').forEach(function (row) {
          const v = row.querySelector('[data-cv]').value;
          conds.push({ op: row.querySelector('[data-cop]').value, value: v === '' ? true : Number(v) });
        });
        guard($('#sg-save'), async function () {
          await SegmentService.save(val('sg-name').trim(), conds);
          closeModal(); toast('بخش ذخیره شد', 'ok'); render();
        });
      };
    });
}

// ============ KPI (شاخص‌های فروش) ============
Routes.kpi = async function () {
  const k = await KPIService.sales();
  let h = '<div class="stat-cards two">' +
    '<div class="stat"><div class="v v-anim">' + fmt(k.leadCount) + '</div><div class="l">سرنخ فروش</div></div>' +
    '<div class="stat"><div class="v v-anim">' + fmt(k.dealCount) + '</div><div class="l">فرصت فروش</div></div>' +
    '<div class="stat"><div class="v v-anim">' + fmt(k.conversionRate) + '٪</div><div class="l">نرخ تبدیل سرنخ</div></div>' +
    '<div class="stat"><div class="v v-anim">' + fmt(k.winRate) + '٪</div><div class="l">نرخ برد</div></div>' +
    '<div class="stat"><div class="v v-anim">' + fmt(k.openValue) + '</div><div class="l">ارزش فرصت‌های باز</div></div>' +
    '<div class="stat"><div class="v v-anim">' + fmt(k.salesValue) + '</div><div class="l">فروش قطعی (تومان)</div></div>' +
    '<div class="stat"><div class="v v-anim">' + fmt(k.lostValue) + '</div><div class="l">فروش از دست‌رفته</div></div>' +
    '<div class="stat"><div class="v v-anim">' + fmt(k.avgDealValue) + '</div><div class="l">میانگین ارزش معامله</div></div></div>';
  h += '<div class="card">' +
    '<div class="list-item"><span class="muted">میانگین زمان فروش</span><span>' + (k.avgDaysToWin == null ? '—' : fmt(k.avgDaysToWin) + ' روز') + '</span></div>' +
    '<div class="list-item"><span class="muted">فرصت‌های بدون فعالیت</span><span>' + fmt(k.stalledDeals) + '</span></div>' +
    '<div class="list-item"><span class="muted">پروژه‌های خوابیده</span><span>' + fmt(k.stalledProjects) + '</span></div>' +
    '<div class="list-item"><span class="muted">پیگیری‌های عقب‌افتاده</span><span>' + fmt(k.overdueFollowups) + '</span></div>' +
    '<div class="list-item"><span class="muted">فعالیت‌های ۳۰ روز اخیر</span><span>' + fmt(k.activityCount30d) + '</span></div></div>';
  if (k.openByStage.length) {
    const maxSum = Math.max.apply(null, k.openByStage.map(x => x.sum).concat([1]));
    h += secTitle('ارزش باز به تفکیک مرحله فرایند فروش') + '<div class="card">' +
      k.openByStage.map(s => hbar(s.name, s.sum, maxSum, fmt(s.n) + ' فرصت — ' + fmt(s.sum))).join('') + '</div>';
  }
  setTimeout(bindGoToday, 0);
  return h;
};

// ============ INVENTORY UI (گردش موجودی در صفحه محصول) ============
(function wrapProductRoute() {
  const orig = Routes.product;
  Routes.product = async function (id) {
    const html = await orig(id);
    if (!html || typeof html !== 'string' || html.indexOf('empty') === 0) return html;
    const p = await Repo.get('products', id);
    if (!p) return html;
    const moves = await InventoryService.history(id);
    const typeLabel = { in: 'ورود', out: 'خروج', adjust: 'اصلاح' };
    const extra = secTitle('گردش موجودی', moves.length) + '<div class="card">' +
      (moves.length ? moves.slice(0, 20).map(m =>
        '<div class="list-item"><div><b>' + typeLabel[m.type] + '</b> ' + badge(fmt(m.quantity)) +
        '<br><span class="muted">' + esc(m.reason || '—') + ' — ' + dateTimeFa(m.at) + '</span></div>' +
        '<span class="muted">' + fmt(m.before) + ' ← ' + fmt(m.after) + '</span></div>').join('')
      : '<div class="muted">گردشی ثبت نشده است</div>') + '</div>' +
      secTitle('ثبت گردش موجودی') + '<div class="card">' +
      field('نوع', '<select id="iv-type"><option value="in">ورود موجودی</option><option value="out">خروج موجودی</option></select>') +
      field('مقدار', '<input id="iv-qty" type="number" step="any" min="0">') +
      field('دلیل', '<input id="iv-reason">') +
      '<button class="btn btn-block" id="iv-go">ثبت گردش</button></div>';
    setTimeout(function () {
      var go = $('#iv-go');
      if (go) go.onclick = function () {
        guard(go, async function () {
          const qty = val('iv-qty');
          if (qty === '') { showErr(new Error('مقدار الزامی است')); return; }
          await InventoryService.move(id, val('iv-type'), Number(qty), val('iv-reason').trim());
          toast('گردش ثبت شد', 'ok');
          render(id);
        });
      };
    }, 0);
    return html + extra;
  };
})();

// ============ ATTACHMENTS UI (پیوست‌ها) ============
function attachSection(ownerType, ownerId) {
  const boxId = 'att-' + ownerType + '-' + ownerId;
  setTimeout(async function () {
    const box = $('#' + boxId);
    if (!box) return;
    const list = await AttachmentService.forOwner(ownerType, ownerId);
    box.innerHTML = secTitle('پیوست‌ها', list.length) + '<div class="card">' +
      (list.length ? list.map(a =>
        '<div class="list-item"><div><b>' + esc(a.name) + '</b>' +
        '<br><span class="muted">' + esc(a.mime) + ' — ' + fmt(Math.round(a.size / 1024)) + ' کیلوبایت — ' + dateFa(a.createdAt) + '</span></div>' +
        '<div style="display:flex;gap:.3rem;flex-shrink:0"><button class="btn small" data-att-open="' + a.id + '">باز کردن</button>' +
        '<button class="btn small danger" data-att-del="' + a.id + '">حذف</button></div></div>').join('')
      : '<div class="muted">پیوستی ثبت نشده است</div>') +
      '<input type="file" id="' + boxId + '-file" style="display:none">' +
      '<button class="btn secondary btn-block" id="' + boxId + '-add">+ افزودن پیوست</button></div>';
    const input = $('#' + boxId + '-file');
    $('#' + boxId + '-add').onclick = function () { input.click(); };
    input.onchange = function () {
      const f = input.files[0];
      if (!f) return;
      guard($('#' + boxId + '-add'), async function () {
        await AttachmentService.add(ownerType, ownerId, f);
        toast('پیوست اضافه شد', 'ok');
        attachSection(ownerType, ownerId);
        var b = $('#' + boxId); if (b) b.innerHTML = '<div class="muted">در حال به‌روزرسانی…</div>';
      });
    };
    box.querySelectorAll('[data-att-open]').forEach(btn => btn.onclick = function () {
      guard(btn, async function () {
        const a = await DB.get('attachments', btn.dataset.attOpen);
        if (a) AttachmentService.open(a);
      });
    });
    box.querySelectorAll('[data-att-del]').forEach(btn => btn.onclick = function () {
      confirmDlg('حذف این پیوست؟ فایل قابل بازیابی نیست.', function () {
        guard(btn, async function () { await AttachmentService.remove(btn.dataset.attDel); toast('حذف شد', 'ok'); attachSection(ownerType, ownerId); });
      });
    });
  }, 0);
  return '<div id="' + boxId + '"></div>';
}
(function wrapAttachmentHosts() {
  // customer page: attachments card at the end
  const origCustomer = Routes.customer;
  Routes.customer = async function (id) { return await origCustomer(id) + attachSection('customer', id); };
  // project page
  const origProject = Routes.project;
  Routes.project = async function (id) { return await origProject(id) + attachSection('project', id); };
  // order page
  const origOrder = Routes.order;
  Routes.order = async function (id) { return await origOrder(id) + attachSection('order', id); };
})();

// ============ BULK ACTIONS (عملیات گروهی مشتریان) ============
var BulkState = { active: false, selected: [] };
(function wrapCustomersBulk() {
  const orig = Routes.customers;
  Routes.customers = async function () {
    const html = await orig();
    if (!BulkState.active) return html;
    setTimeout(function () {
      // inject checkboxes into rendered rows
      document.querySelectorAll('[data-nav^="customer/"]').forEach(function (row) {
        const id = row.dataset.nav.split('/')[1];
        if (!id || row.querySelector('[data-bulk-check]')) return;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('data-bulk-check', id);
        cb.style.cssText = 'width:22px;height:22px;flex-shrink:0;accent-color:var(--primary)';
        cb.checked = BulkState.selected.indexOf(id) !== -1;
        cb.onclick = function (e) {
          e.stopPropagation();
          if (cb.checked) { if (BulkState.selected.indexOf(id) === -1) BulkState.selected.push(id); }
          else BulkState.selected = BulkState.selected.filter(x => x !== id);
          updateBulkBar();
        };
        row.insertBefore(cb, row.firstChild);
      });
      var bar = $('#bulk-bar');
      if (bar) updateBulkBar();
    }, 0);
    return '<div id="bulk-bar"></div>' + html;
  };
})();
async function updateBulkBar() {
  const bar = $('#bulk-bar');
  if (!bar) return;
  const n = BulkState.selected.length;
  bar.innerHTML = '<div class="card"><div class="row"><b>انتخاب‌شده: ' + fmt(n) + '</b>' +
    '<div style="display:flex;gap:.3rem;flex-wrap:wrap">' +
    '<button class="btn small" id="bk-arch">آرشیو</button>' +
    '<button class="btn small" id="bk-tag">افزودن برچسب</button>' +
    '<button class="btn small secondary" id="bk-export">خروجی CSV</button>' +
    '<button class="btn small secondary" id="bk-exit">پایان انتخاب</button></div></div></div>';
  $('#bk-exit').onclick = function () { BulkState.active = false; BulkState.selected = []; render(); };
  $('#bk-arch').onclick = function () {
    if (!n) { toast('هیچ مشتری انتخاب نشده است', 'warn'); return; }
    confirmDlg('آرشیو ' + n + ' مشتری انتخاب‌شده؟', function () {
      guard($('#bk-arch'), async function () {
        for (const id of BulkState.selected) await CustomerService.archive(id, true);
        toast(n + ' مشتری آرشیو شد', 'ok');
        BulkState.selected = []; render();
      });
    });
  };
  $('#bk-tag').onclick = function () {
    if (!n) { toast('هیچ مشتری انتخاب نشده است', 'warn'); return; }
    openBulkTagForm();
  };
  $('#bk-export').onclick = function () {
    guard($('#bk-export'), async function () {
      const all = await Repo.list('customers');
      const rows = all.filter(c => BulkState.selected.indexOf(c.id) !== -1);
      const csv = await BackupService.exportCSV(rows, ['name', 'phone', 'email', 'notes']);
      dlBlob(csv, 'customers-selected-' + Dates.todayStr() + '.csv', 'text/csv;charset=utf-8');
      toast('خروجی آماده شد', 'ok');
    });
  };
}
async function openBulkTagForm() {
  const tags = await Repo.list('tags');
  if (!tags.length) { toast('ابتدا از منوی بیشتر، بخش تگ‌ها، تگ تعریف کنید', 'warn'); navigate('tags'); return; }
  modal('افزودن برچسب به ' + fmt(BulkState.selected.length) + ' مشتری',
    field('برچسب', '<select id="bt-tag">' + tags.map(t => '<option value="' + t.id + '">' + esc(t.name) + '</option>').join('') + '</select>') +
    formErr() + '<button class="btn btn-block" id="bt-go">افزودن</button>',
    function () {
      $('#bt-go').onclick = function () {
        guard($('#bt-go'), async function () {
          const tid = val('bt-tag');
          for (const id of BulkState.selected) {
            const c = await DB.get('customers', id);
            if (!c) continue;
            c.tags = c.tags || [];
            if (c.tags.indexOf(tid) === -1) { c.tags.push(tid); await Repo.save('customers', c); }
          }
          closeModal(); toast('برچسب افزوده شد', 'ok');
          BulkState.selected = []; render();
        });
      };
    });
}
// toggle button for selection mode (injected into customers page via the same wrapper)
document.addEventListener('click', function (e) {
  var b = e.target.closest('#bulk-toggle');
  if (b) { BulkState.active = true; BulkState.selected = []; render(); }
});// app.js ADDITIONS — STAGE 8 PART 5. Append EXACTLY at the end of app.js
// (after the part-2 additions). Overrides titles to full Persian, persianizes
// remaining English UI terms in rendered output, wires the native contacts /
// calendar bridges and the bulk-selection button, and adds a real CSV import
// with column preview, duplicate detection and explicit confirmation.
// No existing route logic is rewritten — only wrapped.
/* global Routes, TITLES, Repo, DB, CustomerService, $, app, fmt, esc, dateFa, enterCls, toast, modal,
   formErr, showErr, badge, val, secTitle, guard, navigate, render, errMsg, emptyState, CRMNative,
   BackupService, dlBlob, Dates */

// ============ 1) Persian titles ============
Object.assign(TITLES, {
  deals: 'فرصت‌های فروش', deal: 'فرصت فروش', leads: 'سرنخ‌های فروش', lead: 'سرنخ فروش',
  pipelines: 'فرایند فروش', quotes: 'پیشنهادهای قیمت', kpi: 'شاخص‌های فروش',
  segments: 'بخش‌بندی مشتریان', tasks: 'کارها', followups: 'پیگیری‌ها', appointments: 'قرارها',
});

// ============ 2) Persianize English terms in rendered HTML ============
// Exact-phrase replacements (case-sensitive, includes Persian suffixes), so
// code identifiers like data-nav="deal/..." (lowercase) are never touched.
var FA_TERMS = [
  [/Dealها/g, 'فرصت‌های فروش'], [/Deal باز/g, 'فرصت فروش باز'], [/Deal جدید/g, 'فرصت فروش جدید'],
  [/Deal مرتبط/g, 'فرصت فروش مرتبط'], [/Deal فعال/g, 'فرصت فروش فعال'], [/بالاترین Deal/g, 'فرصت‌های مهم'],
  [/Dealهای/g, 'فرصت‌های فروش'], [/\bDeal\b/g, 'فرصت فروش'], [/Pipelineها/g, 'فرایندهای فروش'],
  [/وضعیت Pipeline/g, 'وضعیت فرایند فروش'], [/Pipeline/g, 'فرایند فروش'],
  [/Leadها/g, 'سرنخ‌های فروش'], [/Lead جدید/g, 'سرنخ فروش جدید'], [/تبدیل به Lead/g, 'تبدیل به سرنخ فروش'],
  [/Lead‌ای/g, 'سرنخ فروشی'], [/Lead/g, 'سرنخ فروش'],
  [/Task/g, 'کار'], [/SKU:/g, 'کد:'],
];
function persianize(html) {
  if (typeof html !== 'string') return html;
  for (var i = 0; i < FA_TERMS.length; i++) html = html.replace(FA_TERMS[i][0], FA_TERMS[i][1]);
  return html;
}
(function wrapRenderPersian() {
  const orig = window.render;
  window.render = async function (param, dir) {
    const out = await orig.call(this, param, dir);
    // persianize what was just placed in #app (post-render, safe for bindings)
    if (app && app.innerHTML && app.innerHTML.indexOf('Deal') !== -1) {
      app.innerHTML = persianize(app.innerHTML);
    }
    return out;
  };
})();

// ============ 3) Wire native bridges ============
// 3a) Contacts import — button on the contacts page.
// openDeviceContactsImport() itself is defined once, in customer360.js (loaded
// after this file), which is the single implementation the button below calls —
// see that file for the actual native-contacts flow and the shared picker.
(function wrapContactsRoute() {
  const orig = Routes.contacts;
  Routes.contacts = async function () {
    const html = await orig();
    setTimeout(function () {
      const btn = document.createElement('button');
      btn.className = 'btn secondary btn-block';
      btn.id = 'dev-contacts-btn';
      btn.textContent = 'افزودن از مخاطبین گوشی';
      btn.onclick = openDeviceContactsImport;
      const addBtn = $('#add-ct');
      if (addBtn && addBtn.parentNode) addBtn.parentNode.insertBefore(btn, addBtn.nextSibling);
    }, 0);
    return html;
  };
})();

// 3b) Device calendar — button per appointment row (DOM injection, no rewrite)
(function wrapAppointmentsCalendar() {
  const orig = Routes.appointments;
  Routes.appointments = async function () {
    const html = await orig();
    setTimeout(async function () {
      const all = await Repo.list('appointments');
      document.querySelectorAll('[data-ap-edit]').forEach(function (editBtn) {
        const a = all.find(x => x.id === editBtn.dataset.apEdit);
        if (!a || a.status === 'cancelled') return;
        const cal = document.createElement('button');
        cal.className = 'btn small ghost';
        cal.textContent = 'ثبت در تقویم';
        cal.onclick = function (e) {
          e.stopPropagation();
          guard(cal, async function () {
            if (!window.CRMNative || !CRMNative.isNative()) { toast('این قابلیت فقط در نسخه اندروید در دسترس است', 'warn'); return; }
            const r = await CRMNative.createCalendarEvent(a);
            if (r.ok) toast('رویداد در تقویم دستگاه ثبت شد', 'ok');
            else toast(r.error || 'ثبت رویداد انجام نشد', r.duplicate ? 'warn' : 'err');
          });
        };
        editBtn.parentNode.insertBefore(cal, editBtn);
      });
    }, 0);
    return html;
  };
})();

// ============ 4) Bulk-selection entry button (customers list) ============
(function wrapCustomersBulkToggle() {
  const orig = Routes.customers;
  Routes.customers = async function () {
    const html = await orig();
    setTimeout(function () {
      const add = $('#add-customer');
      if (!add || $('#bulk-toggle')) return;
      const b = document.createElement('button');
      b.className = 'btn secondary btn-block';
      b.id = 'bulk-toggle';
      b.textContent = 'انتخاب گروهی';
      b.onclick = function () { BulkState.active = true; BulkState.selected = []; render(); };
      add.parentNode.insertBefore(b, add.nextSibling);
    }, 0);
    return html;
  };
})();

// ============ 5) Real CSV import with preview (customers) ============
function parseCSV(text) {
  // simple RFC-4180-ish parser: quoted fields, comma separated, BOM tolerated
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}
function openCustomerImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.onchange = function () {
    const f = input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async function () {
      try {
        const rows = parseCSV(String(reader.result));
        if (rows.length < 2) throw new Error('فایل خالی است یا فقط سرستون دارد');
        const header = rows[0].map(h => h.trim().toLowerCase());
        const idx = function (names) { for (const n of names) { const i = header.indexOf(n); if (i !== -1) return i; } return -1; };
        const iName = idx(['name', 'نام', 'نام مشتری']);
        const iPhone = idx(['phone', 'تلفن', 'موبایل', 'شماره']);
        const iEmail = idx(['email', 'ایمیل']);
        if (iName === -1) throw new Error('ستون نام (name یا نام) در فایل یافت نشد');
        const customers = await Repo.list('customers');
        const crmPhones = {};
        customers.forEach(c => { if (c.phone) crmPhones[String(c.phone).replace(/\D/g, '')] = true; });
        const valid = [], badRows = [], dups = [];
        for (let r = 1; r < rows.length; r++) {
          const name = (rows[r][iName] || '').trim();
          const phone = iPhone !== -1 ? (rows[r][iPhone] || '').trim() : '';
          const email = iEmail !== -1 ? (rows[r][iEmail] || '').trim() : '';
          if (!name) { badRows.push('سطر ' + fmt(r + 1) + ': نام خالی'); continue; }
          const key = phone.replace(/\D/g, '');
          if (key && crmPhones[key]) { dups.push('سطر ' + fmt(r + 1) + ' (' + name + '): شماره تکراری'); continue; }
          if (key) crmPhones[key] = true;
          valid.push({ name: name, phone: phone, email: email });
        }
        modal('پیش‌نمایش ورود مشتریان',
          '<div class="card"><div class="list-item"><span>رکورد آماده ورود</span><b>' + fmt(valid.length) + '</b></div>' +
          '<div class="list-item"><span>تکراری (رد می‌شود)</span><b>' + fmt(dups.length) + '</b></div>' +
          '<div class="list-item"><span>ناقص/خطادار</span><b>' + fmt(badRows.length) + '</b></div></div>' +
          (valid.length ? secTitle('نمونه (۵ مورد اول)') + '<div class="card">' + valid.slice(0, 5).map(v =>
            '<div class="list-item"><span>' + esc(v.name) + '</span><span class="muted">' + esc(v.phone || '—') + '</span></div>').join('') + '</div>' : '') +
          (badRows.length ? '<details><summary class="muted">مشاهده خطاها (' + fmt(badRows.length) + ')</summary><div class="card">' + badRows.slice(0, 20).map(x => '<div class="muted">' + esc(x) + '</div>').join('') + '</div></details>' : '') +
          (dups.length ? '<details><summary class="muted">مشاهده تکراری‌ها</summary><div class="card">' + dups.slice(0, 20).map(x => '<div class="muted">' + esc(x) + '</div>').join('') + '</div></details>' : '') +
          formErr() +
          '<button class="btn btn-block" id="imp-go"' + (valid.length ? '' : ' disabled') + '>تأیید و ورود ' + fmt(valid.length) + ' مشتری</button>' +
          '<p class="muted">هیچ داده‌ای بدون تأیید وارد نمی‌شود. داده‌های فعلی تغییر نمی‌کنند.</p>',
          function () {
            $('#imp-go').onclick = function () {
              guard($('#imp-go'), async function () {
                let added = 0, failed = 0;
                for (const v of valid) {
                  try { await CustomerService.create(v); added++; }
                  catch (e) { failed++; }
                }
                closeModal();
                toast(fmt(added) + ' مشتری وارد شد' + (failed ? ' — ' + fmt(failed) + ' مورد ناموفق' : ''), failed ? 'warn' : 'ok');
                render();
              });
            };
          });
      } catch (err) { toast(errMsg(err), 'err'); }
    };
    reader.readAsText(f, 'utf-8');
  };
  input.click();
}
// expose the import entry on the settings page (button injected, no rewrite)
(function wrapSettingsImport() {
  const orig = Routes.settings;
  Routes.settings = async function () {
    const html = await orig();
    setTimeout(function () {
      const anchor = $('#st-csv');
      if (!anchor || $('#imp-csv-btn')) return;
      const b = document.createElement('button');
      b.className = 'btn secondary btn-block';
      b.id = 'imp-csv-btn';
      b.textContent = 'ورود مشتریان از فایل CSV';
      b.onclick = openCustomerImport;
      anchor.parentNode.insertBefore(b, anchor.nextSibling);
    }, 0);
    return html;
  };
})();

// ============ 6) Reports completion (adds lead-funnel + lost-sales detail) ============
(function wrapReportsExtra() {
  const orig = Routes.reports;
  Routes.reports = async function () {
    const html = await orig();
    const k = await KPIService.sales();
    const extra = secTitle('قیف فروش') + '<div class="card">' +
      '<div class="list-item"><span>سرنخ‌های فروش</span><span class="muted">' + fmt(k.leadCount) + '</span></div>' +
      '<div class="list-item"><span>نرخ تبدیل سرنخ به فرصت فروش</span><span class="muted">' + fmt(k.conversionRate) + '٪</span></div>' +
      '<div class="list-item"><span>نرخ برد فرصت‌ها</span><span class="muted">' + fmt(k.winRate) + '٪</span></div>' +
      '<div class="list-item"><span>میانگین زمان فروش</span><span class="muted">' + (k.avgDaysToWin == null ? '—' : fmt(k.avgDaysToWin) + ' روز') + '</span></div>' +
      '<div class="list-item"><span>ارزش فروش از دست‌رفته</span><span class="muted">' + fmt(k.lostValue) + '</span></div>' +
      '<div class="list-item"><span>میانگین ارزش معامله (برده‌شده)</span><span class="muted">' + fmt(k.avgDealValue) + '</span></div></div>';
    return persianize(html + extra);
  };
})();