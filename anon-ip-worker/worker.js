// ============================================================
// MADARIK ANON IP - بسّوط معرّف الــ IP الحقيقي للقسم المجهول
// ============================================================
// طريقة النشر:
//   1) wrangler login
//   2) wrangler secret put IP_HASH_SALT   (مثلاً أي كلمة سر طويلة)
//   3) wrangler deploy
// بعد النشر الرابط يصير: https://madarik-anon-ip.<submit>.workers.dev/hash
// الواجهة تلتقطه تلقائياً (بعد تشغيل sr/lib/visitor.functions.ts).
// ملاحظة: الـ IP بيُهشم (SHA-256 + ملح) قبل ما يخرج — لا يُخزَّن ولا يُطبع.
// ============================================================

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";
    if (request.method === "OPTIONS") {
      return new Response("OK", {
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
    const url = new URL(request.url);
    if (url.pathname !== "/hash" || request.method !== "GET") {
      return json({ error: "not found" }, 404, origin);
    }

    const ip =
      request.headers.get("CF-Connecting-IP") ||
      (request.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() ||
      "0.0.0.0";

    const salt = env.IP_HASH_SALT || "madarik-anon-ip";
    const data = new TextEncoder().encode("madarik-anon|" + salt + "|" + ip);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return json({ hash }, 200, origin);
  },
};