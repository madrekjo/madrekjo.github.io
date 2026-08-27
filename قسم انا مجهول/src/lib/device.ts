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
