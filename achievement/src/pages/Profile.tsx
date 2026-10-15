import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { toast } from "sonner";
import { Loader2, Camera, Save, KeyRound, UserRound } from "lucide-react";

const Profile = () => {
  const { user, loading } = useAuth();
  const { profile, isLoading, updateProfile } = useProfile();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
    }
  }, [profile]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Only allow safe raster image types — block SVG/HTML to prevent stored XSS via public bucket.
    const allowed: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
    };
    const ext = allowed[file.type];
    if (!ext) {
      toast.error("صيغة غير مدعومة. استخدم JPG أو PNG أو GIF أو WEBP فقط");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الحجم الأقصى 5 ميغابايت");
      return;
    }

    setUploading(true);
    try {
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await achievementSupabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data } = achievementSupabase.storage.from("avatars").getPublicUrl(path);
      await updateProfile.mutateAsync({ avatar_url: `${data.publicUrl}?t=${Date.now()}` });
      toast.success("تم تحديث الصورة بنجاح");
    } catch {
      toast.error("حدث خطأ أثناء رفع الصورة");
    } finally {
      setUploading(false);
    }
  };


  const nameChangedAt = (profile as unknown as { display_name_updated_at?: string | null })?.display_name_updated_at ?? null;
  const nextAllowedAt = nameChangedAt ? new Date(new Date(nameChangedAt).getTime() + 30 * 24 * 60 * 60 * 1000) : null;
  const canChangeName = !nextAllowedAt || nextAllowedAt.getTime() <= Date.now();
  const nameUnchanged = displayName.trim() === (profile?.display_name ?? "").trim();

  const handleSaveName = async () => {
    try {
      await updateProfile.mutateAsync({ display_name: displayName.trim() });
      toast.success("تم تحديث الاسم بنجاح");
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "";
      if (msg.includes("display_name_change_too_soon")) {
        toast.error("يمكنك تغيير الاسم مرة واحدة كل 30 يوم فقط");
      } else {
        toast.error("حدث خطأ");
      }
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    try {
      const { error } = await achievementSupabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      toast.success("تم تغيير كلمة المرور بنجاح");
    } catch {
      toast.error("حدث خطأ أثناء تغيير كلمة المرور");
    }
  };

  if (loading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-lg py-8">
        <div className="mb-6 animate-fade-up">
          <p className="section-label">حسابك</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">الملف الشخصي</h1>
        </div>

        {/* Avatar */}
        <div className="mb-8 flex flex-col items-center">
          <div className="relative">
            <div className="rounded-full brand-gradient p-1 shadow-glow">
              <Avatar className="h-24 w-24 ring-4 ring-card">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary text-2xl text-primary-foreground">
                  {(profile?.display_name || "؟")[0]}
                </AvatarFallback>
              </Avatar>
            </div>
            <label className="absolute -bottom-1 -left-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-card transition-transform hover:scale-105 hover:bg-primary/90">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={uploading}
              />
            </label>
          </div>
          <p className="mt-3 text-base font-semibold text-foreground">
            {profile?.display_name?.trim() || "مستخدم"}
          </p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>

        {/* Name */}
        <div className="space-y-5">
          <div className="surface p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="icon-tile h-9 w-9"><UserRound className="h-4 w-4" /></span>
              <Label htmlFor="name" className="text-base font-semibold">الاسم</Label>
            </div>
            <div className="flex gap-2">
              <Input
                id="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={!canChangeName}
              />
              <Button
                onClick={handleSaveName}
                disabled={updateProfile.isPending || nameUnchanged || !canChangeName}
                className="gap-1.5"
              >
                <Save className="h-4 w-4" />
                حفظ
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {canChangeName
                ? "يمكنك تغيير الاسم مرة واحدة كل 30 يوم."
                : `يمكنك تغيير اسمك مجدداً بتاريخ ${nextAllowedAt!.toLocaleDateString("ar")}`}
            </p>
          </div>

          {/* Password */}
          <div className="surface p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="icon-tile h-9 w-9"><KeyRound className="h-4 w-4" /></span>
              <Label htmlFor="password" className="text-base font-semibold">تغيير كلمة المرور</Label>
            </div>
            <div className="flex gap-2">
              <Input
                id="password"
                type="password"
                placeholder="كلمة المرور الجديدة"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button onClick={handleChangePassword} variant="secondary" className="gap-1.5">
                <KeyRound className="h-4 w-4" />
                تغيير
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;
