import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Users, ListOrdered, Settings } from "lucide-react";
import { TeachersTab } from "./admin/TeachersTab";
import { RefsTab } from "./admin/RefsTab";
import { SettingsTab } from "./admin/SettingsTab";

function Admin() {
  const { session, isAdmin, adminChecked, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) navigate("/login");
  }, [loading, session, navigate]);

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
        <p className="p-12 text-center text-sm text-muted-foreground">ليس لديك صلاحية الوصول.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">لوحة إدارة ملفات المعلمين</h1>

        <Tabs defaultValue="teachers" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="teachers">
              <Users className="h-3 w-3 ml-1" /> المعلمون
            </TabsTrigger>
            <TabsTrigger value="refs">
              <ListOrdered className="h-3 w-3 ml-1" /> القوائم
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-3 w-3 ml-1" /> الإعدادات
            </TabsTrigger>
          </TabsList>
          <TabsContent value="teachers" className="mt-4">
            <TeachersTab />
          </TabsContent>
          <TabsContent value="refs" className="mt-4">
            <RefsTab />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default Admin;
