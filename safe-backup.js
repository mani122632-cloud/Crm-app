// safe-backup.js — PHASE 5: safe restore. Wires the existing BackupValidator
// (extensions.js, untouched) into the settings page: every restore is validated
// first, previewed, and only executed after explicit confirmation, with a choice
// of merge mode (skip duplicates / replace records). Also shows the last backup
// date from the real settings record. No service, DB schema or native change.
/* global Routes, Repo, DB, BackupService, BackupValidator, $, fmt, esc, dateFa, dateTimeFa, toast,
   modal, closeModal, confirmDlg, guard, render, showErr */

(function wrapSettingsSafeRestore() {
  const orig = Routes.settings;
  Routes.settings = async function () {
    const html = await orig();
    setTimeout(async function () {
      // 1) show last backup date (real settings field, written by the export action)
      const s = await Repo.getSettings();
      const anchor = $('#st-export');
      if (anchor && !$('#last-backup-line')) {
        const line = document.createElement('div');
        line.id = 'last-backup-line';
        line.className = 'muted';
        line.style.marginBottom = '.4rem';
        line.textContent = s.lastBackupAt
          ? 'آخرین پشتیبان: ' + dateTimeFa(s.lastBackupAt)
          : 'تاکنون پشتیبان گرفته نشده است';
        anchor.parentNode.insertBefore(line, anchor);
      }
      // 2) replace the raw import handler with the validated safe flow
      const input = $('#st-import');
      if (input) input.onchange = function (e) {
        const f = e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = async function () {
          let dump = null;
          try {
            dump = JSON.parse(reader.result);
          } catch (err) {
            toast('فایل انتخابی، پشتیبان معتبر JSON نیست', 'err');
            return;
          }
          // validation happens BEFORE anything touches the database
          try {
            BackupValidator.validate(dump);
          } catch (err) {
            modal('بازیابی ناموفق',
              '<div class="error-text">' + esc(err.message || 'فایل پشتیبان نامعتبر است') + '</div>' +
              '<p class="muted">هیچ داده‌ای تغییر نکرد. از فایل پشتیبان دیگری استفاده کنید.</p>' +
              '<button class="btn btn-block" id="sb-err-close">متوجه شدم</button>',
              function () { $('#sb-err-close').onclick = closeModal; });
            return;
          }
          // preview: real row counts per store, including new-store additions
          let total = 0;
          const rows = [];
          for (const st of Object.keys(dump.data)) {
            const n = dump.data[st].length;
            if (!n) continue;
            total += n;
            rows.push('<div class="list-item"><span>' + esc(storeNameFa(st)) + '</span><span class="muted">' + fmt(n) + ' رکورد</span></div>');
          }
          modal('تأیید بازیابی پشتیبان',
            '<p class="muted">فایل پشتیبان معتبر است و شامل ' + fmt(total) + ' رکورد است:</p>' +
            '<div class="card" style="max-height:36vh;overflow-y:auto;padding:.4rem">' + rows.join('') + '</div>' +
            '<p class="muted">روش بازیابی را انتخاب کنید. در هر دو روش، هیچ رکوردی از داده‌های فعلی حذف نمی‌شود:</p>' +
            '<button class="btn btn-block" id="sb-merge">ادغام — تکراری‌ها رد شوند</button>' +
            '<button class="btn secondary btn-block" id="sb-replace">جایگزینی — رکوردهای هم‌شناسه به‌روزرسانی شوند</button>' +
            '<button class="btn ghost btn-block" id="sb-cancel">انصراف</button>',
            function () {
              $('#sb-cancel').onclick = closeModal;
              $('#sb-merge').onclick = function () { runRestore(dump, true); };
              $('#sb-replace').onclick = function () { runRestore(dump, false); };
            });
        };
        reader.readAsText(f);
      };
      // 3) also make the export handler refresh the last-backup line
      const exportBtn = $('#st-export');
      if (exportBtn) {
        const prev = exportBtn.onclick;
        exportBtn.onclick = function () {
          guard(exportBtn, async function () {
            if (typeof prev === 'function') await prev.call(exportBtn);
            const s2 = await Repo.getSettings();
            const line = $('#last-backup-line');
            if (line && s2.lastBackupAt) line.textContent = 'آخرین پشتیبان: ' + dateTimeFa(s2.lastBackupAt);
          });
        };
      }
    }, 0);
    return html;
  };
})();

async function runRestore(dump, skipDuplicates) {
  guard($('#sb-merge') || $('#modal-root'), async function () {
    const r = await BackupService.importJSON(dump, { skipDuplicates: skipDuplicates });
    closeModal();
    await render();
    modal('بازیابی انجام شد',
      '<div class="card">' +
      '<div class="list-item"><span>رکوردهای واردشده</span><b>' + fmt(r.added) + '</b></div>' +
      '<div class="list-item"><span>رکوردهای ردشده (تکراری)</span><b>' + fmt(r.skipped) + '</b></div>' +
      '</div>' +
      '<button class="btn btn-block" id="sb-done-close">بستن</button>',
      function () { $('#sb-done-close').onclick = closeModal; });
  });
}

// Persian display names for the known backup stores (no English in UI)
function storeNameFa(st) {
  const map = {
    customers: 'مشتریان', companies: 'شرکت‌ها', contacts: 'مخاطبین',
    leads: 'سرنخ‌های فروش', deals: 'فرصت‌های فروش', pipelines: 'فرایندهای فروش',
    stages: 'مراحل', projects: 'پروژه‌ها', activities: 'فعالیت‌ها',
    calls: 'تماس‌ها', tasks: 'کارها', followups: 'پیگیری‌ها',
    appointments: 'قرارها', products: 'محصولات', categories: 'دسته‌ها',
    orders: 'سفارش‌ها', orderItems: 'اقلام سفارش', tags: 'برچسب‌ها',
    customFields: 'فیلدهای سفارشی', customValues: 'مقادیر سفارشی',
    statuses: 'وضعیت‌ها', settings: 'تنظیمات', audit: 'تاریخچه تغییرات',
    workflows: 'گردش‌کارها', automations: 'خودکارسازی',
    quotes: 'پیشنهادهای قیمت', quoteItems: 'اقلام پیشنهاد قیمت',
    inventoryMoves: 'گردش موجودی', attachments: 'پیوست‌ها',
    savedFilters: 'فیلترهای ذخیره‌شده', segments: 'بخش‌بندی‌ها',
  };
  return map[st] || st;
}