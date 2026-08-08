import { useEffect, useState, useLayoutEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate, useLocation } from "react-router-dom";

const TOUR_KEY = "onboarding_v2_done";
const RULES_KEY = "onboarding_rules_v1_done";

interface Step {
  selector?: string;
  title: string;
  body: string;
  route?: string;
}

const steps: Step[] = [
  { title: "أهلاً بك في دردشة جو 👋", body: "هذه جولة سريعة على عناصر المنصة. سنُظلّل كل قسم ونشرحه لك." },
  { selector: "[data-tour='chat']", title: "💬 الدردشة العامة", body: "هنا تنشر أفكارك وتسأل وتتفاعل بالإعجاب والتعليقات. تقدر تخفيها من زر الإخفاء فوق." },
  { selector: "[data-tour='rounds']", title: "👥 الجولات الدراسية", body: "أنشئ جولة بمدة وبريك، شارك الأصدقاء، وفي البريك يفتح شات داخل الجولة." },
  { selector: "[data-tour='schedules']", title: "📅 الجداول", body: "ارفع جدولك أو شاهد جداول الباقي وعلّق عليها." },
  { selector: "[data-tour='changes']", title: "✨ التغيير", body: "قسمان: شو المنصة غيرت فيك، وتحفيز للجميع." },
  { selector: "[data-tour='suggestions']", title: "💡 الاقتراحات", body: "اقترح أي تحسين على المنصة." },
  { selector: "[data-tour='support']", title: "📞 الدعم", body: "تواصل مع الإدارة لأي مشكلة." },
  { selector: "[data-tour='notifications']", title: "🛎️ الإشعارات", body: "تابع التفاعلات على منشوراتك من جرس الإشعارات." },
  { selector: "[data-tour='profile']", title: "👤 ملفك الشخصي", body: "غيّر صورتك، اسمك، كلمة مرورك، وشاهد منشوراتك وجولاتك." },
  { title: "🚀 يلا نبدأ!", body: "أنت جاهز الآن. بالتوفيق!" },
];

const chatRules = `قوانين قسم الشات:

• يُمنع منعًا باتًا استخدام الشات للأحاديث الجانبية.
• الشات للأسئلة والاستفسارات الدراسية فقط.
• يُمنع افتعال المشاكل أو النقاشات الاستفزازية.
• يجب احترام جميع الأعضاء والمشرفين.
• يُمنع نشر محتوى غير مناسب أو روابط عشوائية.
• يمنع إرسال الرسائل المتكررة (Spam).
• يُمنع انتحال شخصية أي عضو أو مشرف.
• أي مخالفة قد تؤدي إلى تحذير، تايم اوت، أو حظر.

قوانين قسم الجولات:

• الالتزام بوقت الجولة وعدم تعطيلها.
• يمنع الغش بأي طريقة داخل الجولات.
• البريك للنقاشات الخفيفة باحترام فقط.
• العودة فوراً للجولة بعد البريك.

دخولك للمنصة يعني موافقتك على هذه القوانين.`;

const Onboarding = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Mark tour as done (disabled to avoid blocking UI). Only show rules once.
    if (!localStorage.getItem(TOUR_KEY)) localStorage.setItem(TOUR_KEY, "1");
    if (!localStorage.getItem(RULES_KEY)) setShowRules(true);
  }, [user]);


  useLayoutEffect(() => {
    if (!active) return;
    const step = steps[idx];
    if (!step?.selector) { setRect(null); return; }
    const updateRect = () => {
      const el = document.querySelector(step.selector!) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(() => setRect(el.getBoundingClientRect()), 150);
      } else setRect(null);
    };
    updateRect();
    const t = setInterval(updateRect, 400);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => { clearInterval(t); window.removeEventListener("resize", updateRect); window.removeEventListener("scroll", updateRect, true); };
  }, [idx, active]);

  const finish = () => {
    localStorage.setItem(TOUR_KEY, "1");
    setActive(false);
    setRect(null);
    if (!localStorage.getItem(RULES_KEY)) setShowRules(true);
  };

  const acceptRules = () => {
    localStorage.setItem(RULES_KEY, "1");
    setShowRules(false);
  };

  if (!active) {
    return (
      <Dialog open={showRules} onOpenChange={(o) => { if (!o) acceptRules(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>📜 قوانين المنصة</DialogTitle></DialogHeader>
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{chatRules}</pre>
          <DialogFooter>
            <Button onClick={acceptRules}>موافق وألتزم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const step = steps[idx];
  const last = idx === steps.length - 1;

  // Build spotlight overlay using clip-path
  const pad = 8;
  const hole = rect ? {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  } : null;

  // Tooltip position
  let tipStyle: React.CSSProperties = { position: "fixed", maxWidth: 320, zIndex: 10001 };
  if (hole) {
    const below = hole.top + hole.height + 12;
    const above = hole.top - 12 - 200;
    if (below + 200 < window.innerHeight) {
      tipStyle.top = below;
    } else if (above > 8) {
      tipStyle.top = above;
    } else {
      tipStyle.top = window.innerHeight / 2 - 100;
    }
    tipStyle.left = Math.max(8, Math.min(window.innerWidth - 332, hole.left));
  } else {
    tipStyle.top = "50%";
    tipStyle.left = "50%";
    tipStyle.transform = "translate(-50%, -50%)";
  }

  return (
    <>
      {/* Backdrop with hole */}
      <div className="fixed inset-0 z-[10000] pointer-events-auto" onClick={(e) => e.stopPropagation()}>
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <mask id="hole-mask">
              <rect width="100%" height="100%" fill="white" />
              {hole && (
                <rect
                  x={hole.left} y={hole.top}
                  width={hole.width} height={hole.height}
                  rx="8" ry="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#hole-mask)" />
          {hole && (
            <rect
              x={hole.left} y={hole.top}
              width={hole.width} height={hole.height}
              rx="8" ry="8"
              fill="none" stroke="hsl(var(--primary))" strokeWidth="2"
              className="animate-pulse"
            />
          )}
        </svg>
      </div>

      <div style={tipStyle} className="bg-card border-2 border-primary rounded-xl p-4 shadow-2xl">
        <h3 className="font-bold mb-2">{step.title}</h3>
        <p className="text-sm text-muted-foreground mb-3">{step.body}</p>
        <div className="flex justify-center gap-1 mb-3">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`} />
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          {idx > 0 && <Button size="sm" variant="ghost" onClick={() => setIdx(i => i - 1)}>السابق</Button>}
          <Button size="sm" variant="ghost" onClick={finish}>تخطي</Button>
          <Button size="sm" onClick={() => last ? finish() : setIdx(i => i + 1)}>{last ? "إنهاء" : "التالي"}</Button>
        </div>
      </div>
    </>
  );
};

export default Onboarding;
