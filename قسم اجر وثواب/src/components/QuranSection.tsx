import { quranPages, reciters, buildAyahAudioUrl, buildSurahAudioUrl } from "@/data/quranPages";
import { BookOpen, Play, Pause, SkipForward, SkipBack, Loader2, Menu } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface QuranSectionProps {
  dayIndex: number;
}

interface AyahData {
  number: number; // ayah number in surah
  text: string;
}

const RECITER_STORAGE_KEY = "preferred_reciter";

const QuranSection = ({ dayIndex }: QuranSectionProps) => {
  const currentPageIndex = dayIndex % quranPages.length;
  const [viewedPageIndex, setViewedPageIndex] = useState(currentPageIndex);
  const page = quranPages[viewedPageIndex];
  const [menuOpen, setMenuOpen] = useState(false);

  // Sync to today's page when day changes
  useEffect(() => {
    setViewedPageIndex(currentPageIndex);
  }, [currentPageIndex]);

  const [ayat, setAyat] = useState<AyahData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reciterId, setReciterId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(RECITER_STORAGE_KEY) || "afasy";
    }
    return "afasy";
  });

  const reciter = useMemo(
    () => reciters.find((r) => r.id === reciterId) ?? reciters[0],
    [reciterId]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAyahIdx, setCurrentAyahIdx] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isFullSurah = reciter.source === "mp3quran";

  const getAyahSrc = (ayahNumber: number) =>
    buildAyahAudioUrl(reciter.path, page.surahNumber, ayahNumber);
  const getSurahSrc = () => buildSurahAudioUrl(reciter.path, page.surahNumber);

  // Persist reciter choice
  useEffect(() => {
    localStorage.setItem(RECITER_STORAGE_KEY, reciterId);
    if (audioRef.current) {
      const wasPlaying = !audioRef.current.paused;
      if (isFullSurah) {
        audioRef.current.src = getSurahSrc();
      } else {
        const currentAyah = ayat[currentAyahIdx];
        if (currentAyah) {
          audioRef.current.src = getAyahSrc(currentAyah.number);
        }
      }
      if (wasPlaying) audioRef.current.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciterId]);

  // Fetch full verse text from api.alquran.cloud — guarantees complete, unabridged verses
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAyat([]);
    setCurrentAyahIdx(0);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }

    const fetchWithRetry = async (url: string, retries = 3): Promise<any> => {
      for (let i = 0; i < retries; i++) {
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return await r.json();
        } catch (e) {
          if (i === retries - 1) throw e;
          await new Promise((res) => setTimeout(res, 500 * (i + 1)));
        }
      }
    };

    const fetchAyat = async () => {
      // Try primary API first; fall back to alternative if it fails
      const sources = [
        `https://api.alquran.cloud/v1/surah/${page.surahNumber}/quran-uthmani`,
        `https://api.alquran.cloud/v1/surah/${page.surahNumber}`,
      ];
      for (const url of sources) {
        try {
          const json = await fetchWithRetry(url);
          const all = json?.data?.ayahs ?? [];
          const slice: AyahData[] = [];
          for (let n = page.startAyah; n <= page.endAyah; n++) {
            const a = all.find((x: any) => x.numberInSurah === n);
            if (a?.text) slice.push({ number: n, text: a.text });
          }
          if (!cancelled && slice.length > 0) {
            setAyat(slice);
            setLoading(false);
            return;
          }
        } catch {
          // try next source
        }
      }
      if (!cancelled) {
        setError("تعذر تحميل الآيات. تحقق من الاتصال بالإنترنت.");
        setLoading(false);
      }
    };

    fetchAyat();
    return () => {
      cancelled = true;
    };
  }, [page.surahNumber, page.startAyah, page.endAyah]);

  // Initialize / cleanup audio element
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleEnded = () => {
      if (isFullSurah) {
        setIsPlaying(false);
        return;
      }
      setCurrentAyahIdx((prev) => {
        const next = prev + 1;
        if (next < ayat.length) {
          const nextAyah = ayat[next];
          audio.src = getAyahSrc(nextAyah.number);
          audio.play().catch(() => {});
          return next;
        } else {
          setIsPlaying(false);
          return 0;
        }
      });
    };

    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ayat, reciter.path, page.surahNumber, isFullSurah]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (!isFullSurah && ayat.length === 0) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (!audioRef.current.src || audioRef.current.ended) {
        audioRef.current.src = isFullSurah
          ? getSurahSrc()
          : getAyahSrc(ayat[currentAyahIdx].number);
      }
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleNext = () => {
    if (!audioRef.current || ayat.length === 0 || isFullSurah) return;
    const next = Math.min(currentAyahIdx + 1, ayat.length - 1);
    setCurrentAyahIdx(next);
    audioRef.current.src = getAyahSrc(ayat[next].number);
    if (isPlaying) audioRef.current.play().catch(() => {});
  };

  const handlePrev = () => {
    if (!audioRef.current || ayat.length === 0 || isFullSurah) return;
    const prev = Math.max(currentAyahIdx - 1, 0);
    setCurrentAyahIdx(prev);
    audioRef.current.src = getAyahSrc(ayat[prev].number);
    if (isPlaying) audioRef.current.play().catch(() => {});
  };

  // List of pages available in the menu: from day 1 up to today
  const availablePages = quranPages.slice(0, Math.min(dayIndex + 1, quranPages.length));

  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-sm relative">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary rounded-full p-2">
            <BookOpen className="h-5 w-5 text-gold" />
          </div>
          <h2 className="font-amiri text-2xl font-bold text-foreground">📖 القرآن الكريم</h2>
        </div>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="الصفحات السابقة"
              className="text-foreground"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="font-amiri text-xl text-right">الصفحات السابقة</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-2">
              {availablePages.map((p, idx) => (
                <button
                  key={p.page}
                  onClick={() => {
                    setViewedPageIndex(idx);
                    setMenuOpen(false);
                  }}
                  className={`w-full text-right p-3 rounded-lg border transition-colors ${
                    idx === viewedPageIndex
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card hover:bg-muted border-border"
                  }`}
                >
                  <div className="font-amiri text-lg font-bold">
                    اليوم {idx + 1} — صفحة {p.page}
                  </div>
                  <div className="text-sm opacity-80">
                    سورة {p.surahName} (آية {p.startAyah} - {p.endAyah})
                  </div>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="bg-muted rounded-lg p-2 mb-3 text-center">
        <span className="text-sm text-muted-foreground">
          الصفحة {page.page} — سورة {page.surahName} (آية {page.startAyah} - {page.endAyah})
          {viewedPageIndex !== currentPageIndex && (
            <button
              onClick={() => setViewedPageIndex(currentPageIndex)}
              className="mr-2 text-primary underline"
            >
              العودة لصفحة اليوم
            </button>
          )}
        </span>
      </div>

      {/* Audio player controls */}
      <div className="bg-muted/50 rounded-lg p-3 mb-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <Select value={reciterId} onValueChange={setReciterId}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="اختر القارئ" />
          </SelectTrigger>
          <SelectContent>
            {reciters.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button
            onClick={handlePlayPause}
            disabled={loading || ayat.length === 0}
            size="sm"
            className="flex-1 sm:flex-none"
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4 ml-1" /> إيقاف
              </>
            ) : (
              <>
                <Play className="h-4 w-4 ml-1" /> استماع
              </>
            )}
          </Button>
          <Button
            onClick={handlePrev}
            disabled={loading || ayat.length === 0 || currentAyahIdx === 0 || isFullSurah}
            size="sm"
            variant="outline"
            aria-label="الآية السابقة"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleNext}
            disabled={loading || ayat.length === 0 || currentAyahIdx >= ayat.length - 1 || isFullSurah}
            size="sm"
            variant="outline"
            aria-label="الآية التالية"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isFullSurah && (
        <div className="text-xs text-center text-muted-foreground mb-2">
          ℹ️ هذا القارئ يشغّل السورة كاملة (لا يدعم تشغيل آية بآية)
        </div>
      )}

      {!isFullSurah && isPlaying && ayat[currentAyahIdx] && (
        <div className="text-xs text-center text-muted-foreground mb-2">
          🎧 الآن: آية {ayat[currentAyahIdx].number}
        </div>
      )}

      <div className="bg-background rounded-lg p-6 border border-border overflow-visible">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ml-2" />
            جاري تحميل الآيات...
          </div>
        ) : error ? (
          <p className="text-center text-destructive">{error}</p>
        ) : (
          <div className="font-amiri text-xl leading-[2.4] text-foreground text-right whitespace-normal break-words">
            {ayat.map((a, i) => (
              <span
                key={a.number}
                className={
                  !isFullSurah && isPlaying && i === currentAyahIdx
                    ? "bg-primary/20 rounded px-1"
                    : ""
                }
              >
                {a.text}{" "}
                <span className="text-gold">﴿{toArabicNumeral(a.number)}﴾</span>{" "}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const toArabicNumeral = (n: number): string => {
  const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return String(n)
    .split("")
    .map((d) => map[parseInt(d, 10)] ?? d)
    .join("");
};

export default QuranSection;
