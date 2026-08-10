/**
 * sso-worker.js — Cloudflare Worker for unified Google SSO across two Supabase projects.
 *
 * Problem it solves:
 *   The chat and achievement apps live on two DIFFERENT Supabase projects.
 *   A single Google login must mint a session in BOTH projects at once, and the
 *   sessions must later be injected into both SPAs (one full-page navigation, no popups).
 *
 * Flow:
 *   1. GET /login?target=/chat/  (or /achievement/)
 *        -> validates target, signs an HMAC state, redirects the browser to Google.
 *   2. Google -> GET /callback?code&state
 *        -> verifies state HMAC, exchanges the code for tokens, verifies the id_token
 *           (signature via Google JWKS + aud/iss/exp), then mints a session in BOTH
 *           Supabase projects via `auth/v1/token?grant_type=id_token`.
 *        -> stores both sessions in KV under a one-time ticket (TTL 300s)
 *           and 302-redirects to https://madrekjo.github.io/{target}auth/callback?ticket=...
 *   3. GET /session?ticket=...
 *        -> called from the app's AuthCallback page (Origin must be allowed).
 *           Returns the two sessions once, then deletes the ticket.
 *
 * Required secrets (add in Cloudflare, NOT in this file / NOT in git):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   SSO_HMAC_KEY                 (long random string used to sign `state`)
 *   CHAT_SUPABASE_URL
 *   CHAT_ANON_KEY                (publishable/anon key of the chat project)
 *   ACHIEVEMENT_SUPABASE_URL
 *   ACHIEVEMENT_ANON_KEY         (publishable/anon key of the achievement project)
 *
 * Optional environment variables:
 *   ALLOWED_ORIGINS    comma-separated list (default: https://madrekjo.github.io)
 *   APP_ORIGIN         app origin used for final redirect (default: https://madrekjo.github.io)
 *   REDIRECT_URI       Google redirect_uri (default: <this worker's origin>/callback,
 *                      derived from the incoming request so the worker works on any
 *                      *.workers.dev domain)
 *
 * KV binding (wrangler.toml):  SSO_KV
 */

const DEFAULT_APP_ORIGIN = "https://madrekjo.github.io";
const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CERTS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";
const SUPPORTED_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const ALLOWED_TARGETS = ["/chat/", "/achievement/"];
const TICKET_TTL_SECONDS = 300;

/* ------------------------- base64url helpers ------------------------- */

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function b64urlToArrayBuffer(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/* --------------------------- crypto helpers -------------------------- */

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(b64urlDecode(parts[0]));
    const payload = JSON.parse(b64urlDecode(parts[1]));
    return { header, payload };
  } catch {
    return null;
  }
}

/* Verifies the Google id_token: signature (RS256 via JWKS), aud, iss, exp. */
async function verifyIdToken(env, token) {
  const parsed = parseJwt(token);
  if (!parsed) return null;
  const { header, payload } = parsed;

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== env.GOOGLE_CLIENT_ID) return null;
  if (!SUPPORTED_ISSUERS.includes(payload.iss)) return null;
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  if (typeof payload.iat === "number" && payload.iat > now + 300) return null;

  const certsRes = await fetch(GOOGLE_CERTS_ENDPOINT);
  if (!certsRes.ok) return null;
  const certs = await certsRes.json();
  const jwk = (certs.keys || []).find((k) => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) return null;

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256" },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const [h, b, s] = token.split(".");
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    b64urlToArrayBuffer(s),
    new TextEncoder().encode(`${h}.${b}`)
  );
  return ok ? payload : null;
}

/* --------------------------- session helpers ------------------------- */

async function mintSession(env, supabaseUrl, anonKey, idToken) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=id_token`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "google",
      id_token: idToken,
      gotrue_meta_security: {},
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.access_token) {
    throw new Error(`id_token grant failed (${res.status}) for ${supabaseUrl}`);
  }
  return body;
}

function allowedOrigins(env) {
  const raw = env.ALLOWED_ORIGINS || DEFAULT_APP_ORIGIN;
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

/* ------------------------------ handlers ----------------------------- */

async function handleLogin(request, env) {
  const url = new URL(request.url);
  const target = url.searchParams.get("target");
  if (!target || !ALLOWED_TARGETS.includes(target)) {
    return new Response("Invalid target. Use ?target=/chat/ or ?target=/achievement/", { status: 400 });
  }

  const statePayload = b64urlEncode(JSON.stringify({ target, nonce: crypto.randomUUID() }));
  const sig = await hmacSign(env.SSO_HMAC_KEY, statePayload);
  const state = `${statePayload}.${sig}`;
  const redirectUri = env.REDIRECT_URI || `${new URL(request.url).origin}/callback`;

  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
  authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("access_type", "offline");

  return Response.redirect(authUrl.toString(), 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return new Response(`Google rejected the login: ${error}`, { status: 400 });
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return new Response("Missing code or state", { status: 400 });

  const parts = state.split(".");
  if (parts.length !== 2) return new Response("Invalid state", { status: 400 });
  const [statePayload, sig] = parts;
  const expected = await hmacSign(env.SSO_HMAC_KEY, statePayload);
  if (!constantTimeEqual(sig, expected)) return new Response("Invalid state", { status: 400 });

  let parsed;
  try {
    parsed = JSON.parse(b64urlDecode(statePayload));
  } catch {
    return new Response("Invalid state", { status: 400 });
  }
  const target = parsed && parsed.target;
  if (!ALLOWED_TARGETS.includes(target)) return new Response("Invalid state", { status: 400 });

  const redirectUri = env.REDIRECT_URI || `${new URL(request.url).origin}/callback`;
  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenData = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenData || !tokenData.id_token) {
    return new Response("Token exchange with Google failed", { status: 502 });
  }

  const claims = await verifyIdToken(env, tokenData.id_token);
  if (!claims) return new Response("Invalid id_token from Google", { status: 401 });
  if (claims.email_verified === false) return new Response("Email is not verified", { status: 401 });

  let chatSession, achievementSession;
  try {
    [chatSession, achievementSession] = await Promise.all([
      mintSession(env, env.CHAT_SUPABASE_URL, env.CHAT_ANON_KEY, tokenData.id_token),
      mintSession(env, env.ACHIEVEMENT_SUPABASE_URL, env.ACHIEVEMENT_ANON_KEY, tokenData.id_token),
    ]);
  } catch (err) {
    console.error("[sso] mintSession failed", err);
    return new Response("Failed to create sessions", { status: 502 });
  }

  const ticket = crypto.randomUUID();
  await env.SSO_KV.put(
    `ticket:${ticket}`,
    JSON.stringify({ chat: chatSession, achievement: achievementSession, target }),
    { expirationTtl: TICKET_TTL_SECONDS }
  );

  const appOrigin = env.APP_ORIGIN || DEFAULT_APP_ORIGIN;
  return Response.redirect(`${appOrigin}${target}auth/callback?ticket=${encodeURIComponent(ticket)}`, 302);
}

async function handleSession(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = allowedOrigins(env);
  if (!origin || !allowed.includes(origin)) {
    return new Response("Forbidden origin", { status: 403 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  if (!ticket) return new Response("Missing ticket", { status: 400 });

  const raw = await env.SSO_KV.get(`ticket:${ticket}`);
  if (!raw) return new Response("Ticket not found or expired", { status: 401 });

  // One-time use: delete immediately to prevent replay.
  await env.SSO_KV.delete(`ticket:${ticket}`);

  return new Response(raw, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

/* -------------------------------- main ------------------------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "OPTIONS") {
        return handleSession(request, env);
      }
      if (path === "/login" && request.method === "GET") return await handleLogin(request, env);
      if (path === "/callback" && request.method === "GET") return await handleCallback(request, env);
      if (path === "/session" && request.method === "GET") return await handleSession(request, env);
      if (path === "/" || path === "/health") return new Response("OK", { status: 200 });
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error("[sso] unhandled error", err);
      return new Response("Internal error", { status: 500 });
    }
  },
};
