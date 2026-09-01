const DEFAULT_TIMEOUT_MS = 15000;
const MUTATION_TIMEOUT_MS = 60000;
const UPLOAD_TIMEOUT_MS = 60000;
const RETRY_DELAY_MS = 700;

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

let installed = false;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hasLargeBody = (body: BodyInit | null | undefined) => {
  if (!body) return false;
  if (typeof FormData !== "undefined" && body instanceof FormData) return true;
  if (typeof Blob !== "undefined" && body instanceof Blob) return true;
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) return true;
  return false;
};

const methodOf = (input: FetchInput, init?: FetchInit) => {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
};

const shouldRetry = (method: string, error?: unknown, response?: Response) => {
  if (method !== "GET" && method !== "HEAD") return false;
  if (response) return response.status === 408 || response.status === 429 || response.status >= 500;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof TypeError;
};

// طلبات البيانات (POST/PUT/PATCH/DELETE) لا تُعاد المحاولة (غير آمنة لإعادة التنفيذ)،
// لذا نمنحها مهلة أطول حتى لا تُقطع بسبب بطء خادم الدوال السحابية أو البرد الأولي.
const timeoutFor = (init?: FetchInit, method = "GET") =>
  hasLargeBody(init?.body) ? UPLOAD_TIMEOUT_MS
  : method === "GET" || method === "HEAD" ? DEFAULT_TIMEOUT_MS
  : MUTATION_TIMEOUT_MS;

function signalWithTimeout(sourceSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const abortFromSource = () => controller.abort(sourceSignal?.reason);
  if (sourceSignal?.aborted) abortFromSource();
  else sourceSignal?.addEventListener("abort", abortFromSource, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeoutId);
      sourceSignal?.removeEventListener("abort", abortFromSource);
    },
  };
}

export function installNetworkResilience() {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: FetchInput, init?: FetchInit) => {
    const method = methodOf(input, init);
    const maxAttempts = method === "GET" || method === "HEAD" ? 2 : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const { signal, cleanup } = signalWithTimeout(init?.signal, timeoutFor(init, method));
      try {
        const response = await nativeFetch(input, { ...init, signal });
        cleanup();

        if (attempt < maxAttempts && shouldRetry(method, undefined, response)) {
          await wait(RETRY_DELAY_MS * attempt);
          continue;
        }

        return response;
      } catch (error) {
        cleanup();
        lastError = error;

        if (attempt < maxAttempts && shouldRetry(method, error)) {
          await wait(RETRY_DELAY_MS * attempt);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  };
}
