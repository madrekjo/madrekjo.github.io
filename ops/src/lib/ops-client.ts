import { OPS_WORKER_URL } from "@/config/supabase";

export type OpsTarget = "chat" | "anon" | "achievement";

export interface OpsRequest {
  target: OpsTarget;
  action: string;
  params?: Record<string, unknown>;
}

export async function opsCall<T = unknown>(
  req: OpsRequest,
  sessionToken: string
): Promise<T> {
  const res = await fetch(`${OPS_WORKER_URL}/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(req),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Worker error (${res.status})`);
  }
  return body as T;
}

export async function loginToWorker(password: string): Promise<string> {
  const res = await fetch(`${OPS_WORKER_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.token) {
    throw new Error(body?.error || "فشل تسجيل الدخول");
  }
  return body.token as string;
}
