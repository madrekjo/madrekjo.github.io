const TOKEN_KEY = "ajr_author_token";

export const getAuthorToken = (): string => {
  if (typeof window === "undefined") return "anon-unknown-000001";
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = `ajr-${Date.now().toString(36)}-${crypto.randomUUID()}`;
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
};