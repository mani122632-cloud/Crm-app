// advanced-filters.js — PHASE 4 (verified revision).
// Field verification against the real project:
//   - email, notes: written to every customer record by CustomerService.create/update
//     (services.js) from the customer form -> real, kept.
//   - lastActivityAt: written by Repo.logActivity (repo.js) on every logged
//     activity for the customer -> real, kept. Undefined only for customers with
//     no activity; SavedFilterService.apply's days_since_* ops return false for
//     empty values, so those rows are simply excluded (real behavior, no crash).
//   - BackupService, Dates, dlBlob, formErr, field: all real globals
//     (services.js / app.js). Global comment completed accordingly.
// No logic change vs the original PHASE 4 file.
/* global Routes, Repo, SavedFilterService, BulkState, $, fmt, esc, toast,
   modal, closeModal, confirmDlg, val, secTitle, guard, showErr,
   BackupService, Dates, dlBlob, formErr, field */

// condition fields available on real customer rows
var AF_FIELDS = [
  ['name', 'نام (شامل)', 'contains'],
  ['phone', 'تلفن (شامل)', 'contains'],
  ['email', 'ایمیل (شامل)', 'contains'],
  ['notes', 'یادداشت (شامل)', 'contains'],
  ['createdAt', 'تاریخ ایجاد (بعد از تاریخ)', 'gt'],
  ['lastActivityAt', 'روزهای بدون فعالیت حداکثر', 'days_since_le'],
  ['lastActivityAt', 'روزهای بدون فعالیت حداقل', 'days_since_ge'],
];
// ops supported by SavedFilterService.apply: eq, neq, contains, gt, lt,
// days_since_le, days_since_ge, empty, notempty

(function wrapCustomersAdvancedFilters() {
  const orig = Routes.customers;
  Routes.customers = async function () {
    const html = await orig();
    // skip injection while bulk-selection mode is active (its wrapper injects checkboxes)
    if (BulkState && BulkState.active) return html;
    setTimeout(async function () {
      const add = $('#add-customer');
      if (!add || $('#af-toggle')) return;
      const b = document.createElement('button');
      b.className = 'btn secondary btn-block';
      b.id = 'af-toggle';
      b.textContent = 'فیلترهای ذخیره‌شده';
      b.onclick = openSavedFiltersPanel;
      add.parentNode.insertBefore(b, add.nextSibling);
    }, 0);
    return html;
  };
})();

async function openSavedFiltersPanel() {
  const saved = await SavedFilterService.list('customers');
  modal('فیلترهای ذخیره‌شده مشتریان',
    (saved.length
      ? '<div class="card">' + saved.map(f =>
        '<div class="list-item"><div><b>' + esc(f.name) + '</b><br><span class="muted">' + fmt((f.conditions || []).length) + ' شرط</span></div>' +
        '<div style="display:flex;gap:.3rem;flex-shrink:0">' +
        '<button class="btn small" data-af-run="' + f.id + '">اجرا</button>' +
        '<button class="btn small secondary" data-af-ren="' + f.id + '">تغییر نام</button>' +
        '<button class="btn small danger" data-af-del="' + f.id + '">حذف</button></div></div>').join('') + '</div>'
      : '<p class="muted">هنوز فیلتری ذخیره نشده است. با دکمه پایین، فیلتر ترکیبی بسازید؛ مثلاً «مشتریانی که یادداشتشان شامل قرارداد است و بیش از ۳۰ روز بی‌فعالیت بوده‌اند».</p>') +
    '<button class="btn btn-block" id="af-new">+ فیلتر جدید</button>',
    function () {
      $('#af-new').onclick = function () { closeModal(); openFilterBuilder(); };
      document.querySelectorAll('[data-af-run]').forEach(b => b.onclick = function () {
        guard(b, async function () {
          const f = saved.find(x => x.id === b.dataset.afRun);
          if (!f) return;
          const all = await Repo.list('customers', c => !c.archived);
          const rows = await SavedFilterService.apply(f.conditions, all);
          closeModal();
          toast(fmt(rows.length) + ' مشتری با فیلتر «' + f.name + '» یافت شد', 'info');
          showFilterResults(f, rows);
        });
      });
      document.querySelectorAll('[data-af-ren]').forEach(b => b.onclick = function () {
        const f = saved.find(x => x.id === b.dataset.afRen);
        if (!f) return;
        modal('تغییر نام فیلتر', field('نام', '<input id="afr-name" value="' + esc(f.name) + '">') + formErr() +
          '<button class="btn btn-block" id="afr-save">ذخیره</button>', function () {
          $('#afr-save').onclick = function () {
            guard($('#afr-save'), async function () {
              await SavedFilterService.update(f.id, { name: val('afr-name').trim() });
              closeModal(); toast('ذخیره شد', 'ok');
            });
          };
        });
      });
      document.querySelectorAll('[data-af-del]').forEach(b => b.onclick = function () {
        const f = saved.find(x => x.id === b.dataset.afDel);
        if (!f) return;
        confirmDlg('حذف فیلتر «' + f.name + '»؟ داده‌های مشتریان حذف نمی‌شود.', function () {
          guard(b, async function () {
            await SavedFilterService.remove(f.id);
            toast('فیلتر حذف شد', 'ok');
            closeModal();
          });
        });
      });
    });
}

function openFilterBuilder() {
  let condCount = 0;
  function addCond() {
    const cid = 'afc-' + (condCount++);
    const div = document.createElement('div');
    div.className = 'filter-bar';
    div.innerHTML = '<select data-aff="' + cid + '" style="margin:0;flex:2;min-width:10rem">' +
      AF_FIELDS.map((f, i) => '<option value="' + i + '">' + esc(f[1]) + '</option>').join('') + '</select>' +
      '<input data-afv="' + cid + '" placeholder="مقدار" style="margin:0;flex:1;min-width:5rem">' +
      '<button type="button" class="btn small danger" data-afr="' + cid + '">حذف</button>';
    $('#af-conds').appendChild(div);
    div.querySelector('[data-afr]').onclick = function () { div.remove(); };
  }
  modal('فیلتر جدید مشتریان',
    field('نام فیلتر', '<input id="afb-name" placeholder="مثلاً: مشتریان بی‌فعالیت بزرگ">') +
    '<div id="af-conds"></div>' +
    '<button type="button" class="btn small secondary btn-block" id="afb-addcond">+ افزودن شرط</button>' +
    '<p class="muted">همه شرط‌ها با هم ترکیب می‌شوند (و). فیلتر روی داده واقعی مشتریان اجرا می‌شود.</p>' +
    formErr() +
    '<button class="btn btn-block" id="afb-save">ذخیره و اجرا</button>',
    function () {
      addCond();
      $('#afb-addcond').onclick = addCond;
      $('#afb-save').onclick = function () {
        const conds = [];
        document.querySelectorAll('#af-conds .filter-bar').forEach(function (row) {
          const fi = Number(row.querySelector('[data-aff]').value);
          const def = AF_FIELDS[fi];
          if (!def) return;
          const v = row.querySelector('[data-afv]').value.trim();
          if (v === '') return;
          conds.push({ field: def[0], op: def[2], value: v });
        });
        const name = val('afb-name').trim();
        if (!name) { showErr(new Error('نام فیلتر الزامی است')); return; }
        if (!conds.length) { showErr(new Error('حداقل یک شرط با مقدار لازم است')); return; }
        guard($('#afb-save'), async function () {
          const f = await SavedFilterService.save('customers', name, conds);
          closeModal();
          const all = await Repo.list('customers', c => !c.archived);
          const rows = await SavedFilterService.apply(f.conditions, all);
          toast(fmt(rows.length) + ' مشتری یافت شد و فیلتر ذخیره شد', 'ok');
          showFilterResults(f, rows);
        });
      };
    });
}

async function showFilterResults(filterDef, rows) {
  modal('نتیجه فیلتر: ' + filterDef.name,
    (rows.length
      ? '<div class="card" style="max-height:50vh;overflow-y:auto;padding:.4rem">' + rows.map(c =>
        '<div class="list-item" data-nav="customer/' + c.id + '"><div><b>' + esc(c.name) + '</b>' +
        '<br><span class="muted">' + esc(c.phone || 'بدون تلفن') + '</span></div></div>').join('') + '</div>'
      : '<p class="muted">هیچ مشتری با این شرایط یافت نشد.</p>') +
    '<div class="btn-row">' +
    (rows.length ? '<button class="btn" id="afx-export">خروجی CSV نتیجه</button>' : '') +
    '<button class="btn secondary" id="afx-close">بستن</button></div>',
    function () {
      $('#afx-close').onclick = closeModal;
      var ex = $('#afx-export');
      if (ex) ex.onclick = function () {
        guard(ex, async function () {
          const csv = await BackupService.exportCSV(rows, ['name', 'phone', 'email', 'notes']);
          dlBlob(csv, 'customers-filter-' + Dates.todayStr() + '.csv', 'text/csv;charset=utf-8');
          toast('خروجی آماده شد', 'ok');
        });
      };
    });
}