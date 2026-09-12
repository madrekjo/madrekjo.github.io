import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Users, ListOrdered, Settings, Lock, UserRound } from "lucide-react";
import { TeachersTab } from "./admin/TeachersTab";
import { RefsTab } from "./admin/RefsTab";
import { SettingsTab } from "./admin/SettingsTab";
import { AdminProfilesTab } from "./admin/AdminProfilesTab";
import {
  getAdminProfile,
  saveAdminProfile,
  touchAdminProfile,
  getOrCreateDeviceId,
  type AdminProfile,
} from "@/lib/teacher-files";

function Admin() {
  const { isAdmin, adminChecked, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      return sessionStorage.getItem("madrekjo_tf_admin_tab") || "teachers";
    } catch {
      return "teachers";
    }
  });

  const [profile, setProfile] = useState<AdminProfile | null | undefined>(undefined);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    if (!isAdmin || !adminChecked) return;
    let active = true;
    setProfile(undefined);
    (async () => {
      try {
        const deviceId = getOrCreateDeviceId();
        const p = await getAdminProfile(deviceId);
        if (!active) return;
        setProfile(p);
        if (p) touchAdminProfile(deviceId).catch(() => {});
      } catch {
        if (active) setProfile(undefined);
      }
    })();
    return () => {
      active = false;
    };
  }, [isAdmin, adminChecked]);

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    const v = nameInput.trim();
    if (!v) return;
    setSavingName(true);
    setNameError("");
    try {
      const p = await saveAdminProfile(v);
      setProfile(p);
    } catch (err: any) {
      setNameError(err?.message ?? "حدث خطأ في حفظ الاسم");
    } finally {
      setSavingName(false);
    }
  }

  if (loading || !adminChecked) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <p className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري التحقق...
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <Lock className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-lg font-bold">ليس لديك صلاحية الدخول</h2>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            للدخول كمسؤول، اضغط على <strong>شعار ملفات المعلمين</strong> في الأعلى وأدخل الرمز السري.
          </p>
          <Link to="/" className="mt-5 text-sm font-medium text-primary hover:underline">
            العودة للرئيسية
          </Link>
        </div>
      </div>
    );
  }

  if (profile === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <p className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري تحميل ملفك...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {!profile ? (
          <div className="mx-auto max-w-md pt-10">
            <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <UserRound className="h-7 w-7" />
              </span>
              <h2 className="mt-4 text-lg font-bold">عرفنا على نفسك</h2>
              <p className="mt-1.5 text-xs text-muted-foreground">
                «قائمة الإدارة» تعرض أسماء جميع من يدخلون بالرمز — اكتب اسمك الحقيقي ليُعرَف من يعمل في اللوحة.
              </p>
              <form onSubmit={submitName} className="mt-5 space-y-3 text-right">
                <div>
                  <Label>اسمك</Label>
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="اكتب اسمك هنا"
                    autoFocus
                    required
                  />
                </div>
                {nameError && <p className="text-xs text-destructive">{nameError}</p>}
                <Button type="submit" className="w-full" disabled={savingName || !nameInput.trim()}>
                  {savingName && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
                  حفظ والمتابعة للوحة
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-2xl font-bold">لوحة إدارة ملفات المعلمين</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/40 px-3 py-1 text-xs font-medium">
                <UserRound className="h-3.5 w-3.5" /> {profile.name}
              </span>
            </div>
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v);
                try {
                  sessionStorage.setItem("madrekjo_tf_admin_tab", v);
                } catch {}
              }}
              className="space-y-4"
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="teachers">
                  <Users className="ml-1.5 h-4 w-4" /> المعلمون
                </TabsTrigger>
                <TabsTrigger value="refs">
                  <ListOrdered className="ml-1.5 h-4 w-4" /> المواد والحقول والصفوف
                </TabsTrigger>
                <TabsTrigger value="admins">
                  <UserRound className="ml-1.5 h-4 w-4" /> قائمة الإدارة
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings className="ml-1.5 h-4 w-4" /> الإعدادات
                </TabsTrigger>
              </TabsList>
              <TabsContent value="teachers">
                <TeachersTab />
              </TabsContent>
              <TabsContent value="refs">
                <RefsTab />
              </TabsContent>
              <TabsContent value="admins">
                <AdminProfilesTab />
              </TabsContent>
              <TabsContent value="settings">
                <SettingsTab />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

export default Admin;