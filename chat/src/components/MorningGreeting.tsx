import { useState } from "react";
import { X, Sparkles } from "lucide-react";

/** تنبيه صباحي يُعرض لكل المستخدمين — مرة واحدة يومياً (نافذة 4 ص → 12 ظهراً). */
const LD_KEY = "mdk_morning_seen_";

function isMorningWindow(): boolean {
  const h = new Date().getHours();
  return h >= 4 && h < 12;
}

export default function MorningGreeting() {
  const today = new Date().toISOString().slice(0, 10);
  const [dismissed, setDismissed] = useState<boolean>(() => localStorage.getItem(LD_KEY + today) === "1");

  // وضع معاينة للمالك: يحفظنا نتايج حتى ولو مش وقت صباح.
  const debug = typeof window !== "undefined" && localStorage.getItem("mdk_morning_debug") === "1";

  if (dismissed) return null;
  if (!isMorningWindow() && !debug) return null;

  const dismiss = () => {
    localStorage.setItem(LD_KEY + today, "1");
    setDismissed(true);
  };

  return (
    <div className="fixed top-16 inset-x-0 z-40 px-3 pointer-events-none">
      <div className={`mx-auto max-w-lg pointer-events-auto ${localStorage.getItem("mdk_morning_debug") === "1" ? "border-2 border-dashed border-destructive" : ""}`}>
        <div className="rounded-2xl relative border bg-card shadow-xl overflow-hidden animate-in slide-in-from-top fade-in duration-500">
          <div className="h-1.5 bg-gradient-to-l from-emerald-500 via-teal-500 to-emerald-500" />
          <button
            onClick={dismiss}
            className="absolute top-2 left-2 rounded-full p-1 text-muted-foreground hover:bg-muted transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="p-4 text-sm space-y-3 text-foreground">
            <div className="text-center">
              <p className="font-semibold text-base">السلام عليكم ورحمة الله وبركاته 🌿</p>
              <p className="mt-1">صباح الخير يا أبطال 🌤️</p>
            </div>

            <div className="rounded-xl bg-muted p-3 space-y-1">
              <p className="text-xs text-muted-foreground">قال رسول الله ﷺ:</p>
              <p className="font-medium">
                "اللهم بك أصبحنا وبك أمسينا وبك نحيا وبك نموت وإليك النشور."
              </p>
            </div>

            <p className="leading-relaxed">
              اللهم إنا نسألك في هذا الصباح توفيقًا يفتح لنا الأبواب، وبركةً في الوقت، وقوةً على الطاعة،
              ونورًا في القلب، ونجاحًا في الدراسة، وأن تجعل هذا اليوم شاهدًا لنا لا علينا.
            </p>

            <div className="rounded-xl border bg-muted/50 p-3 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5 text-primary">
                <Sparkles className="w-3.5 h-3.5" /> نصائح بسيطة لبداية يوم قوية:
              </p>
              <ul className="list-disc pr-4 space-y-1 text-foreground/90">
                <li>صلِّ الفجر في وقته وابدأ يومك بذكر الله.</li>
                <li>اشرب كوبًا أو كوبين من الماء بعد الاستيقاظ.</li>
                <li>رتب سريرك وغرفتك خلال دقائق قليلة.</li>
                <li>حدد أهم 3 مهام تريد إنجازها اليوم.</li>
                <li>ابدأ بأصعب مادة أو أكثر مادة تؤجلها دائمًا.</li>
                <li>ابتعد عن التمرير العشوائي في أول ساعة من يومك.</li>
                <li>خصص جلسة دراسة مركزة قبل أن تزدحم عليك المهام.</li>
              </ul>
            </div>

            <p className="leading-relaxed text-foreground/90">
              تذكروا أن الإنجازات الكبيرة تُبنى من خطوات صغيرة تتكرر كل يوم.
            </p>

            <p className="text-center font-medium text-primary">
              نسأل الله أن يبارك في أوقاتكم، ويشرح صدوركم، ويوفقكم لما يحب ويرضى. 🤍
            </p>

            <button
              onClick={dismiss}
              className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 font-semibold hover:opacity-90 transition-opacity"
            >
              تمام، جزاكم الله خيرًا
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}