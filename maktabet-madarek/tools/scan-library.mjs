/* ============================================================
   المكتبة — عامل فحص الفيروسات (VirusTotal)
   ------------------------------------------------------------
   يعمل عبر GitHub Actions (لا يحتاج أي سيرفر).
   يقرأ الملفات ذات scan_status='pending' من Supabase، يحمّلها،
   يفحصها في VirusTotal، ثم:
     • آمن  → scan_status='clean' (يظهر للزوار بعد اعتماد الأدمن).
     • مصاب → حذف الملف من التخزين + status='rejected' + scan_status='infected'.

   المتغيّرات المطلوبة (GitHub Secrets — لا تُكتب في أي ملف):
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY
     VIRUSTOTAL_API_KEY
   ============================================================ */

import { createHash } from 'node:crypto';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const VT_KEY = process.env.VIRUSTOTAL_API_KEY || '';
const BUCKET = 'maktabet-library-files';

const MAX_PER_RUN = 3;          // احترام حد VirusTotal المجاني (4 طلبات/دقيقة)
const VT_TIMEOUT_MS = 150000;   // أقصى انتظار لانتهاء التحليل

function need(name, value) {
  if (!value) {
    console.error('✖ المتغيّر ' + name + ' غير مضبوط. راجع Secrets في GitHub.');
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sbHeaders = () => ({
  apikey: SERVICE_KEY,
  Authorization: 'Bearer ' + SERVICE_KEY,
});

/* طلب إلى VirusTotal مع احترام حدّ المعدّل (429) */
async function vtFetch(url, options = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const wait = 65000;
      console.log('⏳ تجاوزنا حدّ VirusTotal — انتظار ' + Math.round(wait / 1000) + 'ث...');
      await sleep(wait);
      continue;
    }
    return res;
  }
  throw new Error('تجاوز حدّ VirusTotal بعد عدّة محاولات');
}

async function listPending() {
  const url =
    SUPABASE_URL +
    '/rest/v1/maktabet_library_files?scan_status=eq.pending' +
    '&select=id,title,storage_path&order=created_at.asc&limit=' + MAX_PER_RUN;
  const r = await fetch(url, { headers: sbHeaders() });
  if (!r.ok) throw new Error('فشل جلب القائمة: ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

async function downloadObject(path) {
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + encodeURI(path), {
    headers: sbHeaders(),
  });
  if (!r.ok) throw new Error('فشل تنزيل الملف: ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

async function removeObject(path) {
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET, {
    method: 'DELETE',
    headers: { ...sbHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [path] }),
  });
  if (!r.ok) console.warn('⚠ تعذّر حذف الملف من التخزين: ' + r.status);
}

async function patchRow(id, body) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/maktabet_library_files?id=eq.' + id, {
    method: 'PATCH',
    headers: { ...sbHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('فشل تحديث السجل: ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

function statsOf(attrs) {
  return (attrs && (attrs.last_analysis_stats || attrs.stats)) || null;
}

/* يعيد { infected:boolean, stats:object } */
async function vtScanFile(buf, filename) {
  const sha256 = createHash('sha256').update(buf).digest('hex');

  // 1) بحث بالبصمة أولاً (يوفّر حصة الفحص)
  const look = await vtFetch('https://www.virustotal.com/api/v3/files/' + sha256, {
    headers: { 'x-apikey': VT_KEY },
  });
  if (look.status === 200) {
    const j = await look.json();
    const stats = statsOf(j.data && j.data.attributes) || {};
    return { infected: isInfected(stats), stats };
  }

  // 2) رفع الملف للفحص
  const form = new FormData();
  form.append('file', new Blob([buf]), filename || 'file');
  const up = await vtFetch('https://www.virustotal.com/api/v3/files', {
    method: 'POST',
    headers: { 'x-apikey': VT_KEY },
    body: form,
  });
  const upJson = await up.json().catch(() => ({}));
  if (!up.ok) {
    throw new Error('فشل رفع الملف إلى VirusTotal: ' + up.status + ' ' + JSON.stringify(upJson).slice(0, 200));
  }
  const analysisId = upJson.data && upJson.data.id;
  if (!analysisId) throw new Error('لم يُعِد VirusTotal مُعرّف التحليل');

  // 3) انتظار انتهاء التحليل
  const started = Date.now();
  while (Date.now() - started < VT_TIMEOUT_MS) {
    await sleep(20000);
    const r = await vtFetch('https://www.virustotal.com/api/v3/analyses/' + analysisId, {
      headers: { 'x-apikey': VT_KEY },
    });
    if (!r.ok) continue;
    const j = await r.json();
    const attrs = j.data && j.data.attributes;
    if (attrs && attrs.status === 'completed') {
      const stats = statsOf(attrs) || {};
      return { infected: isInfected(stats), stats };
    }
  }
  throw new Error('انتهت مهلة انتظار نتيجة الفحص');
}

function isInfected(stats) {
  return Number(stats.malicious || 0) > 0 || Number(stats.suspicious || 0) > 0;
}

/* تحقّق سريع من صلاحية مفتاح VirusTotal — يفشل العامل بوضوح إن كان المفتاح خطأ */
async function vtCheckKey() {
  const r = await fetch('https://www.virustotal.com/api/v3/domains/example.com', {
    headers: { 'x-apikey': VT_KEY },
  });
  if (r.status === 401 || r.status === 403) {
    throw new Error('مفتاح VirusTotal غير صالح (استجابة ' + r.status + ') — راجع السر VIRUSTOTAL_API_KEY.');
  }
}

async function main() {
  need('SUPABASE_URL', SUPABASE_URL);
  need('SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY);
  need('VIRUSTOTAL_API_KEY', VT_KEY);

  const rows = await listPending();
  console.log('🔎 ملفات بانتظار الفحص: ' + rows.length);
  if (!rows.length) {
    console.log('لا يوجد جديد — انتهى بلا عمل.');
    return;
  }

  await vtCheckKey();

  let failures = 0;
  for (const row of rows) {
    if (!row.storage_path) {
      await patchRow(row.id, { scan_status: 'clean', note: 'لا يوجد ملف مخزّن — لا شيء لفحصه.' });
      console.log('✔ بلا ملف مخزّن: ' + row.title);
      continue;
    }
    try {
      const buf = await downloadObject(row.storage_path);
      const { infected, stats } = await vtScanFile(buf, row.storage_path.split('/').pop());
      const malicious = Number(stats.malicious || 0);
      const suspicious = Number(stats.suspicious || 0);
      if (infected) {
        await removeObject(row.storage_path);
        await patchRow(row.id, {
          scan_status: 'infected',
          status: 'rejected',
          note: 'مرفوض تلقائياً: فحص فيروسات إيجابي (خطير: ' + malicious + '، مشبوه: ' + suspicious + ').',
        });
        console.log('🛑 مصاب وحُذف: ' + row.title + ' | ' + JSON.stringify(stats));
      } else {
        await patchRow(row.id, { scan_status: 'clean' });
        console.log('✅ آمن: ' + row.title + ' | ' + JSON.stringify(stats));
      }
    } catch (e) {
      // نتركها 'pending' لإعادة المحاولة في التشغيل القادم
      failures++;
      console.warn('⚠ فشل فحص «' + row.title + '»: ' + (e && e.message ? e.message : e));
    }
    await sleep(15000); // فاصل بين الملفات
  }

  console.log('📊 الملخّص: نجح ' + (rows.length - failures) + ' من ' + rows.length + '، فشل ' + failures + '.');
  if (failures) {
    throw new Error('فشل فحص ' + failures + ' ملف — راجع الرسائل أعلاه.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
