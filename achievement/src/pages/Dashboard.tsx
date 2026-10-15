import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useProfile } from "@/hooks/useProfile";
import { useAdmin } from "@/hooks/useAdmin";
import { Header } from "@/components/Header";
import { CategorySection } from "@/components/CategorySection";
import { AdminPanel } from "@/components/AdminPanel";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Clock, Calendar, CalendarDays, Shield, ListTodo, CheckCircle2, Flame } from "lucide-react";

const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
};

const Dashboard = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { loadingMyTasks, inProgressTasks, myCompletedTasks } = useTasks();
  const { profile } = useProfile();
  const { isAdmin } = useAdmin();

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  if (loading || loadingMyTasks) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMinutes = myCompletedTasks
    .filter((t) => t.category === "daily" && new Date(t.updated_at ?? t.created_at) >= startOfToday)
    .reduce((sum, t) => sum + t.duration, 0);

  const stats = [
    { icon: ListTodo, label: "قيد الإنجاز", value: String(inProgressTasks.length), tone: "text-primary" },
    { icon: CheckCircle2, label: "إنجازاتي", value: String(myCompletedTasks.length), tone: "text-primary" },
    { icon: Flame, label: "دقائق اليوم", value: formatMinutes(todayMinutes), tone: "text-amber-500" },
  ];

  const today = new Date().toLocaleDateString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <OnboardingDialog />
      <main className="container py-8">
        {/* Page head */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
          <div>
            <p className="section-label">لوحة المهام</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
              مرحباً {profile?.display_name?.trim() || "بك"} 👋
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{today}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="stat-tile animate-fade-up flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="icon-tile h-10 w-10 sm:h-11 sm:w-11">
                <stat.icon className={`h-5 w-5 ${stat.tone}`} />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-lg font-bold tabular-nums text-foreground sm:text-xl">
                  {stat.value}
                </p>
                <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="daily" className="w-full">
          <TabsList
            className="mx-auto mb-6 grid h-auto w-full max-w-lg grid-cols-3 gap-1 p-1.5 text-base sm:grid-cols-4"
            data-tour="tabs"
          >
            <TabsTrigger value="daily" className="h-10 gap-1.5 text-sm sm:text-base" data-tour="tab-daily">
              <Clock className="h-4 w-4" />
              يومي
            </TabsTrigger>
            <TabsTrigger value="weekly" className="h-10 gap-1.5 text-sm sm:text-base">
              <Calendar className="h-4 w-4" />
              أسبوعي
            </TabsTrigger>
            <TabsTrigger value="monthly" className="h-10 gap-1.5 text-sm sm:text-base">
              <CalendarDays className="h-4 w-4" />
              شهري
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" className="h-10 gap-1.5 text-sm sm:text-base">
                <Shield className="h-4 w-4" />
                الإدارة
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
            {isAdmin && (
              <TabsContent value="admin">
                <AdminPanel />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
