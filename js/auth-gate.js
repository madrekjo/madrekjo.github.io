/* مدارك جو — درع الدخول الموحّد
 * يمنع عرض أي صفحة (غير المصرّح بها) قبل تسجيل الدخول الموحّد.
 * يُدرَج في <head> قبل المحتوى لتفادي ظهور أي شيء للمستخدم غير المسجّل.
 *
 * الجلسة تُكتب في localStorage بصيغة:
 *   mdk:sso:session = { chat: {access_token, refresh_token}, ... , target, viaCode? }
 * ويكتبها: (1) مسار Google عبر الوركر في /login/، (2) مسار رمز الدعوة في /login/.
 */
(function () {
  "use strict";

  var GATE_ON = true;                    /* مفتاح التشغيل العام للدرع */
  var SESSION_KEY = "mdk:sso:session";   /* جلسة الدخول الموحّد */
  var LOGIN_PATH = "/login/";            /* صفحة الدخول الموحّد (عامة) */

  if (!GATE_ON) return;

  try {
    var path = location.pathname.replace(/\/index\.html$/, "/");

    /* صفحات عامة لا تُقفل: الدخول، الصيانة، 404، الخصوصية، قريباً. */
    var PUBLIC = [
      /^\/login(\/|$)/,
      /^\/maintenance\.html$/,
      /^\/404\.html$/,
      /^\/privacy\.html$/,
      /^\/coming-soon\.html$/
    ];
    for (var i = 0; i < PUBLIC.length; i++) {
      if (PUBLIC[i].test(path)) return;
    }

    /* التحقق من الجلسة. عند تعذّر الوصول للمخزن نسمح بالمرور (fail-open)
     * حتى لا نقفل المستخدمين في أوضاع الخصوصية الصارمة. */
    var authed = false;
    try { authed = !!localStorage.getItem(SESSION_KEY); }
    catch (e) { return; }

    if (!authed) {
      var from = location.pathname + location.search + location.hash;
      location.replace(LOGIN_PATH + "?from=" + encodeURIComponent(from));
    }
  } catch (e) { /* لا نمنع التحميل عند أي خطأ غير متوقع */ }
})();
