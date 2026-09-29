// ui-compat.js — جایگزین سازگار با WebView قدیمی برای :has() + توضیح تاریخ شمسی زیر ورودی‌های تاریخ.
// فقط کلاس CSS اضافه می‌کند؛ هیچ منطق داده‌ای یا رویدادی را تغییر نمی‌دهد.
(function () {
  'use strict';
  var pending = false;
  function tag(root) {
    var i, n;
    n = root.querySelectorAll('.list-item[data-nav]');
    for (i = 0; i < n.length; i++) n[i].classList.toggle('no-chev', !!n[i].querySelector('.btn,.mi-chev'));
    n = root.querySelectorAll('label');
    for (i = 0; i < n.length; i++) { var c = n[i].firstElementChild; if (c && c.tagName === 'INPUT' && c.type === 'checkbox') n[i].classList.add('lbl-check'); }
    n = root.querySelectorAll('.card');
    for (i = 0; i < n.length; i++) { var k = n[i].children; n[i].classList.toggle('card-search', k.length === 1 && k[0].tagName === 'INPUT' && k[0].type === 'search'); }
    var app = root.querySelector ? root.querySelector('#app') : null;
    if (app) pairButtons(app);
  }
  function pairButtons(app) {
    var kids = app.children, run = [], i;
    var flush = function () {
      for (var j = 0; j < run.length; j++) {
        var solo = run.length < 2 || (j === run.length - 1 && run.length % 2 === 1);
        run[j].classList.add('btn-pair');
        run[j].classList.toggle('pair-solo', solo);
        run[j].classList.toggle('pair-start', !solo && j % 2 === 0);
      }
      run = [];
    };
    for (i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.classList.contains('btn-block') && el.classList.contains('secondary')) run.push(el); else flush();
    }
    flush();
  }
  function dateHints(root) {
    if (typeof Jalali === 'undefined') return;
    var n = root.querySelectorAll('input[type="date"]');
    for (var i = 0; i < n.length; i++) {
      var inp = n[i], hint = inp.nextElementSibling;
      if (!hint || !hint.classList || !hint.classList.contains('fa-date-hint')) {
        hint = document.createElement('div'); hint.className = 'fa-date-hint muted'; inp.parentNode.insertBefore(hint, inp.nextSibling);
        inp.addEventListener('change', (function (a, b) { return function () { upd(a, b); }; })(inp, hint));
        inp.addEventListener('input', (function (a, b) { return function () { upd(a, b); }; })(inp, hint));
      }
      upd(inp, hint);
    }
  }
  function upd(inp, hint) { var v = inp.value; hint.textContent = /^\d{4}-\d\d-\d\d/.test(v) ? 'تاریخ شمسی: ' + Jalali.label(v) : ''; }
  function run() { pending = false; try { tag(document); dateHints(document); } catch (e) { console.error(e); } }
  function schedule() { if (pending) return; pending = true; (window.requestAnimationFrame || setTimeout)(run); }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
