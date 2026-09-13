const AVATAR_BG = [
  "bg-amber-700",
  "bg-emerald-700",
  "bg-sky-700",
  "bg-violet-700",
  "bg-rose-700",
  "bg-teal-700",
];

function hash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function Avatar({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const first = Array.from(name.trim())[0] ?? "؟";
  const bg = AVATAR_BG[hash(name.trim()) % AVATAR_BG.length];
  return (
    <span
      className={
        "grid shrink-0 select-none place-items-center rounded-full font-bold text-white " +
        bg +
        " " +
        className
      }
    >
      {first}
    </span>
  );
}