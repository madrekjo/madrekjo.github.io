import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { useEffect, useState } from "react";

export async function setDeviceName(name: string) {
  const { data, error } = await (supabase.rpc as any)("set_device_name", {
    p_device_id: getDeviceId(),
    p_name: name,
  });
  if (error) return { ok: false, error: error.message } as const;
  const r = (data ?? {}) as { ok?: boolean; name?: string | null; error?: string };
  return { ok: !!r.ok, name: r.name ?? null, error: r.error } as const;
}

export async function probeNameFeature(): Promise<boolean> {
  const { error } = await (supabase.rpc as any)("get_device_name", { p_device_id: getDeviceId() });
  return !error;
}

let nameMap: Map<string, string> | null = null;
const listeners = new Set<() => void>();
let pending = false;

function notify() { listeners.forEach((l) => l()); }

async function load() {
  if (pending) return;
  pending = true;
  const { data } = await supabase.from("device_names").select("device_id, name");
  const next = new Map<string, string>();
  for (const row of (data ?? []) as { device_id: string; name: string }[]) {
    next.set(row.device_id, row.name);
  }
  nameMap = next;
  pending = false;
  notify();
}

export function invalidateDeviceNames() {
  nameMap = null;
  void load();
}

export function useDeviceNames(enabled: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (!nameMap && !pending) void load();
    else if (nameMap) return;
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [enabled]);
  return { names: nameMap ?? new Map<string, string>(), refresh: invalidateDeviceNames };
}
