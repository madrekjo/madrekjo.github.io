import { syncDeviceFingerprint } from "./fingerprint";

const KEY = "tatawwuri:device";

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = syncDeviceFingerprint();
      try {
        localStorage.setItem(KEY, id);
      } catch {
        /* storage غير متاح — بصمة مباشرة */
      }
    }
    return id;
  } catch {
    return syncDeviceFingerprint();
  }
}