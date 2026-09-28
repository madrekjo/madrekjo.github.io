const KEY = "anon_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr-placeholder";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** يثبّت معرّف الجهاز (يُستخدم لما نرجّع المستخدم لمعرّفه الأصلي بعد تغيير الدومين). */
export function setDeviceId(id: string) {
  if (typeof window === "undefined" || !id) return;
  if (id.length < 8 || id.length > 128) return;
  localStorage.setItem(KEY, id);
}
