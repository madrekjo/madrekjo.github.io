export const GRADS = [
  "reel-grad-1",
  "reel-grad-2",
  "reel-grad-3",
  "reel-grad-4",
  "reel-grad-5",
] as const;

export type CardColor = "" | (typeof GRADS)[number];