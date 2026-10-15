import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  Clock,
  Users,
  Target,
  ArrowLeft,
  Sparkles,
  BarChart3,
  Timer,
  CheckCircle2,
  Rocket,
} from "lucide-react";
import { useEffect } from "react";

const featureDelays = ["animate-delay-100", "animate-delay-200", "animate-delay-300", "animate-delay-400"];

const features = [
  {
    icon: Clock,
    title: "تتبّع الوقت",
    description: "حدّد مهامك الدراسية مع المدة الزمنية وتابع تقدمك يومياً وأسبوعياً وشهرياً.",
  },
  {
    icon: Target,
    title: "أنجز أهدافك",
    description: "سجّل إنجازاتك وابنِ عادات دراسية قوية خطوة بخطوة.",
  },
  {
    icon: Users,
    title: "تنافس مع زملائك",
    description: "شاهد قائمة المتصدرين وتحفّز من إنجازات الآخرين.",
  },
  {
    icon: BarChart3,
    title: "احصد النتائج",
    description: "تابع إحصائياتك وشاهد تطوّرك مع مرور الوقت.",
  },
];

const steps = [
  {
    icon: Timer,
    title: "أنشئ مهمة",
    description: "اختر القسم والمدة، أو شغّل عدّاد التوقيف وابدأ دراستك فوراً.",
  },
  {
    icon: CheckCircle2,
    title: "أنجزها بصدق",
    description: "أنهِ المهمة عند انتهاء وقتها وسجّل إنجازك في منجزاتك.",
  },
  {
    icon: Trophy,
    title: "تصدّر القائمة",
    description: "ساعاتك تُحتسب تلقائياً وتنافس زملاءك على قائمة المتصدرين.",
  },
];

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user && !loading) navigate("/dashboard");
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-10 right-1/4 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
        </div>

        <div className="container flex flex-col items-center py-16 text-center sm:py-24">
          <div className="animate-fade-up">
            <span className="chip border-primary/20 bg-primary/5 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              منصة تعليمية لتتبّع الإنجاز والتنافس الإيجابي
            </span>
          </div>

          <div className="mt-6 flex h-20 w-20 animate-fade-up animate-delay-100 items-center justify-center rounded-3xl brand-gradient text-primary-foreground shadow-glow animate-pulse-glow">
            <Trophy className="h-10 w-10" />
          </div>

          <h1 className="mt-6 max-w-3xl animate-fade-up animate-delay-200 text-4xl font-bold leading-tight text-foreground sm:text-6xl">
            منصة <span className="text-gradient">الإنجاز</span>
          </h1>

          <p className="mt-5 max-w-2xl animate-fade-up animate-delay-300 text-lg leading-relaxed text-muted-foreground">
            منصة تعاونية مخصّصة لتتبّع إنجازات الطلاب الدراسية. حدّد مهامك، تابع وقتك،
            وتنافس مع زملائك لتحقيق أفضل النتائج.
          </p>

          <div className="mt-8 flex animate-fade-up animate-delay-400 flex-col gap-3 sm:flex-row">
            <Button size="lg" className="gap-2 px-8" onClick={() => navigate("/login")}>
              <Rocket className="h-5 w-5" />
              ابدأ الآن
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="gap-2 px-8"
              onClick={() => navigate("/login")}
            >
              تسجيل الدخول
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>

          {/* Mini stats */}
          <div className="mt-12 grid w-full max-w-2xl animate-fade-up animate-delay-400 grid-cols-3 gap-3">
            {[
              { value: "٣ أقسام", label: "يومي · أسبوعي · شهري" },
              { value: "جولات", label: "جلسات دراسة جماعية" },
              { value: "متصدرون", label: "تنافس شفّاف وعادل" },
            ].map((s) => (
              <div key={s.label} className="surface px-3 py-4 text-center">
                <p className="text-base font-bold text-primary sm:text-lg">{s.value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container pb-16">
        <div className="mb-8 text-center">
          <p className="section-label">لماذا الإنجاز؟</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
            كل ما تحتاجه لدراسة منظّمة
          </h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className={`surface surface-hover group p-6 animate-fade-up ${featureDelays[i]}`}
            >
              <div className="icon-tile mb-4 transition-colors group-hover:bg-primary/15">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Steps */}
      <section className="container pb-16">
        <div className="surface overflow-hidden p-6 sm:p-10">
          <div className="mb-8 text-center">
            <p className="section-label">كيف تبدأ؟</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
              ثلاث خطوات فقط
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.title} className="relative text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                  <step.icon className="h-6 w-6" />
                </div>
                <span className="mb-2 inline-block text-xs font-bold text-primary">
                  الخطوة {i + 1}
                </span>
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-16">
        <div className="brand-gradient relative overflow-hidden rounded-3xl px-6 py-12 text-center text-primary-foreground shadow-lift">
          <div className="pointer-events-none absolute -top-16 -left-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -right-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <h2 className="text-2xl font-bold sm:text-3xl">جاهز تبدأ رحلتك؟</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
            سجّل دخولك، أنشئ أول مهمة، وشاهد إنجازك يكبر يوماً بعد يوم.
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="mt-6 gap-2 bg-white/95 px-8 text-primary hover:bg-white"
            onClick={() => navigate("/login")}
          >
            <Rocket className="h-5 w-5" />
            ابدأ الآن مجاناً
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        منصة الإنجاز — حيث يبدأ التفوق
      </footer>
    </div>
  );
};

export default Index;
