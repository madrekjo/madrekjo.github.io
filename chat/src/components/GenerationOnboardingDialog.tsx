import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Stethoscope, HardHat, Languages, Briefcase, GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";

const FIELDS = [
  { key: "medical", label: "صحي", prefix: "Dr.", icon: Stethoscope, color: "text-red-500" },
  { key: "engineering", label: "هندسي", prefix: "Eng.", icon: HardHat, color: "text-amber-500" },
  { key: "languages", label: "لغات", prefix: "Lang.", icon: Languages, color: "text-emerald-500" },
  { key: "business", label: "أعمال", prefix: "Bus.", icon: Briefcase, color: "text-blue-500" },
];

const GenerationOnboardingDialog = () => {
  const { user, profile, refreshProfile, loading } = useAuth();
  const [step, setStep] = useState<"gen" | "field">("gen");
  const [gen, setGen] = useState<"09" | "10" | null>(null);
  const [saving, setSaving] = useState(false);

  const needsSetup = !!user && !loading && !!profile && !profile.generation;

  useEffect(() => {
    if (needsSetup) setStep("gen");
  }, [needsSetup]);

  if (!needsSetup) return null;

  const chooseGen = async (g: "09" | "10") => {
    setGen(g);
    if (g === "10") {
      // 2010 skips field selection
      await save(g, null);
    } else {
      setStep("field");
    }
  };

  const save = async (g: "09" | "10", field: string | null) => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ generation: g, field } as any)
      .eq("user_id", user.id);
    if (error) toast.error("فشل الحفظ، حاول مجدداً");
    else {
      toast.success("تم الحفظ");
      await refreshProfile();
    }
    setSaving(false);
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            {step === "gen" ? "أهلاً بك! اختر جيلك" : "اختر حقلك الدراسي"}
          </DialogTitle>
        </DialogHeader>

        {saving ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : step === "gen" ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground text-center">هذا الاختيار مهم لتنظيم الشات وتحديد هويتك في المنصة. يمكنك تعديله لاحقاً من البروفايل.</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => chooseGen("09")}
                className="rounded-xl border-2 border-primary/30 hover:border-primary hover:bg-primary/5 p-6 transition-all group"
              >
                <div className="text-4xl font-bold text-primary mb-1">2009</div>
                <div className="text-xs text-muted-foreground">جيل التوجيهي</div>
              </button>
              <button
                onClick={() => chooseGen("10")}
                className="rounded-xl border-2 border-primary/30 hover:border-primary hover:bg-primary/5 p-6 transition-all group"
              >
                <div className="text-4xl font-bold text-primary mb-1">2010</div>
                <div className="text-xs text-muted-foreground">جيل ما تحت</div>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground text-center">اختر التخصص الذي تنوي دراسته — سيظهر بجانب اسمك (مثل Dr. أحمد 09)</p>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <button
                  key={f.key}
                  onClick={() => save(gen!, f.key)}
                  className="rounded-xl border-2 border-primary/30 hover:border-primary hover:bg-primary/5 p-4 transition-all flex flex-col items-center gap-2"
                >
                  <f.icon className={`w-8 h-8 ${f.color}`} />
                  <div className="font-bold">{f.label}</div>
                  <div className="text-xs text-muted-foreground font-mono">{f.prefix}</div>
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setStep("gen")}>← الرجوع</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GenerationOnboardingDialog;
