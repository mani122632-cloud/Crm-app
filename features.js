// features.js — Stage 5 + menu fix: Tags management + "More" menu.
// BUGFIX: "contacts" (مخاطبین) was missing from the More menu — the full
// route, page and device-contacts import all exist but had no navigation
// entry. Added at the top of the list. Everything else unchanged.
/* global Routes, Repo, modal, formErr, field, val, badge, esc, fmt, emptyState, guard, confirmDlg, toast, navigate, showErr */
Routes.tags = async function () {
  const all = (await Repo.list('tags')).slice().sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  const customers = await Repo.list('customers');
  const usage = {};
  all.forEach(t => { usage[t.id] = customers.filter(c => (c.tags || []).indexOf(t.id) !== -1).length; });
  let h = '<div class="card" style="padding:.7rem"><input id="tg-new" placeholder="نام تگ جدید…"><button class="btn btn-block" id="tg-add">+ افزودن تگ</button></div>';
  h += all.length ? '<div class="card">' + all.map(t =>
    '<div class="list-item"><div><b>' + esc(t.name) + '</b> ' + badge(fmt(usage[t.id]) + ' مشتری') + '</div>' +
    '<div style="display:flex;gap:.3rem;flex-shrink:0">' +
    '<button class="btn small" data-tg-ren="' + t.id + '">تغییر نام</button>' +
    '<button class="btn small danger" data-tg-del="' + t.id + '">حذف</button></div></div>').join('') + '</div>'
    : emptyState('هیچ تگی تعریف نشده است. تگ‌ها در فرم مشتری قابل انتخاب و فیلتر هستند.', 'افزودن تگ', 'empty-tg', 'فهرست خالی است');
  setTimeout(function () {
    function addTag() {
      const name = val('tg-new').trim();
      if (!name) { showErr(new Error('نام تگ الزامی است')); return; }
      guard($('#tg-add'), async function () {
        const dups = await Repo.list('tags', t => t.name.trim().toLowerCase() === name.toLowerCase());
        if (dups.length) throw new Error('تگی با این نام از قبل موجود است');
        await Repo.save('tags', { name: name });
        toast('تگ اضافه شد', 'ok');
        navigate('tags');
      });
    }
    $('#tg-add').onclick = addTag;
    $('#tg-new').onkeydown = function (e) { if (e.key === 'Enter') addTag(); };
    var ea = $('#empty-tg'); if (ea) ea.onclick = function () { $('#tg-new').focus(); };
    document.querySelectorAll('[data-tg-ren]').forEach(b => b.onclick = function () {
      const t = all.find(x => x.id === b.dataset.tgRen);
      if (!t) return;
      modal('تغییر نام تگ', field('نام *', '<input id="tr-name" value="' + esc(t.name) + '">') + formErr() +
        '<button class="btn btn-block" id="tr-save">ذخیره</button>', function () {
        $('#tr-save').onclick = function () {
          guard($('#tr-save'), async function () {
            const name = val('tr-name').trim();
            if (!name) throw new Error('نام تگ الزامی است');
            await Repo.audit('tag', t.id, 'rename', 'name', t.name, name);
            t.name = name;
            await Repo.save('tags', t);
            closeModal(); toast('ذخیره شد', 'ok'); navigate('tags');
          });
        };
      });
    });
    document.querySelectorAll('[data-tg-del]').forEach(b => b.onclick = function () {
      const t = all.find(x => x.id === b.dataset.tgDel);
      if (!t) return;
      confirmDlg('حذف تگ «' + t.name + '»؟ تگ از مشتریان حذف می‌شود اما خود مشتریان حفظ می‌شوند.', function () {
        guard(b, async function () {
          for (const c of customers) {
            if ((c.tags || []).indexOf(t.id) !== -1) { c.tags = c.tags.filter(x => x !== t.id); await Repo.save('customers', c); }
          }
          await Repo.remove('tags', t.id);
          toast('حذف شد', 'ok');
          navigate('tags');
        });
      });
    });
  }, 0);
  return h;
};
Routes.more = async function () {
  var ICONS = {
    companies: '<path d="M6 22V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v18"/><path d="M9 22v-4h6v4"/><path d="M9 8h1M9 12h1M14 8h1M14 12h1"/>',
    leads: '<path d="M4 4h16l-6 8v6l-4 2v-8z"/>',
    quotes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    orders: '<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    pipelines: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
    contacts: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
    calls: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 3a2 2 0 0 1-.5 2L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2-.5c1 .3 2 .5 3 .7a2 2 0 0 1 1.7 2z"/>',
    followups: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    appointments: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
    projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    products: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    reports: '<line x1="5" y1="20" x2="5" y2="12"/><line x1="12" y1="20" x2="12" y2="7"/><line x1="19" y1="20" x2="19" y2="15"/><line x1="3" y1="20" x2="21" y2="20"/>',
    kpi: '<polyline points="3 17 9 11 13 15 21 6"/><polyline points="15 6 21 6 21 12"/>',
    segments: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    tags: '<path d="M20.6 12.6 12 4H4v8l8.6 8.6a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    customfields: '<line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="18" r="2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M3 12h2m14 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'
  };
  var groups = [
    ['فروش', [
      ['companies', 'شرکت‌ها'], ['leads', 'سرنخ‌های فروش'], ['quotes', 'پیشنهادهای قیمت'],
      ['orders', 'سفارش‌ها'], ['pipelines', 'فرایند فروش']
    ]],
    ['فعالیت‌ها', [
      ['contacts', 'مخاطبین'], ['calendar', 'تقویم'], ['calls', 'تماس‌ها'],
      ['followups', 'پیگیری‌ها'], ['appointments', 'قرارها']
    ]],
    ['پروژه‌ها و محصولات', [
      ['projects', 'پروژه‌ها'], ['products', 'محصولات']
    ]],
    ['گزارش و تنظیمات', [
      ['reports', 'گزارش‌ها'], ['kpi', 'شاخص‌های فروش'], ['segments', 'بخش‌بندی مشتریان'],
      ['tags', 'تگ‌ها'], ['customfields', 'فیلدهای سفارشی'], ['settings', 'تنظیمات']
    ]]
  ];
  var row = function (i) {
    return '<div class="list-item" data-nav="' + i[0] + '">' +
      '<div style="display:flex;align-items:center;gap:.7rem;min-width:0">' +
      '<span class="mi-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[i[0]] || '') + '</svg></span>' +
      '<span>' + esc(i[1]) + '</span></div>' +
      '<span class="mi-chev" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></span>' +
      '</div>';
  };
  return groups.map(function (g) {
    return secTitle(g[0]) + '<div class="card menu-card">' + g[1].map(row).join('') + '</div>';
  }).join('');
};