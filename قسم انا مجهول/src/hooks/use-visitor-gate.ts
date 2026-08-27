import { useEffect, useState } from "react";
import { getDeviceId } from "@/lib/device";
import { checkVisitor } from "@/lib/visitor.functions";

type Status = {
  loading: boolean;
  banned: boolean;
  reason: string | null;
  expires_at: string | null;
  evidence_url: string | null;
};

let cached: Status = { loading: true, banned: false, reason: null, expires_at: null, evidence_url: null };
const listeners = new Set<(s: Status) => void>();
let inflight = false;

function set(s: Status) {
  cached = s;
  listeners.forEach((fn) => fn(s));
}

async function runCheck() {
  if (inflight) return;
  inflight = true;
  try {
    const did = getDeviceId();
    const res = await checkVisitor({ data: { device_id: did } });
    set({
      loading: false,
      banned: !!res.banned,
      reason: res.reason,
      expires_at: res.expires_at ?? null,
      evidence_url: res.evidence_url ?? null,
    });
  } catch {
    set({ loading: false, banned: false, reason: null, expires_at: null, evidence_url: null });
  } finally {
    inflight = false;
  }
}

export function useVisitorGate(): Status {
  const [state, setState] = useState<Status>(cached);
  useEffect(() => {
    if (typeof window === "undefined") return;
    listeners.add(setState);
    if (cached.loading) runCheck();
    const t = window.setInterval(() => {
      if (!document.hidden) runCheck();
    }, 60_000);
    return () => {
      listeners.delete(setState);
      window.clearInterval(t);
    };
  }, []);
  return state;
}

export function refreshVisitorStatus() {
  runCheck();
}
