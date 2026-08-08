import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Trophy, Clock, Users, Target, ArrowLeft } from "lucide-react";
import { useEffect } from "react";

const features = [
  {
    icon: Clock,
    title: "تتبع الوقت",
    description: "حدد مهامك الدراسية مع المدة الزمنية وتابع تقدمك يومياً وأسبوعياً وشهرياً",
  },
  {
    icon: Target,
    title: "أنجز أهدافك",
    description: "سجّل إنجازاتك وابنِ عادات دراسية قوية خطوة بخطوة",
  },
  {
    icon: Users,
    title: "تنافس مع زملائك",
    description: "شاهد قائمة المتصدرين وتحفّز من إنجازات الآخرين",
  },
  {
    icon: Trophy,
    title: "احصد النتائج",
    description: "تابع إحصائياتك وشاهد تطورك مع مرور الوقت",
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
      <section className="container py-20 text-center">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 animate-pulse-glow">
            <Trophy className="h-11 w-11 text-primary" />
          </div>
          <h1 className="text-4xl font-bold leading-tight text-foreground sm:text-5xl">
            منصة <span className="text-primary">الإنجاز</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            منصة تعاونية مخصصة لتتبع إنجازات الطلاب الدراسية. حدد مهامك، تابع وقتك، وتنافس مع زملائك لتحقيق أفضل النتائج.
          </p>
          <Button
            size="lg"
            className="gap-2 px-8 py-6 text-base"
            onClick={() => navigate("/login")}
          >
            ابدأ الآن
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="container pb-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border bg-card p-6 text-center transition-all hover:border-primary/30 hover:shadow-lg"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                <feature.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        منصة الإنجاز — حيث يبدأ التفوق
      </footer>
    </div>
  );
};

export default Index;
