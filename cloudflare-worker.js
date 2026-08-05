// ============================================================
// Worker تبع Cloudflare — موصل مُدرك بنموذج Llama 3 (Workers AI)
// ============================================================
// طريقة النشر:
// 1) ادخل https://dash.cloudflare.com → Workers & Pages → Create
// 2) اضغط Create Worker → احذف الكود القديم والصق هاد الملف → Deploy
// 3) من الداشبورد تبع الـ Worker: Settings → Variables
//    - أضف مفتاح تشفير اختياري: MK_KEY = أي كلمة سر
//      (إذا تركته فاضي، أي شخص يقدر يستخدم الـ Worker — يفضل تضع مفتاح)
// 4) بعد النشر، انسخ رابط الـ Worker (worker-name.workers.dev)
//    وحطه في js/chatbot.js داخل AI.endpoint
// 5) تأكد أن Workers AI مفعل من حسابك (مجاني بدون بطاقة، ليه حد يومي)
// ============================================================

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response('OK', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-mk-key'
        }
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'استخدم POST فقط' }, 405);
    }

    // أمان اختياري: إذا حطيت MK_KEY لازم ترسل مع الطلب x-mk-key
    if (env.MK_KEY && request.headers.get('x-mk-key') !== env.MK_KEY) {
      return json({ error: 'unauthorized' }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'JSON غير صالح' }, 400);
    }

    const model = body.model || DEFAULT_MODEL;
    const messages = (body.messages || []).slice(-8);
    if (messages.length === 0) {
      return json({ error: 'لا توجد رسائل' }, 400);
    }

    // التحقق من توفر ربط Workers AI (env.AI)
    if (!env.AI) {
      return json({
        error: 'no-ai-binding',
        hint: 'Workers AI غير مفعل. من داشبورد Cloudflare: افتح الـ Worker → Settings → Bindings → Add → AI binding (اسمه AI)، أو فعّل Workers AI من صفحة الموقع.'
      }, 500);
    }

    try {
      const out = await env.AI.run(model, {
        messages,
        max_tokens: 512,
        temperature: 0.3
      });
      const text = out && out.response ? out.response : (typeof out === 'string' ? out : JSON.stringify(out));
      return json({ response: text }, 200);
    } catch (err) {
      return json({
        error: 'ai-run-failed',
        detail: err && err.message ? err.message : String(err)
      }, 500);
    }
  }
};
