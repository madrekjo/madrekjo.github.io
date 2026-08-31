import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";

const INTERVAL_MS = 60_000;
// How long without hearing from a leader before a tab assumes leadership.
// Larger than INTERVAL_MS so a healthy leader's periodic announcements are
// always observed first, but small enough that a closed/stale leader is
// replaced promptly.
const LEADER_TIMEOUT_MS = 90_000;
const LEADER_TYPE = "hb-leader";

function sendHeartbeat(seconds: number) {
  supabase.rpc("heartbeat_device", { p_device_id: getDeviceId(), p_seconds: seconds });
}

/**
 * Reports device presence to the server once per interval.
 *
 * Only ONE tab per device actually issues the periodic heartbeat. Tabs elect a
 * single "leader" via BroadcastChannel keyed by the shared device id, so opening
 * the site in several tabs does not multiply the number of requests. If the
 * leader tab closes (or goes quiet), another tab takes over automatically.
 *
 * The device id is stored in localStorage, so all tabs of the same browser share
 * it — this deduplication only ever groups tabs of the same physical device and
 * never merges different devices/users.
 *
 * Environments without BroadcastChannel fall back to the original per-tab
 * behavior so the heartbeat is never lost.
 */
export function useHeartbeat() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const did = getDeviceId();

    // Fallback when BroadcastChannel is unavailable: behave like the only tab.
    const runSingleTab = () => {
      let lastTick = Date.now();
      sendHeartbeat(0);
      const t = window.setInterval(() => {
        if (document.hidden) return;
        const now = Date.now();
        const sec = Math.min(600, Math.round((now - lastTick) / 1000));
        lastTick = now;
        sendHeartbeat(sec);
      }, INTERVAL_MS);
      return () => window.clearInterval(t);
    };

    if (typeof BroadcastChannel === "undefined") return runSingleTab();

    let bc: BroadcastChannel;
    try {
      bc = new BroadcastChannel(`anon-heartbeat-${did}`);
    } catch {
      return runSingleTab();
    }

    // Random tiebreak so that, in the rare double-leader case, exactly one wins.
    const instanceId = Math.random().toString(36).slice(2);
    let isLeader = false;
    let lastSeen = Date.now();
    let lastTick = Date.now();
    let heartbeatTimer: number | undefined;
    let checkTimer: number | undefined;

    const announce = () => {
      try {
        bc.postMessage({ type: LEADER_TYPE, instanceId, ts: Date.now() });
      } catch {
        /* ignore */
      }
    };

    const sendOnce = () => {
      if (document.hidden) return;
      const now = Date.now();
      const sec = Math.min(600, Math.round((now - lastTick) / 1000));
      lastTick = now;
      sendHeartbeat(sec);
      announce();
    };

    const stopHeartbeat = () => {
      if (heartbeatTimer !== undefined) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }
    };

    const becomeLeader = () => {
      if (isLeader) return;
      isLeader = true;
      lastTick = Date.now();
      sendHeartbeat(0);
      announce();
      heartbeatTimer = window.setInterval(sendOnce, INTERVAL_MS);
    };

    const handleMessage = (e: MessageEvent) => {
      const m = e.data;
      if (!m || m.type !== LEADER_TYPE) return;
      lastSeen = Date.now();
      if (!isLeader) return;
      // Double-leader convergence: keep the tab with the highest instanceId.
      if (typeof m.instanceId === "string" && m.instanceId > instanceId) {
        isLeader = false;
        stopHeartbeat();
      }
    };

    // Periodic leadership election. While a leader is healthy its announcements
    // refresh lastSeen, so a follower never promotes itself.
    checkTimer = window.setInterval(() => {
      if (!isLeader && Date.now() - lastSeen >= LEADER_TIMEOUT_MS) {
        becomeLeader();
      }
    }, LEADER_TIMEOUT_MS);

    bc.addEventListener("message", handleMessage);
    // Initial ping on open (mirrors original per-tab behavior) and a probe that
    // refreshes an existing leader's lastSeen if one is already alive.
    sendHeartbeat(0);
    announce();

    return () => {
      stopHeartbeat();
      if (checkTimer !== undefined) window.clearInterval(checkTimer);
      bc.removeEventListener("message", handleMessage);
      bc.close();
    };
  }, []);
}
