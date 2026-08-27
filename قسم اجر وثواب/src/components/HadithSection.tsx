import { hadiths } from "@/data/hadiths";
import { Star } from "lucide-react";
import { useState } from "react";

interface HadithSectionProps {
  dayIndex: number;
}

const HadithSection = ({ dayIndex }: HadithSectionProps) => {
  const hadithIndex = dayIndex % hadiths.length;
  const hadith = hadiths[hadithIndex];
  const [showTafsir, setShowTafsir] = useState(false);

  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-accent rounded-full p-2">
          <Star className="h-5 w-5 text-secondary" />
        </div>
        <h2 className="font-amiri text-2xl font-bold text-foreground">📿 الحديث الشريف</h2>
      </div>

      <div className="bg-muted rounded-lg p-2 mb-3 text-center">
        <span className="text-sm text-muted-foreground">
          حديث اليوم رقم {hadithIndex + 1} من {hadiths.length}
        </span>
      </div>

      <div className="bg-background rounded-lg p-6 border border-border">
        <p className="font-amiri text-xl leading-[2] text-foreground text-center mb-4">
          قال رسول الله ﷺ: «{hadith.text}»
        </p>
        <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground mb-4">
          <span>الراوي: {hadith.narrator}</span>
          <span>المصدر: {hadith.source}</span>
        </div>

        <button
          onClick={() => setShowTafsir((s) => !s)}
          className="w-full text-sm text-primary hover:underline mb-2"
        >
          {showTafsir ? "▲ إخفاء شرح الشيخ ابن باز" : "▼ عرض شرح الشيخ ابن باز رحمه الله"}
        </button>

        {showTafsir && (
          <div className="mt-3 p-4 bg-muted/40 rounded-lg border-r-4 border-primary">
            <h3 className="font-amiri text-lg font-bold text-foreground mb-2">
              📖 قال الشيخ عبدالعزيز ابن باز رحمه الله:
            </h3>
            <p className="font-amiri text-base leading-[1.9] text-foreground text-right">
              {hadith.explanation}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HadithSection;
