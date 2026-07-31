import { useEffect, useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import JoyrideMod, * as JoyrideNS from "react-joyride";
import { useAuth } from "@/hooks/useAuth";

// react-joyride v2 ships CJS typings — coerce to usable shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Joyride = (JoyrideMod as any) as React.ComponentType<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STATUS: { FINISHED: string; SKIPPED: string } = ((JoyrideNS as any).STATUS) ?? ((JoyrideMod as any).STATUS) ?? { FINISHED: "finished", SKIPPED: "skipped" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CallBackProps = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Step = any;

const STORAGE_KEY = "al-injaz-onboarding-seen-v3";

const steps: Step[] = [
  {
    target: "body",
    placement: "center",
    title: "أهلاً بك في الإنجاز 🎯",
    content:
      "منصة لتتبع ساعات دراستك والتنافس الإيجابي مع زملائك. خلّيني أوريك القسم خطوة خطوة.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="tabs"]',
    title: "أقسام المهام",
    content:
      "عندك ثلاث أقسام: يومي (ساعات/دقائق)، أسبوعي (أيام)، شهري (أسابيع). اختر القسم المناسب لهدفك.",
  },
  {
    target: '[data-tour="create-task"]',
    title: "إنشاء مهمة جديدة",
    content:
      "اكتب عنوان المهمة وحدد المدة، ثم اضغط إرسال. المهمة رح تبدأ تلقائياً والعداد رح يشتغل.",
  },
  {
    target: '[data-tour="task-tabs"]',
    title: "قيد الإنجاز ومنجزاتي",
    content:
      "هون بتشوف مهامك الحالية وتقدر توقفها أو تنهيها. ولما تخلصها بتنتقل لتبويب 'منجزاتي'.",
  },
  {
    target: '[data-tour="analytics"]',
    title: "تحليلاتي وإنجازاتي",
    content:
      "اضغط هون لتشوف ساعاتك الكلية، توزيع مهامك، وتقدمك مع الوقت.",
  },
  {
    target: '[data-tour="leaderboard"]',
    title: "قائمة المتصدرين",
    content:
      "ساعاتك بتنحسب تلقائياً وبتظهر هون مع باقي المشاركين. اضغط على أي اسم لتشوف تحليلاته.",
  },
  {
    target: '[data-tour="rounds"]',
    title: "الجولات 🎯",
    content:
      "قسم جديد للجلسات الجماعية بتقنية البومودورو. تقدر تنشئ جولة (لو عندك صلاحية) أو تنضم لجولة شغّالة، ولما تخلص بتنحسب لك دقائق الدراسة تلقائياً في إنجازك اليومي.",
  },
  {
    target: '[data-tour="support"]',
    title: "زر الدعم",
    content:
      "في أي مشكلة أو اقتراح، اضغط زر 'الدعم' وابعث رسالة مباشرة للإدارة.",
  },
  {
    target: "body",
    placement: "center",
    title: "تنبيه مهم ⚠️",
    content:
      "لو طلعت من الموقع وأنت في نص مهمة، المهمة رح تتوقف وتنحذف تلقائياً. ولو كنت داخل بجولة، رح تنطرد منها فوراً وما تتحسب لك. خلّيك بالصفحة لين تخلص.",
  },
  {
    target: "body",
    placement: "center",
    title: "قانون المنصة ⚠️",
    content:
      "ممنوع تضخيم الساعات أو الغش. الإدارة تراقب وتراجع، وأي تلاعب يؤدي لخصم الساعات أو حذف الحساب. كن صادقاً مع نفسك أولاً.",
  },
];

export const OnboardingDialog = () => {
  const { user, loading } = useAuth();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    // small delay so DOM targets exist
    const t = setTimeout(() => setRun(true), 600);
    return () => clearTimeout(t);
  }, [user, loading]);

  const handleCallback = (data: CallBackProps) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      localStorage.setItem(STORAGE_KEY, "1");
      setRun(false);
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showSkipButton
      showProgress
      disableScrolling={false}
      scrollToFirstStep
      callback={handleCallback}
      locale={{
        back: "السابق",
        close: "إغلاق",
        last: "ابدأ الآن 🚀",
        next: "التالي",
        skip: "تخطي",
        open: "افتح الجولة",
      }}
      styles={{
        options: {
          primaryColor: "hsl(var(--primary))",
          textColor: "hsl(var(--foreground))",
          backgroundColor: "hsl(var(--card))",
          arrowColor: "hsl(var(--card))",
          overlayColor: "rgba(0,0,0,0.55)",
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 12,
          fontFamily: "inherit",
          textAlign: "right",
          direction: "rtl",
        },
        tooltipTitle: { fontSize: 16, fontWeight: 700 },
        tooltipContent: { fontSize: 14, lineHeight: 1.7 },
        buttonNext: { borderRadius: 8 },
        buttonBack: { color: "hsl(var(--muted-foreground))" },
      }}
    />
  );
};
