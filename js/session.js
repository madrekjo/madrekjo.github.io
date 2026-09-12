/* سجل جلسة الطالب المشترك — يحفظ الجيل والحقل والاختياري والتخصص
 * لكل جيل على حدة، بحيث التنقل بين الأجيال (2009 / 2010) لا يمسح
 * اختيارات أي جيل: كل ما يعود يلاقي حقلته محفوظة دون إعادة اختيار. */
(function () {
  'use strict';

  var KEY = 'madrekjo_student_profile';
  var VERSION = 2;

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

  function read() {
    if (!available()) return null;
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      if (data.v === VERSION && data.generations) return data;
      /* سجل قديم: كائن مسطح واحد (جيل واحد) -> نرفعه لهيئة الأجيال */
      if (data.generation && typeof data.generation === 'string') {
        var migrated = { v: VERSION, generations: {}, last: data.generation };
        migrated.generations[data.generation] = data;
        try { localStorage.setItem(KEY, JSON.stringify(migrated)); } catch (e) {}
        return migrated;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function commit(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }

  /* سجل جيل معيّن (أو null إذا لم يُسجَّل بعد) */
  function load(year) {
    var store = read();
    if (!store || !year || !store.generations[year]) return null;
    return store.generations[year];
  }

  /* آخر جيل زاره المستخدم */
  function lastActive() {
    var store = read();
    return store ? (store.last || null) : null;
  }

  /* كل الأجيال المحفوظة { '2009': {...}, '2010': {...} } */
  function all() {
    var store = read();
    return store ? store.generations : {};
  }

  /* save(data):
   *  - مع page + field            -> تسجيل كامل لهذا الجيل
   *  - بدون page+field (أو فقط generation) -> إعادة اختيار: يمسح سجل الجيل فقط */
  function save(data) {
    if (!available() || !data) return;
    var store = read() || { v: VERSION, generations: {}, last: null };
    var year = data.generation;
    if (!year) return;
    if (data.page && data.field) {
      store.generations[year] = {
        generation: year,
        field: data.field,
        elective: data.elective || '',
        major: data.major || '',
        page: data.page,
        name: data.name || 'زائر',
      };
    } else {
      delete store.generations[year];
    }
    store.last = year;
    commit(store);
  }

  function clear(year) {
    if (!available() || !year) return;
    var store = read();
    if (!store) return;
    delete store.generations[year];
    commit(store);
  }

  window.MadarekSession = {
    KEY: KEY,
    load: load,
    save: save,
    clear: clear,
    all: all,
    lastActive: lastActive,
    available: available,
    VERSION: VERSION,
  };
})();