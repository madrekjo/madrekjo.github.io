import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

// Admin-only cache of device labels. Non-admins get RLS-denied silently.
const cache = new Map<string, string | null>();
const listeners = new Set<() => void>();
const pending = new Set<string>();
let flushTimer: number | null = null;

function notify() { listeners.forEach((l) => l()); }

async function flush() {
  flushTimer = null;
  const ids = Array.from(pending);
  pending.clear();
  if (ids.length === 0) return;
  const { data } = await supabase.from("device_notes").select("device_id, label").in("device_id", ids);
  const seen = new Set<string>();
  for (const row of (data ?? []) as { device_id: string; label: string }[]) {
    cache.set(row.device_id, row.label);
    seen.add(row.device_id);
  }
  for (const id of ids) if (!seen.has(id)) cache.set(id, null);
  notify();
}

function schedule(deviceId: string) {
  if (cache.has(deviceId) || pending.has(deviceId)) return;
  pending.add(deviceId);
  if (flushTimer == null) flushTimer = window.setTimeout(flush, 80);
}

export function invalidateDeviceLabel(deviceId: string) {
  cache.delete(deviceId);
  schedule(deviceId);
}

export function useDeviceLabel(deviceId: string | null | undefined, enabled: boolean): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (!enabled || !deviceId) return;
    schedule(deviceId);
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [deviceId, enabled]);
  if (!enabled || !deviceId) return null;
  return cache.get(deviceId) ?? null;
}
