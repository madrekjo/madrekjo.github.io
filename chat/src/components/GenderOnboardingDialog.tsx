import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

const GenderOnboardingDialog = () => {
  const { user, profile, refreshProfile, loading } = useAuth();
  const [saving, setSaving] = useState(false);

  const needsSetup = !!user && !loading && !!profile && !profile.gender;

  if (!needsSetup) return null;

  const chooseGender = async (gender: "male" | "female") => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ gender } as any)
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
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            اختر قناتك
          </DialogTitle>
        </DialogHeader>

        {saving ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground text-center">
              هذا الاختيار يحدد القناة التي ستظهر لك في الدردشة. لا يمكنك تغييره لاحقاً.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => chooseGender("male")}
                className="rounded-xl border-2 border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/5 p-6 transition-all group"
              >
                <div className="text-3xl mb-2">👦</div>
                <div className="font-bold text-lg">ذكور</div>
                <div className="text-xs text-muted-foreground">قناة الذكور</div>
              </button>
              <button
                onClick={() => chooseGender("female")}
                className="rounded-xl border-2 border-pink-500/30 hover:border-pink-500 hover:bg-pink-500/5 p-6 transition-all group"
              >
                <div className="text-3xl mb-2">👧</div>
                <div className="font-bold text-lg">إناث</div>
                <div className="text-xs text-muted-foreground">قناة الإناث</div>
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GenderOnboardingDialog;
