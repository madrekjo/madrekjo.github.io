const PALETTES = [
  "linear-gradient(135deg,#c9a227,#a67c00)",
  "linear-gradient(135deg,#0ea2b0,#0b6e77)",
  "linear-gradient(135deg,#7c3aed,#4c1d95)",
  "linear-gradient(135deg,#e11d48,#881337)",
  "linear-gradient(135deg,#059669,#064e3b)",
];

function pick(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % PALETTES.length;
}

export default function Avatar({
  name,
  url,
  className = "size-14 text-2xl",
}: {
  name: string;
  url?: string;
  className?: string;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={className + " shrink-0 rounded-full object-cover"}
      />
    );
  }
  const initial = (name.trim().charAt(0) || "ق").toUpperCase();
  return (
    <div
      className={
        className +
        " grid shrink-0 place-items-center rounded-full font-extrabold text-white shadow-sm"
      }
      style={{ background: PALETTES[pick(name || "q")] }}
    >
      {initial}
    </div>
  );
}