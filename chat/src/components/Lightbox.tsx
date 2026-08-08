import { useEffect } from "react";
import { X } from "lucide-react";

interface Props {
  src: string | null;
  type: "image" | "video";
  onClose: () => void;
}

const Lightbox = ({ src, type, onClose }: Props) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 left-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2"
        aria-label="إغلاق"
      >
        <X className="w-6 h-6" />
      </button>
      {type === "image" ? (
        <img src={src} alt="" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
      ) : (
        <video src={src} controls autoPlay className="max-w-full max-h-full" onClick={e => e.stopPropagation()} />
      )}
    </div>
  );
};

export default Lightbox;
