/**
 * sso-worker.js
 *
 * Cloudflare Worker for unified Google SSO across two Supabase projects.
 *
 * Flow:
 * 1. /login?target=/chat/
 * 2. Google OAuth
 * 3. /callback
 * 4. Verify Google ID token
 * 5. Mint Supabase sessions for Chat + Achievement
 * 6. Store sessions in KV
 * 7. Redirect to the requested app
 */

const DEFAULT_APP_ORIGIN = "https://madrekjo.github.io";

const GOOGLE_AUTH_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";

const GOOGLE_TOKEN_ENDPOINT =
  "https://oauth2.googleapis.com/token";

const GOOGLE_CERTS_ENDPOINT =
  "https://www.googleapis.com/oauth2/v3/certs";

const SUPPORTED_ISSUERS = [
  "https://accounts.google.com",
  "accounts.google.com",
];

const ALLOWED_TARGETS = [
  "/chat/",
  "/achievement/",
];

const TICKET_TTL_SECONDS = 300;


/* =========================================================
   Base64URL helpers
   ========================================================= */

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);

  let bin = "";

  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }

  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


function b64urlDecode(str) {
  const pad =
    str.length % 4 === 0
      ? ""
      : "=".repeat(4 - (str.length % 4));

  const b64 =
    str
      .replace(/-/g, "+")
      .replace(/_/g, "/") + pad;

  const bin = atob(b64);

  const bytes = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }

  return new TextDecoder().decode(bytes);
}


function b64urlToArrayBuffer(str) {
  const pad =
    str.length % 4 === 0
      ? ""
      : "=".repeat(4 - (str.length % 4));

  const b64 =
    str
      .replace(/-/g, "+")
      .replace(/_/g, "/") + pad;

  const bin = atob(b64);

  const bytes = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }

  return bytes.buffer;
}


/* =========================================================
   Crypto helpers
   ========================================================= */

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


function constantTimeEqual(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    a.length !== b.length
  ) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}


function parseJwt(token) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    const header = JSON.parse(
      b64urlDecode(parts[0])
    );

    const payload = JSON.parse(
      b64urlDecode(parts[1])
    );

    return {
      header,
      payload,
    };
  } catch {
    return null;
  }
}


/* =========================================================
   Google ID Token verification
   ========================================================= */

async function verifyIdToken(env, token) {
  const parsed = parseJwt(token);

  if (!parsed) {
    console.error(
      "[sso][google] Could not parse Google ID token"
    );

    return null;
  }

  const { header, payload } = parsed;

  const now = Math.floor(Date.now() / 1000);

  console.log("[sso][google] ID token claims:", {
    issuer: payload.iss || null,
    audienceMatches:
      payload.aud === env.GOOGLE_CLIENT_ID,
    emailVerified:
      payload.email_verified ?? null,
    hasEmail:
      Boolean(payload.email),
    expiresIn:
      typeof payload.exp === "number"
        ? payload.exp - now
        : null,
  });

  if (
    payload.aud !==
    env.GOOGLE_CLIENT_ID
  ) {
    console.error(
      "[sso][google] Audience mismatch"
    );

    return null;
  }

  if (
    !SUPPORTED_ISSUERS.includes(
      payload.iss
    )
  ) {
    console.error(
      "[sso][google] Invalid issuer:",
      payload.iss
    );

    return null;
  }

  if (
    typeof payload.exp !== "number" ||
    payload.exp < now
  ) {
    console.error(
      "[sso][google] ID token expired"
    );

    return null;
  }

  if (
    typeof payload.iat === "number" &&
    payload.iat > now + 300
  ) {
    console.error(
      "[sso][google] Invalid issued-at time"
    );

    return null;
  }

  const certsRes = await fetch(
    GOOGLE_CERTS_ENDPOINT
  );

  if (!certsRes.ok) {
    console.error(
      "[sso][google] Failed to fetch Google JWKS:",
      certsRes.status
    );

    return null;
  }

  const certs = await certsRes.json();

  const jwk = (certs.keys || []).find(
    (k) =>
      k.kid === header.kid &&
      k.kty === "RSA"
  );

  if (!jwk) {
    console.error(
      "[sso][google] Matching Google signing key not found"
    );

    return null;
  }

  const publicKey =
    await crypto.subtle.importKey(
      "jwk",
      {
        kty: "RSA",
        n: jwk.n,
        e: jwk.e,
        alg: "RS256",
      },
      {
        name:
          "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["verify"]
    );

  const [h, b, s] =
    token.split(".");

  const ok =
    await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      b64urlToArrayBuffer(s),
      new TextEncoder().encode(
        `${h}.${b}`
      )
    );

  if (!ok) {
    console.error(
      "[sso][google] Google ID token signature invalid"
    );

    return null;
  }

  console.log(
    "[sso][google] ID token verified successfully"
  );

  return payload;
}


/* =========================================================
   Supabase session
   ========================================================= */

async function mintSession(
  env,
  label,
  supabaseUrl,
  anonKey,
  idToken
) {
  const endpoint =
    `${supabaseUrl}/auth/v1/token?grant_type=id_token`;

  console.log(
    `\n[sso][debug][${label}] ================================`
  );

  console.log(
    `[sso][debug][${label}] Starting Supabase session creation`
  );

  console.log(
    `[sso][debug][${label}] URL:`,
    endpoint
  );

  console.log(
    `[sso][debug][${label}] URL valid:`,
    Boolean(supabaseUrl)
  );

  console.log(
    `[sso][debug][${label}] ANON key present:`,
    Boolean(anonKey)
  );

  console.log(
    `[sso][debug][${label}] ANON key length:`,
    typeof anonKey === "string"
      ? anonKey.length
      : 0
  );

  console.log(
    `[sso][debug][${label}] Google ID token present:`,
    Boolean(idToken)
  );

  console.log(
    `[sso][debug][${label}] Google ID token length:`,
    typeof idToken === "string"
      ? idToken.length
      : 0
  );

  if (!supabaseUrl) {
    throw new Error(
      `${label}: SUPABASE_URL missing`
    );
  }

  if (!anonKey) {
    throw new Error(
      `${label}: ANON_KEY missing`
    );
  }

  if (!idToken) {
    throw new Error(
      `${label}: Google ID token missing`
    );
  }

  let res;

  try {
    res = await fetch(endpoint, {
      method: "POST",

      headers: {
        apikey: anonKey,
        Authorization:
          `Bearer ${anonKey}`,
        "Content-Type":
          "application/json",
        Accept:
          "application/json",
      },

      body: JSON.stringify({
        provider: "google",
        id_token: idToken,
      }),
    });
  } catch (networkError) {
    console.error(
      `[sso][debug][${label}] Network error:`,
      networkError
    );

    throw new Error(
      `${label}: Supabase network request failed`
    );
  }

  console.log(
    `[sso][debug][${label}] HTTP status:`,
    res.status
  );

  console.log(
    `[sso][debug][${label}] HTTP status text:`,
    res.statusText
  );

  console.log(
    `[sso][debug][${label}] Content-Type:`,
    res.headers.get(
      "content-type"
    )
  );

  console.log(
    `[sso][debug][${label}] Server:`,
    res.headers.get("server")
  );

  console.log(
    `[sso][debug][${label}] Request ID:`,
    res.headers.get(
      "x-request-id"
    )
  );

  const rawBody =
    await res.text();

  /*
   * IMPORTANT:
   * We intentionally print the raw response from Supabase.
   *
   * We DO NOT print:
   * - anon key
   * - Google ID token
   * - access token
   * - refresh token
   */

  console.log(
    `[sso][debug][${label}] RAW SUPABASE RESPONSE:`,
    rawBody
  );

  let body = null;

  try {
    body =
      JSON.parse(rawBody);
  } catch {
    console.log(
      `[sso][debug][${label}] Response is not JSON`
    );
  }

  if (!res.ok) {
    // Safe diagnostic: only status + error/error_description/msg from Supabase.
    // Never logs any token, key, or the raw response body.
    const safe = body || {};
    console.error(
      `[sso][diagnostic][${label}] SUPABASE REQUEST FAILED`,
      {
        project: label,
        status: res.status,
        error: safe.error || null,
        error_description: safe.error_description || null,
        msg: safe.msg || null,
      }
    );

    throw new Error(
      `${label}: Supabase returned HTTP ${res.status}`
    );
  }

  if (
    !body ||
    !body.access_token
  ) {
    // Safe diagnostic: only status + error/error_description/msg.
    const safe = body || {};
    console.error(
      `[sso][diagnostic][${label}] SUPABASE RESPONSE HAS NO ACCESS TOKEN`,
      {
        project: label,
        status: res.status,
        error: safe.error || null,
        error_description: safe.error_description || null,
        msg: safe.msg || null,
      }
    );

    throw new Error(
      `${label}: Supabase did not return access_token`
    );
  }

  console.log(
    `[sso][debug][${label}] Session created successfully`
  );

  console.log(
    `[sso][debug][${label}] ================================\n`
  );

  return body;
}


/* =========================================================
   CORS
   ========================================================= */

function allowedOrigins(env) {
  const raw =
    env.ALLOWED_ORIGINS ||
    DEFAULT_APP_ORIGIN;

  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}


function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin":
      origin,

    "Access-Control-Allow-Methods":
      "GET, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",

    "Access-Control-Max-Age":
      "86400",

    Vary: "Origin",
  };
}


/* =========================================================
   /login
   ========================================================= */

async function handleLogin(
  request,
  env
) {
  const url =
    new URL(request.url);

  const target =
    url.searchParams.get(
      "target"
    );

  if (
    !target ||
    !ALLOWED_TARGETS.includes(
      target
    )
  ) {
    return new Response(
      "Invalid target. Use ?target=/chat/ or ?target=/achievement/",
      {
        status: 400,
      }
    );
  }

  const statePayload =
    b64urlEncode(
      JSON.stringify({
        target,
        nonce:
          crypto.randomUUID(),
      })
    );

  const sig =
    await hmacSign(
      env.SSO_HMAC_KEY,
      statePayload
    );

  const state =
    `${statePayload}.${sig}`;

  const redirectUri =
    env.REDIRECT_URI ||
    `${new URL(request.url).origin}/callback`;

  const authUrl =
    new URL(
      GOOGLE_AUTH_ENDPOINT
    );

  authUrl.searchParams.set(
    "client_id",
    env.GOOGLE_CLIENT_ID
  );

  authUrl.searchParams.set(
    "redirect_uri",
    redirectUri
  );

  authUrl.searchParams.set(
    "response_type",
    "code"
  );

  authUrl.searchParams.set(
    "scope",
    "openid email profile"
  );

  authUrl.searchParams.set(
    "state",
    state
  );

  authUrl.searchParams.set(
    "prompt",
    "select_account"
  );

  authUrl.searchParams.set(
    "access_type",
    "offline"
  );

  console.log(
    "[sso][login] Redirecting to Google",
    {
      target,
      redirectUri,
    }
  );

  return Response.redirect(
    authUrl.toString(),
    302
  );
}


/* =========================================================
   /callback
   ========================================================= */

async function handleCallback(
  request,
  env
) {
  const url =
    new URL(request.url);

  console.log(
    "\n[sso][callback] =================================="
  );

  console.log(
    "[sso][callback] Callback received"
  );

  console.log(
    "[sso][callback] Origin:",
    url.origin
  );

  const error =
    url.searchParams.get(
      "error"
    );

  if (error) {
    console.error(
      "[sso][callback] Google returned error:",
      error
    );

    return new Response(
      `Google rejected the login: ${error}`,
      {
        status: 400,
      }
    );
  }

  const code =
    url.searchParams.get(
      "code"
    );

  const state =
    url.searchParams.get(
      "state"
    );

  if (!code || !state) {
    return new Response(
      "Missing code or state",
      {
        status: 400,
      }
    );
  }

  console.log(
    "[sso][callback] Google authorization code received"
  );

  console.log(
    "[sso][callback] State received"
  );

  const parts =
    state.split(".");

  if (parts.length !== 2) {
    return new Response(
      "Invalid state",
      {
        status: 400,
      }
    );
  }

  const [
    statePayload,
    sig,
  ] = parts;

  const expected =
    await hmacSign(
      env.SSO_HMAC_KEY,
      statePayload
    );

  if (
    !constantTimeEqual(
      sig,
      expected
    )
  ) {
    console.error(
      "[sso][callback] State signature mismatch"
    );

    return new Response(
      "Invalid state",
      {
        status: 400,
      }
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(
        b64urlDecode(
          statePayload
        )
      );
  } catch {
    return new Response(
      "Invalid state",
      {
        status: 400,
      }
    );
  }

  const target =
    parsed &&
    parsed.target;

  if (
    !ALLOWED_TARGETS.includes(
      target
    )
  ) {
    return new Response(
      "Invalid state",
      {
        status: 400,
      }
    );
  }

  console.log(
    "[sso][callback] Target:",
    target
  );

  /* -------------------------------------------------------
     Exchange Google authorization code
     ------------------------------------------------------- */

  const redirectUri =
    env.REDIRECT_URI ||
    `${new URL(request.url).origin}/callback`;

  console.log(
    "[sso][google] Exchanging authorization code"
  );

  console.log(
    "[sso][google] Redirect URI:",
    redirectUri
  );

  let tokenRes;

  try {
    tokenRes =
      await fetch(
        GOOGLE_TOKEN_ENDPOINT,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },

          body:
            new URLSearchParams({
              code,
              client_id:
                env.GOOGLE_CLIENT_ID,
              client_secret:
                env.GOOGLE_CLIENT_SECRET,
              redirect_uri:
                redirectUri,
              grant_type:
                "authorization_code",
            }),
        }
      );
  } catch (err) {
    console.error(
      "[sso][google] Network error while exchanging code:",
      err
    );

    return new Response(
      "Google token exchange network error",
      {
        status: 502,
      }
    );
  }

  const tokenRaw =
    await tokenRes.text();

  let tokenData = null;

  try {
    tokenData =
      JSON.parse(tokenRaw);
  } catch {
    console.error(
      "[sso][google] Google returned non-JSON response"
    );
  }

  console.log(
    "[sso][google] Token exchange HTTP status:",
    tokenRes.status
  );

  if (!tokenRes.ok) {
    // Safe diagnostic: only status + error/error_description. Never the code,
    // client_secret, or any token from Google's response body.
    const safe = tokenData || {};
    console.error(
      "[sso][google] Token exchange failed:",
      {
        status:
          tokenRes.status,
        error:
          safe.error || null,
        error_description:
          safe.error_description || null,
      }
    );

    return new Response(
      "Token exchange with Google failed",
      {
        status: 502,
      }
    );
  }

  if (
    !tokenData ||
    !tokenData.id_token
  ) {
    console.error(
      "[sso][google] Google did not return an ID token",
      {
        responseKeys:
          tokenData
            ? Object.keys(
                tokenData
              )
            : [],
      }
    );

    return new Response(
      "Google did not return an ID token",
      {
        status: 502,
      }
    );
  }

  console.log(
    "[sso][google] Google token exchange successful"
  );

  /* -------------------------------------------------------
     Verify Google ID token
     ------------------------------------------------------- */

  const claims =
    await verifyIdToken(
      env,
      tokenData.id_token
    );

  if (!claims) {
    return new Response(
      "Invalid id_token from Google",
      {
        status: 401,
      }
    );
  }

  if (
    claims.email_verified === false
  ) {
    return new Response(
      "Email is not verified",
      {
        status: 401,
      }
    );
  }

  console.log(
    "[sso][google] Google account verified"
  );

  /* -------------------------------------------------------
     Mint Supabase sessions
     ------------------------------------------------------- */

  let chatSession;
  let achievementSession;

  try {
    console.log(
      "[sso] Starting Supabase sessions..."
    );

    [
      chatSession,
      achievementSession,
    ] = await Promise.all([
      mintSession(
        env,
        "chat",
        env.CHAT_SUPABASE_URL,
        env.CHAT_ANON_KEY,
        tokenData.id_token
      ),

      mintSession(
        env,
        "achievement",
        env.ACHIEVEMENT_SUPABASE_URL,
        env.ACHIEVEMENT_ANON_KEY,
        tokenData.id_token
      ),
    ]);
  } catch (err) {
    console.error(
      "[sso] mintSession failed:",
      err
    );

    return new Response(
      "Failed to create sessions",
      {
        status: 502,
      }
    );
  }

  console.log(
    "[sso] Both Supabase sessions created successfully"
  );

  /* -------------------------------------------------------
     Ticket storage (D1)
     ------------------------------------------------------- */

  const ticket =
    crypto.randomUUID();

  const now =
    Date.now();

  try {
    await env.madrekjo_sso_db
      .prepare(
        "INSERT INTO tickets (id, payload, created_at, expires_at) VALUES (?, ?, ?, ?)"
      )
      .bind(
        ticket,
        JSON.stringify({
          chat:
            chatSession,

          achievement:
            achievementSession,

          target,
        }),
        now,
        now +
          TICKET_TTL_SECONDS *
            1000
      )
      .run();
  } catch (err) {
    console.error(
      "[sso] D1 ticket insert failed:",
      err
    );

    return new Response(
      "Failed to store login ticket",
      {
        status: 502,
      }
    );
  }

  console.log(
    "[sso] Sessions stored in D1"
  );

  const appOrigin =
    env.APP_ORIGIN ||
    DEFAULT_APP_ORIGIN;

  const destination =
    `${appOrigin}${target}auth/callback?ticket=${encodeURIComponent(
      ticket
    )}`;

  console.log(
    "[sso] Redirecting to application:",
    destination.replace(
      /ticket=[^&]+/,
      "ticket=REDACTED"
    )
  );

  console.log(
    "[sso][callback] ==================================\n"
  );

  return Response.redirect(
    destination,
    302
  );
}


/* =========================================================
   /session
   ========================================================= */

async function handleSession(
  request,
  env
) {
  const origin =
    request.headers.get(
      "Origin"
    );

  const allowed =
    allowedOrigins(env);

  if (
    !origin ||
    !allowed.includes(origin)
  ) {
    console.error(
      "[sso][session] Forbidden origin:",
      origin
    );

    return new Response(
      "Forbidden origin",
      {
        status: 403,
      }
    );
  }

  if (
    request.method ===
    "OPTIONS"
  ) {
    return new Response(
      null,
      {
        status: 204,
        headers:
          corsHeaders(origin),
      }
    );
  }

  if (
    request.method !== "GET"
  ) {
    return new Response(
      "Method not allowed",
      {
        status: 405,
      }
    );
  }

  const url =
    new URL(request.url);

  const ticket =
    url.searchParams.get(
      "ticket"
    );

  if (!ticket) {
    return new Response(
      "Missing ticket",
      {
        status: 400,
      }
    );
  }

  let storeRaw = null;

  try {
    const rows =
      await env.madrekjo_sso_db
        .prepare(
          "SELECT payload FROM tickets WHERE id = ? AND expires_at > ?"
        )
        .bind(
          ticket,
          Date.now()
        )
        .first();

    storeRaw =
      rows?.payload ??
      null;
  } catch (err) {
    console.error(
      "[sso] D1 ticket read failed:",
      err
    );
  }

  if (storeRaw === null) {
    // احتياط لما قبل D1: التحقق من KV القديم إن وُجد (تذاكر قديمة).
    const kvRaw =
      await env.SSO_KV.get(
        `ticket:${ticket}`
      ).catch(() => null);

    if (kvRaw) {
      await env.SSO_KV
        .delete(`ticket:${ticket}`)
        .catch(() => null);
    }

    storeRaw = kvRaw;
  }

  if (!storeRaw) {
    return new Response(
      "Ticket not found or expired",
      {
        status: 401,
      }
    );
  }

  // حذف التذكرة من D1 بعد استخدامها (مرة واحدة فقط).
  await env.madrekjo_sso_db
    .prepare(
      "DELETE FROM tickets WHERE id = ?"
    )
    .bind(ticket)
    .run()
    .catch((err) => {
      console.error(
        "[sso] D1 ticket delete failed:",
        err
      );
    });

  return new Response(
    storeRaw,
    {
      status: 200,

      headers: {
        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store",

        ...corsHeaders(
          origin
        ),
      },
    }
  );
}


/* =========================================================
   Main
   ========================================================= */

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(request.url);

    const path =
      url.pathname;

    try {
      if (
        request.method ===
        "OPTIONS"
      ) {
        return handleSession(
          request,
          env
        );
      }

      if (
        path === "/login" &&
        request.method ===
          "GET"
      ) {
        return await handleLogin(
          request,
          env
        );
      }

      if (
        path === "/callback" &&
        request.method ===
          "GET"
      ) {
        return await handleCallback(
          request,
          env
        );
      }

      if (
        path === "/session" &&
        request.method ===
          "GET"
      ) {
        return await handleSession(
          request,
          env
        );
      }

      if (
        path === "/" ||
        path === "/health"
      ) {
        return new Response(
          "OK",
          {
            status: 200,
          }
        );
      }

      return new Response(
        "Not found",
        {
          status: 404,
        }
      );
    } catch (err) {
      console.error(
        "[sso] UNHANDLED ERROR:",
        err
      );

      return new Response(
        "Internal error",
        {
          status: 500,
        }
      );
    }
  },
};