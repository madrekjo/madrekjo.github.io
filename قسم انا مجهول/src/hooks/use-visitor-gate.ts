import { useEffect, useState } from "react";
import { getDeviceId } from "@/lib/device";
import { checkVisitor, type Challenge, type Decision } from "@/lib/visitor.functions";

type Warning = { message: string; at: string | null } | null;

type Status = {
  loading: boolean;
  banned: boolean;
  decision: Decision;
  score: number;
  matched: string[];
  reason: string | null;
  expires_at: string | null;
  evidence_url: string | null;
  warning: Warning;
  challenge: Challenge | null;
  device_name: string | null;
};

const EMPTY: Status = {
  loading: false,
  banned: false,
  decision: "ALLOW",
  score: 0,
  matched: [],
  reason: null,
  expires_at: null,
  evidence_url: null,
  warning: null,
  challenge: null,
  device_name: null,
};

// إعادة الفحص لا تتكرر: مرة عند الدخول، ثم عند العودة للتبويب (بحد أدنى كل 5 دقائق).
// السبب: كل فحص يكتب البصمات ويحسب النقاط على الخادم — التكرار المستمر مكلف بلا فائدة.
const REFRESH_COOLDOWN_MS = 5 * 60_000;

let cached: Status = { ...EMPTY, loading: true };
const listeners = new Set<(s: Status) => void>();
let inflight = false;
let lastCheckAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function set(s: Status) {
  cached = s;
  listeners.forEach((fn) => fn(s));
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (!document.hidden) runCheck();
  }, REFRESH_COOLDOWN_MS);
}

async function runCheck() {
  if (inflight) return;
  inflight = true;
  lastCheckAt = Date.now();
  try {
    const did = getDeviceId();
    const res = await checkVisitor({ data: { device_id: did } });
    set({
      loading: false,
      banned: !!res.banned,
      decision: res.decision,
      score: res.score,
      matched: res.matched,
      reason: res.reason,
      expires_at: res.expires_at ?? null,
      evidence_url: res.evidence_url ?? null,
      warning: res.warning ?? null,
      challenge: res.challenge ?? null,
      device_name: res.device_name ?? null,
    });
  } catch {
    set({ ...EMPTY });
  } finally {
    inflight = false;
    scheduleNext();
  }
}

export function useVisitorGate(): Status {
  const [state, setState] = useState<Status>(cached);
  useEffect(() => {
    if (typeof window === "undefined") return;
    listeners.add(setState);
    if (cached.loading) runCheck();
    const maybeRefresh = () => {
      if (document.hidden) return;
      if (Date.now() - lastCheckAt < REFRESH_COOLDOWN_MS) return;
      runCheck();
    };
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", maybeRefresh);
    return () => {
      listeners.delete(setState);
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", maybeRefresh);
    };
  }, []);
  return state;
}

export function refreshVisitorStatus() {
  lastCheckAt = 0;
  runCheck();
}

/** Clears the shown warning locally right after the user acknowledges it. */
export function clearShownWarning() {
  if (cached.warning) set({ ...cached, warning: null });
}

export function setLocalDeviceName(name: string | null) {
  set({ ...cached, device_name: name });
}
