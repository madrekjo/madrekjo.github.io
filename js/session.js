/* سجل جلسة الطالب المشترك — يحفظ الجيل والحقل والاختياري والتخصص
 * بحيث عند الدخول مرة أخرى يتجاوز اختيار الحقل/المادة/التخصص مباشرة. */
(function () {
  'use strict';

  var KEY = 'madrekjo_student_profile';

  function available() {
    try {
      var t = '__t__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  }

  function load() {
    if (!available()) return null;
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function save(data) {
    if (!available()) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function clear() {
    if (!available()) return;
    try {
      localStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }
  }

  window.MadarekSession = {
    KEY: KEY,
    load: load,
    save: save,
    clear: clear,
    available: available,
  };
})();
