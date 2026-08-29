import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useAdmin } from "@/hooks/useAdmin";
import { Header } from "@/components/Header";
import { CategorySection } from "@/components/CategorySection";
import { AdminPanel } from "@/components/AdminPanel";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, Calendar, CalendarDays, Shield } from "lucide-react";

const STUDY_DUA_KEY = "al-injaz-study-dua-last";
const STUDY_DUA_INTERVAL = 24 * 60 * 60 * 1000;

function shouldShowStudyDua() {
  try {
    const last = Number(localStorage.getItem(STUDY_DUA_KEY) || 0);
    if (!last) {
      localStorage.setItem(STUDY_DUA_KEY, String(Date.now()));
      return true;
    }
    if (Date.now() - last >= STUDY_DUA_INTERVAL) {
      localStorage.setItem(STUDY_DUA_KEY, String(Date.now()));
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

const Dashboard = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { loadingMyTasks } = useTasks();
  const { isAdmin } = useAdmin();
  const [showStudyDua, setShowStudyDua] = useState(false);

  useEffect(() => {
    if (shouldShowStudyDua()) setShowStudyDua(true);
  }, []);

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
            {isAdmin && (
              <TabsTrigger value="admin" className="gap-1.5 text-sm sm:text-base">
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

      <Dialog open={showStudyDua} onOpenChange={setShowStudyDua}>
        <DialogContent className="text-center">
          <DialogHeader>
            <DialogTitle className="text-xl">📖 دعاء قبل الدراسة</DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-foreground">
              اللهم انفعني بما علمتني، وعلّمني ما ينفعني، وزدني علماً.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-base leading-relaxed">
              اللهم إني أسألك فهم النبيين، وحفظ المرسلين والملائكة المقربين، يا رب اجعل لساني عامراً بذكرك، وقلبي بخشيتك، وسري بطاعتك، إنك على كل شيء قدير.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              رب اشرح لي صدري، ويسّر لي أمري، واحلل عقدة من لساني يفقهوا قولي.
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setShowStudyDua(false)}>بسم الله، أبدأ بحول الله</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
