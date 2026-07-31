import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useAdmin } from "@/hooks/useAdmin";
import { useSectionManager } from "@/hooks/useSectionManager";
import { Header } from "@/components/Header";
import { CategorySection } from "@/components/CategorySection";
import { AdminPanel } from "@/components/AdminPanel";
import { SectionManagerPanel } from "@/components/SectionManagerPanel";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Clock, Calendar, CalendarDays, Shield, ShieldCheck } from "lucide-react";

const Dashboard = () => {
  const { user, loading } = useAuth();
  const { loadingMyTasks } = useTasks();
  const { isAdmin } = useAdmin();
  const { isSectionManager, managedSection } = useSectionManager();
  const showAdmin = isAdmin || isSectionManager;

  if (loading || loadingMyTasks) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <OnboardingDialog />
      <main className="container py-6">
        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="mb-6 w-full max-w-lg mx-auto grid grid-cols-3 h-12 text-base sm:grid-cols-4" data-tour="tabs">
            <TabsTrigger value="daily" className="gap-1.5 text-sm sm:text-base" data-tour="tab-daily">
              <Clock className="h-4 w-4" />
              يومي
            </TabsTrigger>
            <TabsTrigger value="weekly" className="gap-1.5 text-sm sm:text-base">
              <Calendar className="h-4 w-4" />
              أسبوعي
            </TabsTrigger>
            <TabsTrigger value="monthly" className="gap-1.5 text-sm sm:text-base">
              <CalendarDays className="h-4 w-4" />
              شهري
            </TabsTrigger>
            {showAdmin && (
              <TabsTrigger value="admin" className="gap-1.5 text-sm sm:text-base">
                {isAdmin ? <Shield className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {isAdmin ? "الإدارة" : `إدارة ${managedSection?.name || "القسم"}`}
              </TabsTrigger>
            )}
          </TabsList>

          <div className="mx-auto max-w-3xl">
            <TabsContent value="daily">
              <CategorySection category="daily" />
            </TabsContent>
            <TabsContent value="weekly">
              <CategorySection category="weekly" />
            </TabsContent>
            <TabsContent value="monthly">
              <CategorySection category="monthly" />
            </TabsContent>
            {showAdmin && (
              <TabsContent value="admin">
                {isAdmin ? <AdminPanel /> : <SectionManagerPanel />}
              </TabsContent>
            )}
          </div>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
