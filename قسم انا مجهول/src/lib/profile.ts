const NAME_KEY = "chat_display_name";
const AVATAR_KEY = "chat_avatar_url";

export type ChatProfile = { name: string; avatar_url: string | null };

export function getProfile(): ChatProfile {
  if (typeof window === "undefined") return { name: "", avatar_url: null };
  return {
    name: localStorage.getItem(NAME_KEY) || "",
    avatar_url: localStorage.getItem(AVATAR_KEY),
  };
}

export function setProfile(p: ChatProfile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NAME_KEY, p.name);
  if (p.avatar_url) localStorage.setItem(AVATAR_KEY, p.avatar_url);
  else localStorage.removeItem(AVATAR_KEY);
}
