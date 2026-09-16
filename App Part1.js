// app.js — UI layer (layer 1). All business logic lives in services.js.
// This is PART 1 of 2. Part 2 (app-part2) must be appended at the end of this
// file so app.js is complete: continue from Routes.projects onward.
/* global Repo, DB, CustomerService, CompanyService, ContactService, LeadService, DealService,
   ProjectService, PipelineService, CallService, FollowUpService, TaskService, AppointmentService,
   NotifService, ProductService, OrderService, AutomationService, DashboardService, CalendarService,
   SearchService, CustomFieldService, num, Dates */
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
  h += secList('تماس‌ها', d.calls, c => '<div class="list-item" data-call="' + c.id + '"><div><b>' + esc(c.result || '—') + '</b></div><span class="muted">' + dateTimeFa(c.createdAt) + '</span></div>');
  h += secList('پیگیری‌ها', d.followups, f => '<div class="list-item"><div><b>' + esc(f.title) + '</b><br><span class="muted">' + dateFa(f.dueDate) + ' — ' + esc(f.status) + '</span></div></div>');
  h += secList('کارها', d.tasks, t => '<div class="list-item" data-task="' + t.id + '"><div><b>' + esc(t.title) + '</b></div><span class="muted">' + dateFa(t.dueDate) + '</span></div>');
  h += secTitle('Timeline') + '<div class="card">' +
    (d.activities.length ? d.activities.map(a => '<div class="timeline-item"><b>' + esc(activityLabel(a.type)) + '</b> — ' + esc(a.note || '') + '<br><span class="muted">' + dateTimeFa(a.createdAt) + '</span></div>').join('') : '<div class="muted">فعالیتی ثبت نشده</div>') + '</div>';
  setTimeout(function () {
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
};