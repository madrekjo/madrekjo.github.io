import { aiEnv, settings } from './config.js';
import * as logger from './logger.js';

export class AIError extends Error {
  constructor(message, { kind = 'api', status = null, retryable = true } = {}) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.retryable = retryable;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isRetryable(err) {
  return err instanceof AIError && err.retryable;
}

export async function chat(messages, opts = {}) {
  const env = aiEnv();
  const cfg = settings();

  if (env.provider === 'mock') {
    throw new AIError('mock provider handled elsewhere', { retryable: false });
  }

  if (env.provider === 'gemini') {
    if (!env.geminiApiKey) {
      throw new AIError(
        'GEMINI_API_KEY غير مضبوط. أضفه في .env (AI_PROVIDER=gemini)، أو استخدم AI_PROVIDER=mock للتجربة.',
        { kind: 'config', retryable: false }
      );
    }
    return chatWithRetry(env, async () => requestGemini(env, messages, opts), cfg, opts);
  }

  if (!env.apiKey) {
    throw new AIError(
      'AI_API_KEY غير مضبوط. انسخ .env.example إلى .env وعبّئ المفتاح، أو استخدم AI_PROVIDER=mock للتجربة.',
      { kind: 'config', retryable: false }
    );
  }
  if (!env.baseUrl) {
    throw new AIError(
      'AI_BASE_URL غير مضبوط. حدد عنوان واجهة متوافقة مع OpenAI (راجع .env.example).',
      { kind: 'config', retryable: false }
    );
  }

  return chatWithRetry(env, () => requestOnce(env, messages, opts), cfg, opts);
}

async function chatWithRetry(env, fn, cfg, opts) {
  const maxRetries = opts.maxRetries ?? cfg.max_retries;
  const base = cfg.backoff_base_seconds ?? 5;
  const mult = cfg.backoff_multiplier ?? 3;
  const maxWait = cfg.backoff_max_seconds ?? 60;

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt >= maxRetries) break;
      const wait = Math.min(maxWait, base * Math.pow(mult, attempt));
      logger.warn(`طلب AI فشل (المحاولة ${attempt + 1}/${maxRetries + 1}): ${err.message} — إعادة بعد ${wait}s`);
      await sleep(wait * 1000);
    }
  }
  throw lastError;
}

async function requestGemini(env, messages, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || env.timeoutMs || 120000);

  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const model = env.geminiModel || opts.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`;

  const body = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxTokens ?? 4000,
      responseMimeType: opts.json ? 'application/json' : 'text/plain'
    }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    const timeout = err && err.name === 'AbortError';
    throw new AIError(
      timeout ? `انتهت مهلة طلب Gemini (${opts.timeoutMs || env.timeoutMs}ms)` : `خطأ شبكة: ${err.message}`,
      { kind: timeout ? 'timeout' : 'network' }
    );
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = await res.json(); } catch { /* قد لا يكون JSON */ }

  if (!res.ok) {
    const raw = (data && data.error && data.error.message) || res.statusText;
    const retryable = res.status === 429 || res.status >= 500;
    const blocked = data && data.promptFeedback && data.promptFeedback.blockReason;
    throw new AIError(`فشل طلب Gemini [HTTP ${res.status}]: ${raw}${blocked ? ' — حُظر بسبب ' + blocked : ''}`, {
      status: res.status,
      retryable: retryable && !blocked
    });
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  if (!text) {
    const fb = data?.promptFeedback?.blockReason;
    throw new AIError(`استجابة Gemini فارغة${fb ? ' (blockReason: ' + fb + ')' : ''}`, { retryable: !fb });
  }
  return text;
}

async function requestOnce(env, messages, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || env.timeoutMs || 120000);
  let res;
  try {
    res = await fetch(env.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + env.apiKey
      },
      body: JSON.stringify({
        model: env.model || opts.model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 4000,
        stream: false
      }),
      signal: controller.signal
    });
  } catch (err) {
    const timeout = err && err.name === 'AbortError';
    throw new AIError(
      timeout ? `انتهت مهلة الطلب (${opts.timeoutMs || env.timeoutMs}ms)` : `خطأ شبكة: ${err.message}`,
      { kind: timeout ? 'timeout' : 'network' }
    );
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  try { body = await res.json(); } catch { /* قد لا يكون JSON */ }

  if (!res.ok) {
    const code = (body && (body.error?.code || body.error?.type)) || `HTTP ${res.status}`;
    const msg = (body && body.error && (body.error.message || JSON.stringify(body.error))) || res.statusText;
    const retryable = res.status === 429 || res.status >= 500;
    throw new AIError(`فشل طلب AI [${code}]: ${msg}`, { status: res.status, retryable });
  }

  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new AIError('استجابة AI فارغة', { retryable: true });
  }
  return text;
}

export function extractJsonArray(text) {
  const cleaned = text
    .trim()
    .replace(/^```(json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new AIError('لا يوجد مصفوفة JSON في استجابة AI', { retryable: false });
  }
  const raw = cleaned.slice(start, end + 1);
  return JSON.parse(raw);
}
