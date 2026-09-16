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
  const items = [
    ['contacts', 'مخاطبین'], ['companies', 'شرکت‌ها'], ['leads', 'سرنخ‌های فروش'], ['projects', 'پروژه‌ها'],
    ['quotes', 'پیشنهادهای قیمت'], ['calendar', 'تقویم'], ['products', 'محصولات'], ['orders', 'سفارش‌ها'],
    ['calls', 'تماس‌ها'], ['followups', 'پیگیری‌ها'], ['appointments', 'قرارها'],
    ['reports', 'گزارش‌ها'], ['kpi', 'شاخص‌های فروش'], ['segments', 'بخش‌بندی مشتریان'], ['tags', 'تگ‌ها'],
    ['pipelines', 'فرایند فروش'], ['customfields', 'فیلدهای سفارشی'], ['settings', 'تنظیمات'],
  ];
  return '<div class="card">' + items.map(i =>
    '<div class="list-item" data-nav="' + i[0] + '"><span>' + esc(i[1]) + '</span></div>').join('') + '</div>';
};