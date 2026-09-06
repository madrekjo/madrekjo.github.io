export const REACTIONS = [
  { key: "like", emoji: "👍", label: "أعجبني" },
  { key: "love", emoji: "❤️", label: "أحببته" },
  { key: "haha", emoji: "😂", label: "ضحكت" },
  { key: "wow", emoji: "😮", label: "مذهل" },
  { key: "sad", emoji: "😢", label: "حزين" },
  { key: "angry", emoji: "😡", label: "مزعج" },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];

export const REACTION_MAP: Record<string, string> = Object.fromEntries(
  REACTIONS.map((r) => [r.key, r.emoji])
);

export const reactionEmoji = (type?: string | null): string =>
  REACTION_MAP[type || "like"] || "👍";