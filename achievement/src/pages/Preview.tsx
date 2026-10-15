/**
 * صفحة معاينة محلية (DEV فقط) — لا تُبنى في الإنتاج.
 * الغرض: عرض شكل قسم «الإنجاز» بالكامل بدون تسجيل دخول، باستخدام
 * نفس المكوّنات الحقيقية مع بيانات وهمية.
 * الوصول محلياً: http://localhost:5000/achievement/entry.html ثم الانتقال إلى /preview
 */
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { CreateTaskForm } from "@/components/CreateTaskForm";
import { UpcomingTasksCard, type ScheduledViewItem } from "@/components/UpcomingTasks";
import { TaskCard } from "@/components/TaskCard";
import { RoundCard } from "@/components/RoundCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Trophy,
  ListTodo,
  CheckCircle,
  BarChart3,
  Flame,
  Zap,
  Clock,
  Calendar,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import type { Round } from "@/hooks/useRounds";

const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockTasks: any[] = [
  {
    id: "t1",
    title: "دراسة مادة التاريخ — الوحدة الثالثة",
    category: "daily",
    duration: 60,
    started_at: iso(-20 * 60 * 1000),
    ends_at: iso(40 * 60 * 1000),
    completed: false,
    is_success: null,
    is_stopwatch: false,
  },
  {
    id: "t2",
    title: "حل تمارين الرياضيات",
    category: "daily",
    duration: 0,
    started_at: iso(-15 * 60 * 1000),
    ends_at: iso(5 * 60 * 60 * 1000),
    completed: false,
    is_success: null,
    is_stopwatch: true,
  },
  {
    id: "t3",
    title: "مراجعة حفظ سورة الملك",
    category: "daily",
    duration: 45,
    started_at: iso(-30 * 60 * 1000),
    ends_at: iso(15 * 60 * 1000),
    completed: false,
    is_success: null,
    is_stopwatch: false,
    paused_at: iso(-5 * 60 * 1000),
  },
  {
    id: "t4",
    title: "قراءة الفصل الأول من كتاب الفيزياء",
    category: "daily",
    duration: 50,
    started_at: iso(-3 * 60 * 60 * 1000),
    ends_at: iso(-2 * 60 * 60 * 1000),
    completed: true,
    is_success: true,
    updated_at: iso(-2 * 60 * 60 * 1000),
    is_stopwatch: false,
  },
];

const mockLeaders = [
  { name: "أحمد محمود", minutes: 486, tasks: 9 },
  { name: "سارة العلي", minutes: 402, tasks: 7 },
  { name: "محمد خالد", minutes: 371, tasks: 6 },
  { name: "خالد سعيد", minutes: 305, tasks: 5, me: true },
  { name: "ليان سمير", minutes: 268, tasks: 4 },
  { name: "يوسف ناصر", minutes: 190, tasks: 3 },
];

const medals = ["🥇", "🥈", "🥉"];

const mockScheduled: ScheduledViewItem[] = [
  {
    id: "s1",
    title: "مراجعة الفصل الرابع — أحياء",
    category: "daily",
    duration: 45,
    scheduledAt: iso(35 * 60 * 1000),
  },
  {
    id: "s2",
    title: "حل واجب اللغة الإنجليزية",
    category: "daily",
    duration: 30,
    scheduledAt: iso(3 * 60 * 60 * 1000),
  },
  {
    id: "s3",
    title: "تلخيص درس الجغرافيا",
    category: "daily",
    duration: 60,
    scheduledAt: iso(-12 * 60 * 1000),
  },
];

const mockRounds: Round[] = [
  {
    id: "r1",
    creator_id: "u1",
    title: "جولة المراجعة النهائية",
    description: "جلسة دراسة جماعية 25 دقيقة دراسة و5 دقائق بريك.",
    image_path: null,
    total_minutes: 120,
    work_minutes: 25,
    break_minutes: 5,
    starts_at: iso(-10 * 60 * 1000),
    ends_at: iso(90 * 60 * 1000),
    status: "active",
    credited: false,
    created_at: iso(-10 * 60 * 1000),
  },
  {
    id: "r2",
    creator_id: "u1",
    title: "تحدي الرياضيات",
    description: "منافسة حل المسائل بين الزملاء.",
    image_path: null,
    total_minutes: 60,
    work_minutes: 20,
    break_minutes: 5,
    starts_at: iso(-5 * 60 * 60 * 1000),
    ends_at: iso(-60 * 60 * 1000),
    status: "ended",
    credited: true,
    created_at: iso(-6 * 60 * 60 * 1000),
  },
];

const stats = [
  { icon: ListTodo, label: "قيد الإنجاز", value: "3" },
  { icon: CheckCircle, label: "إنجازاتي", value: "12" },
  { icon: Flame, label: "دقائق اليوم", value: "5:05" },
];

const Preview = () => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        {/* شريط معاينة */}
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="font-medium">وضع المعاينة المحلي</span>
          <span className="text-muted-foreground">
            — بيانات وهمية لعرض الشكل فقط (لا تُبنى هذه الصفحة في الإنتاج)
          </span>
        </div>

        {/* رأس الصفحة */}
        <div className="mb-6">
          <p className="section-label">لوحة المهام</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">مرحباً أحمد 👋</h1>
          <p className="mt-1 text-sm text-muted-foreground">الخميس، 15 تشرين الأول</p>
        </div>

        {/* الإحصائيات */}
        <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="stat-tile flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="icon-tile h-10 w-10 sm:h-11 sm:w-11">
                <stat.icon className="h-5 w-5 text-primary" />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-lg font-bold tabular-nums text-foreground sm:text-xl">{stat.value}</p>
                <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* التابات */}
        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="mx-auto mb-6 grid h-auto w-full max-w-lg grid-cols-3 gap-1 p-1.5 sm:grid-cols-4">
            <TabsTrigger value="daily" className="h-10 gap-1.5 text-sm sm:text-base">
              <Clock className="h-4 w-4" /> يومي
            </TabsTrigger>
            <TabsTrigger value="weekly" className="h-10 gap-1.5 text-sm sm:text-base">
              <Calendar className="h-4 w-4" /> أسبوعي
            </TabsTrigger>
            <TabsTrigger value="monthly" className="h-10 gap-1.5 text-sm sm:text-base">
              <CalendarDays className="h-4 w-4" /> شهري
            </TabsTrigger>
            <TabsTrigger value="admin" className="h-10 gap-1.5 text-sm sm:text-base">
              <Sparkles className="h-4 w-4" /> الإدارة
            </TabsTrigger>
          </TabsList>

          <div className="mx-auto max-w-3xl space-y-5">
            <TabsContent value="daily" className="space-y-5">
              <CreateTaskForm fixedCategory="daily" />

              <UpcomingTasksCard
                items={mockScheduled}
                now={now}
                onStart={() => {}}
                onRemove={() => {}}
                onScheduleClick={() => {}}
              />

              <button
                type="button"
                className="surface surface-hover group flex w-full items-center gap-3 p-3.5 text-start"
              >
                <span className="icon-tile h-10 w-10">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-foreground">تحليلاتي وإنجازاتي</span>
                  <span className="block text-xs text-muted-foreground">ساعاتك، توزيع مهامك، وتقدمك مع الوقت</span>
                </span>
                <Sparkles className="h-4 w-4 text-primary transition-transform group-hover:scale-110" />
              </button>

              <Tabs defaultValue="in-progress">
                <TabsList className="w-full">
                  <TabsTrigger value="in-progress" className="flex-1 gap-1.5">
                    <ListTodo className="h-4 w-4" />
                    قيد الإنجاز
                    <span className="rounded-full bg-primary/10 px-1.5 text-xs font-bold text-primary tabular-nums">3</span>
                  </TabsTrigger>
                  <TabsTrigger value="my-completed" className="flex-1 gap-1.5">
                    <CheckCircle className="h-4 w-4" />
                    منجزاتي
                    <span className="rounded-full bg-primary/10 px-1.5 text-xs font-bold text-primary tabular-nums">12</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="in-progress" className="mt-4 space-y-3">
                  {mockTasks.slice(0, 3).map((task) => (
                    <TaskCard key={task.id} task={task} showActions />
                  ))}
                </TabsContent>
                <TabsContent value="my-completed" className="mt-4 space-y-3">
                  <TaskCard task={mockTasks[3]} />
                </TabsContent>
              </Tabs>

              {/* المتصدرون */}
              <div className="surface overflow-hidden p-5 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="icon-tile h-10 w-10">
                      <Trophy className="h-5 w-5" />
                    </span>
                    <h3 className="text-base font-semibold text-foreground sm:text-lg">متصدرو اليوم</h3>
                  </div>
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                    6 مشارك
                  </Badge>
                </div>

                <div className="mb-4 inline-flex rounded-xl border border-border/70 bg-muted/50 p-1">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-background px-3 py-1.5 text-sm font-medium text-primary shadow-sm">
                    <Zap className="h-3.5 w-3.5" /> اليوم
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground">
                    <Flame className="h-3.5 w-3.5" /> المدى الطويل
                  </span>
                </div>

                <div className="space-y-2.5">
                  {mockLeaders.map((u, index) => {
                    const hours = Math.floor(u.minutes / 60);
                    const mins = Math.round(u.minutes % 60);
                    const isTop3 = index < 3;
                    return (
                      <div
                        key={u.name}
                        className={cn(
                          "group flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-soft",
                          u.me
                            ? "border-primary/45 bg-primary/[0.07]"
                            : isTop3
                              ? "border-accent/40 bg-accent/[0.06]"
                              : "border-border/70 bg-background/40 hover:border-primary/25",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ring-1 ring-inset",
                            isTop3
                              ? "bg-accent/20 text-accent-foreground ring-accent/30"
                              : "bg-muted text-muted-foreground ring-border/60",
                          )}
                        >
                          {isTop3 ? medals[index] : index + 1}
                        </span>

                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                            isTop3
                              ? "bg-gradient-to-br from-accent/35 to-primary/15 text-foreground ring-1 ring-inset ring-accent/30"
                              : "bg-secondary text-secondary-foreground",
                          )}
                        >
                          {u.name.trim().charAt(0)}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {u.name}
                            {u.me && <span className="ms-1.5 text-[11px] font-medium text-primary">(أنت)</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{u.tasks} مهمة منجزة</p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <div className="text-end">
                            <p className="font-mono text-base font-bold leading-none tabular-nums text-primary">
                              {hours}:{String(mins).padStart(2, "0")}
                            </p>
                            <p className="mt-1 text-[10px] leading-none text-muted-foreground">ساعة : دقيقة</p>
                          </div>
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg text-primary opacity-70 transition group-hover:opacity-100">
                            <BarChart3 className="h-4 w-4" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* الجولات */}
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold text-foreground">الجولات</h3>
                  </div>
                  <Button size="sm" className="gap-1.5">
                    إنشاء جولة
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {mockRounds.map((r) => (
                    <RoundCard
                      key={r.id}
                      round={r}
                      participantCount={5}
                      hasJoined={r.status === "active"}
                      canDelete
                      onJoin={() => {}}
                      onOpen={() => {}}
                      onDelete={() => {}}
                    />
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="weekly">
              <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                قسم أسبوعي (أيام)
              </div>
            </TabsContent>
            <TabsContent value="monthly">
              <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                قسم شهري (أسابيع)
              </div>
            </TabsContent>
            <TabsContent value="admin">
              <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                لوحة الإدارة
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
};

export default Preview;
