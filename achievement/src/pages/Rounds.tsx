import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { useRounds, Round } from "@/hooks/useRounds";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RoundCard } from "@/components/RoundCard";
import { RoundView } from "@/components/RoundView";
import { CreateRoundDialog } from "@/components/CreateRoundDialog";
import { Loader2, Plus, Sparkles, AlertTriangle } from "lucide-react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


const Rounds = () => {
  const { user, loading } = useAuth();
  const { rounds, participants, isLoading, canCreate, joinRound, deleteRound } = useRounds();
  const { isAdmin } = useAdmin();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);


  const now = Date.now();
  const { active, ended } = useMemo(() => {
    const a: Round[] = []; const e: Round[] = [];
    for (const r of rounds) {
      if (new Date(r.ends_at).getTime() > now && r.status === "active") a.push(r);
      else e.push(r);
    }
    return { active: a, ended: e };
  }, [rounds, now]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of participants) map[p.round_id] = (map[p.round_id] || 0) + 1;
    return map;
  }, [participants]);

  const activeRound = rounds.find((r) => r.id === activeRoundId) || null;
  const activeParticipants = participants.filter((p) => p.round_id === activeRoundId);

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />
      <main className="container py-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">الجولات</h1>
          </div>
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" />
              إنشاء جولة
            </Button>
          )}
        </div>

        <Alert className="mb-6 border-amber-500/40 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-700 dark:text-amber-300">تنبيه</AlertTitle>
          <AlertDescription className="text-foreground/80 text-sm leading-relaxed">
            لو طلعت من الموقع وأنت داخل بجولة، رح تنطرد منها فوراً وما رح تتحسب لك ساعات الدراسة.
            وكذلك أي مهمة شغّالة رح تتوقف وتنحذف. خلّيك بالصفحة لين تخلص الجولة أو المهمة.
          </AlertDescription>
        </Alert>


        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-xs">
              <TabsTrigger value="active">نشطة ({active.length})</TabsTrigger>
              <TabsTrigger value="ended">منتهية ({ended.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="mt-4">
              {active.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">لا توجد جولات نشطة حالياً</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {active.map((r) => (
                    <RoundCard
                      key={r.id}
                      round={r}
                      participantCount={counts[r.id] || 0}
                      hasJoined={participants.some((p) => p.round_id === r.id && p.user_id === user.id)}
                      canDelete={r.creator_id === user.id}
                      onJoin={async () => {
                        try { await joinRound.mutateAsync(r.id); toast.success("انضممت للجولة 🎉"); }
                        catch { toast.error("تعذّر الانضمام"); }
                      }}
                      onOpen={() => setActiveRoundId(r.id)}
                      onDelete={async () => {
                        try { await deleteRound.mutateAsync(r.id); toast.success("تم حذف الجولة"); }
                        catch { toast.error("تعذّر الحذف"); }
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="ended" className="mt-4">
              {ended.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">لا توجد جولات منتهية</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ended.map((r) => (
                    <RoundCard
                      key={r.id}
                      round={r}
                      participantCount={counts[r.id] || 0}
                      hasJoined={participants.some((p) => p.round_id === r.id && p.user_id === user.id)}
                      canDelete={r.creator_id === user.id || isAdmin}
                      onJoin={() => {}}
                      onOpen={() => setActiveRoundId(r.id)}
                      onDelete={async () => {
                        try { await deleteRound.mutateAsync(r.id); toast.success("تم حذف الجولة"); }
                        catch { toast.error("تعذّر الحذف"); }
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>

      <CreateRoundDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RoundView
        round={activeRound}
        participants={activeParticipants}
        open={!!activeRoundId}
        onOpenChange={(o) => { if (!o) setActiveRoundId(null); }}
      />
    </div>
  );
};

export default Rounds;
