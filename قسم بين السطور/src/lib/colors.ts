export const GRADS = [
  "reel-grad-1",
  "reel-grad-2",
  "reel-grad-3",
  "reel-grad-4",
  "reel-grad-5",
] as const;

export type CardColor = "" | (typeof GRADS)[number];

export const CAT_META: Record<
  string,
  { icon: string; chip: string }
> = {
  رواية: {
    icon: "📖",
    chip: "border-blue-200 bg-blue-50 text-blue-700",
  },
  ديني: {
    icon: "🕌",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  تنمية: {
    icon: "📚",
    chip: "border-sky-200 bg-sky-50 text-sky-700",
  },
  شعر: {
    icon: "📝",
    chip: "border-violet-200 bg-violet-50 text-violet-700",
  },
  تاريخ: {
    icon: "🏛️",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

export const THUMB_SOFT: Record<string, string> = {
  "": "border-line from-[#faf4e6] to-[#eee3c9]",
  "reel-grad-1": "border-orange-200 from-amber-100 to-orange-200",
  "reel-grad-2": "border-emerald-200 from-emerald-100 to-teal-200",
  "reel-grad-3": "border-sky-200 from-sky-100 to-indigo-200",
  "reel-grad-4": "border-violet-200 from-violet-100 to-purple-200",
  "reel-grad-5": "border-rose-200 from-rose-100 to-pink-200",
};