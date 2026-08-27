import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";

const INTERVAL_MS = 60_000;

export function useHeartbeat() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const did = getDeviceId();
    let lastTick = Date.now();
    // initial ping
    supabase.rpc("heartbeat_device", { p_device_id: did, p_seconds: 0 });
    const t = window.setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      const sec = Math.min(600, Math.round((now - lastTick) / 1000));
      lastTick = now;
      supabase.rpc("heartbeat_device", { p_device_id: did, p_seconds: sec });
    }, INTERVAL_MS);
    return () => window.clearInterval(t);
  }, []);
}
