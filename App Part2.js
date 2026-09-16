// app.js — PART 2 of 2. Append this content EXACTLY at the end of app-part1
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
Routes.settings = async function () {
  const s = await Repo.getSettings();
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  let h = secTitle('تنظیمات عمومی') + '<div class="card">' +
    field('روزهای بدون فعالیت برای «خوابیده»', '<input id="st-inact" type="number" min="1" step="1" value="' + esc(s.inactivityDays) + '">') +
    field('درصد مالیات پیش‌فرض', '<input id="st-tax" type="number" min="0" max="100" step="any" value="' + esc(s.taxDefault) + '">') +
    '<button class="btn btn-block" id="st-save">ذخیره تنظیمات</button></div>';
  h += secTitle('اعلان‌ها') + '<div class="card">' +
    '<div class="list-item"><span class="muted">وضعیت Permission</span><span>' +
    (perm === 'granted' ? badge('فعال', 'ok') : perm === 'denied' ? badge('رد شده', 'danger') : perm === 'unsupported' ? badge('پشتیبانی نمی‌شود', 'warn') : badge('تعیین نشده')) + '</span></div>' +
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
})();