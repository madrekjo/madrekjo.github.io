import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Users, ListOrdered, Settings, Lock } from "lucide-react";
import { TeachersTab } from "./admin/TeachersTab";
import { RefsTab } from "./admin/RefsTab";
import { SettingsTab } from "./admin/SettingsTab";

function Admin() {
  const { isAdmin, adminChecked, loading } = useAuth();

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

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">لوحة إدارة ملفات المعلمين</h1>
        <Tabs defaultValue="teachers" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="teachers">
              <Users className="ml-1.5 h-4 w-4" /> المعلمون
            </TabsTrigger>
            <TabsTrigger value="refs">
              <ListOrdered className="ml-1.5 h-4 w-4" /> المواد والحقول والصفوف
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
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default Admin;