import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Camera, Save, FileText, Users as UsersIcon, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { compressImage } from "@/lib/mediaCompression";
import { FIELD_LABEL_AR, FIELD_PREFIX, formatDisplayName } from "@/lib/displayName";

const Profile = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [myRounds, setMyRounds] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: posts } = await supabase
        .from("posts").select("id, content, image_url, created_at, deleted_at")
        .eq("user_id", user.id).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(50);
      setMyPosts(posts || []);

      const { data: owned } = await (supabase as any)
        .from("study_rounds").select("id, title, status, created_at, user_id")
        .eq("user_id", user.id);
      const { data: parts } = await (supabase as any)
        .from("round_participants").select("round_id").eq("user_id", user.id);
      const partIds = (parts || []).map((p: any) => p.round_id);
      let joined: any[] = [];
      if (partIds.length) {
        const { data } = await (supabase as any)
          .from("study_rounds").select("id, title, status, created_at, user_id").in("id", partIds);
        joined = data || [];
      }
      const allMap = new Map<string, any>();
      [...(owned || []), ...joined].forEach((r: any) => allMap.set(r.id, r));
      setMyRounds(Array.from(allMap.values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
    })();
  }, [user?.id]);

  const canChangeName = () => {
    if (!profile?.name_changed_at) return true;
    const lastChange = new Date(profile.name_changed_at);
    const now = new Date();
    const diffDays = (now.getTime() - lastChange.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 30;
  };

  const handleUpdateName = async () => {
    if (!user) return;
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 3) {
      toast.error("الاسم يجب أن يكون من 3 مقاطع على الأقل");
      return;
    }
    if (!canChangeName()) {
      toast.error("لا يمكنك تغيير اسمك إلا مرة واحدة كل شهر");
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), name_changed_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (error) toast.error("فشل تحديث الاسم");
    else {
      toast.success("تم تحديث الاسم");
      await refreshProfile();
    }
    setLoading(false);
  };

  const handleUpdatePassword = async () => {
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error("فشل تحديث كلمة المرور");
    else {
      toast.success("تم تحديث كلمة المرور");
      setPassword("");
    }
    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    if (!original || !user) return;
    setLoading(true);

    const file = await compressImage(original, { maxWidth: 512, maxHeight: 512, quality: 0.85 });
    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error("فشل رفع الصورة");
      setLoading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: urlData.publicUrl })
      .eq("user_id", user.id);

    if (error) toast.error("فشل تحديث الصورة");
    else {
      toast.success("تم تحديث الصورة");
      await refreshProfile();
    }
    setLoading(false);
  };

  if (!user || !profile) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <Card className="animate-fade-in">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">الملف الشخصي</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar className="w-24 h-24">
                <AvatarImage src={profile.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                  {profile.full_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 left-0 bg-primary text-primary-foreground rounded-full p-1.5"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label>البريد الإلكتروني</Label>
            <Input value={user.email || ""} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">لا يمكن تغيير البريد الإلكتروني</p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label>الاسم الكامل</Label>
            <Input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="الاسم من 3 مقاطع"
            />
            {!canChangeName() && (
              <p className="text-xs text-destructive">يمكنك تغيير اسمك بعد مرور شهر من آخر تغيير</p>
            )}
            <Button onClick={handleUpdateName} disabled={loading || !canChangeName()} size="sm" className="gap-1">
              <Save className="w-4 h-4" />
              حفظ الاسم
            </Button>
          </div>

          {/* Generation & Field */}
          <div className="space-y-2">
            <Label>الجيل والتخصص</Label>
            <p className="text-xs text-muted-foreground">اسمك سيظهر: <b>{formatDisplayName(profile)}</b></p>
            <div className="flex gap-2">
              {(["09","10"] as const).map(g => (
                <Button key={g} type="button" size="sm" variant={profile.generation === g ? "default" : "outline"}
                  onClick={async () => {
                    if (!user) return;
                    const patch: any = { generation: g };
                    if (g === "10") patch.field = null;
                    await supabase.from("profiles").update(patch).eq("user_id", user.id);
                    await refreshProfile();
                    toast.success("تم الحفظ");
                  }}
                >جيل {g}</Button>
              ))}
            </div>
            {profile.generation === "09" && (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FIELD_LABEL_AR).map(([k, l]) => (
                  <Button key={k} type="button" size="sm" variant={profile.field === k ? "default" : "outline"}
                    onClick={async () => {
                      if (!user) return;
                      await supabase.from("profiles").update({ field: k } as any).eq("user_id", user.id);
                      await refreshProfile();
                      toast.success("تم الحفظ");
                    }}
                  >{l} <span className="text-xs opacity-70 ml-1">{FIELD_PREFIX[k]}</span></Button>
                ))}
              </div>
            )}
          </div>

          {/* Gender (read-only) */}
          <div className="space-y-2">
            <Label>القناة</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {profile.gender === "male" ? "👦 ذكور" : profile.gender === "female" ? "👧 إناث" : "غير محدد"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">لا يمكنك تغيير القناة من هنا. تواصل مع الإدارة إذا كنت بحاجة للتعديل.</p>
          </div>


          {/* Password */}
          <div className="space-y-2">
            <Label>كلمة مرور جديدة</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="كلمة المرور الجديدة"
            />
            <Button onClick={handleUpdatePassword} disabled={loading} size="sm" variant="outline" className="gap-1">
              <Save className="w-4 h-4" />
              تحديث كلمة المرور
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-lg">نشاطي</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="posts">
            <TabsList className="grid grid-cols-2 mb-3">
              <TabsTrigger value="posts" className="gap-1"><FileText className="w-4 h-4" /> منشوراتي ({myPosts.length})</TabsTrigger>
              <TabsTrigger value="rounds" className="gap-1"><UsersIcon className="w-4 h-4" /> جولاتي ({myRounds.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="posts">
              {myPosts.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">لا توجد منشورات</p> : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {myPosts.map(p => (
                    <div key={p.id} className="border rounded-lg p-3 text-sm">
                      <p className="whitespace-pre-wrap line-clamp-3">{p.content}</p>
                      {p.image_url && <img src={p.image_url} className="rounded mt-2 max-h-32" alt="" />}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: ar })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="rounds">
              {myRounds.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">لا توجد جولات</p> : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {myRounds.map(r => (
                    <div key={r.id} className="border rounded-lg p-3 text-sm flex items-center justify-between">
                      <div>
                        <p className="font-medium">{r.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ar })}
                          {r.user_id === user?.id && <span className="text-primary">• مالك</span>}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === "active" ? "bg-primary/15 text-primary" :
                        r.status === "completed" ? "bg-green-500/15 text-green-600" : "bg-muted"
                      }`}>
                        {r.status === "active" ? "نشطة" : r.status === "completed" ? "منجزة" : "بانتظار"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Profile;
