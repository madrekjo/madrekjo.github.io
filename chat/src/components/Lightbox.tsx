import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  src: string | null;
  images?: string[];
  initialIndex?: number;
  type: "image" | "video";
  onClose: () => void;
}

const Lightbox = ({ src, images, initialIndex = 0, type, onClose }: Props) => {
  const gallery = images && images.length > 1 ? images : null;
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => {
    setIdx(initialIndex);
  }, [initialIndex]);

  const next = useCallback(() => {
    if (!gallery) return;
    setIdx(i => (i + 1) % gallery.length);
  }, [gallery]);

  const prev = useCallback(() => {
    if (!gallery) return;
    setIdx(i => (i - 1 + gallery.length) % gallery.length);
  }, [gallery]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, next, prev]);

  if (!src) return null;

  const currentSrc = gallery ? gallery[idx] : src;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 left-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 z-10"
        aria-label="إغلاق"
      >
        <X className="w-6 h-6" />
      </button>

      {gallery && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/25 rounded-full p-2 z-10"
            aria-label="السابق"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/25 rounded-full p-2 z-10"
            aria-label="التالي"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {type === "image" ? (
        <img key={currentSrc} src={currentSrc} alt="" className="max-w-full max-h-full object-contain animate-fade-in" onClick={e => e.stopPropagation()} />
      ) : (
        <video key={currentSrc} src={currentSrc} controls autoPlay className="max-w-full max-h-full" onClick={e => e.stopPropagation()} />
      )}

      {gallery && gallery.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <span className="text-white/60 text-sm tabular-nums">{idx + 1} / {gallery.length}</span>
          <div className="flex gap-1">
            {gallery.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={`w-2 h-2 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/30 hover:bg-white/50"}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Lightbox;
