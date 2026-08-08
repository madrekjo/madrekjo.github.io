import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Card } from "./ui/card";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, BarChart3, Trophy, Clock, CheckCircle2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

type CatFilter = "all" | "daily" | "weekly" | "monthly";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  category?: "daily" | "weekly" | "monthly";
}

const formatHM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
};

export const UserAnalyticsDialog = ({ open, onOpenChange, userId, userName, category }: Props) => {
  const [filter, setFilter] = useState<CatFilter>(category ?? "all");

  useEffect(() => {
    if (open) setFilter(category ?? "all");
  }, [open, category]);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["user-analytics", userId, filter],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_user_successful_tasks", {
        _user_id: userId,
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        category: string;
        duration: number;
        updated_at: string;
        created_at: string;
      }>;
      return filter === "all" ? rows : rows.filter((t) => t.category === filter);
    },
    enabled: open,
  });

  const stats = useMemo(() => {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 86400000);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const toMin = (t: { category: string; duration: number }) => {
      if (t.category === "daily") return t.duration;
      if (t.category === "weekly") return t.duration * 24 * 60;
      return t.duration * 7 * 24 * 60;
    };

    const totalMin = tasks.reduce((s, t) => s + toMin(t), 0);
    const monthMin = tasks
      .filter((t) => new Date(t.updated_at) >= monthAgo)
      .reduce((s, t) => s + toMin(t), 0);
    const weekMin = tasks
      .filter((t) => new Date(t.updated_at) >= weekAgo)
      .reduce((s, t) => s + toMin(t), 0);

    // Last 30 days line chart
    const dailyMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toLocaleDateString("ar-EG-u-nu-latn", { month: "2-digit", day: "2-digit" });
      dailyMap[key] = 0;
    }
    tasks
      .filter((t) => new Date(t.updated_at) >= monthAgo)
      .forEach((t) => {
        const key = new Date(t.updated_at).toLocaleDateString("ar-EG-u-nu-latn", {
          month: "2-digit",
          day: "2-digit",
        });
        if (key in dailyMap) dailyMap[key] += toMin(t);
      });
    const dailySeries = Object.entries(dailyMap).map(([date, minutes]) => ({
      date,
      hours: Math.round((minutes / 60) * 10) / 10,
    }));

    // By category bar
    const catMap: Record<string, number> = { daily: 0, weekly: 0, monthly: 0 };
    tasks.forEach((t) => {
      catMap[t.category] = (catMap[t.category] ?? 0) + toMin(t);
    });
    const catSeries = [
      { name: "يومي", hours: Math.round((catMap.daily / 60) * 10) / 10 },
      { name: "أسبوعي", hours: Math.round((catMap.weekly / 60) * 10) / 10 },
      { name: "شهري", hours: Math.round((catMap.monthly / 60) * 10) / 10 },
    ];

    return { totalMin, monthMin, weekMin, dailySeries, catSeries, count: tasks.length };
  }, [tasks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            تحليلات {userName}
          </DialogTitle>
          <DialogDescription>نظرة شاملة على إنجازاتك ومستواك</DialogDescription>
        </DialogHeader>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as CatFilter)}>
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="all">الكل</TabsTrigger>
            <TabsTrigger value="daily">يومي</TabsTrigger>
            <TabsTrigger value="weekly">أسبوعي</TabsTrigger>
            <TabsTrigger value="monthly">شهري</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">لا توجد إنجازات بعد لعرض التحليلات</p>
        ) : (
          <div className="space-y-4">
            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="p-3 text-center">
                <CheckCircle2 className="mx-auto h-5 w-5 text-primary" />
                <p className="mt-1 text-xs text-muted-foreground">عدد المنجزات</p>
                <p className="text-lg font-bold">{stats.count}</p>
              </Card>
              <Card className="p-3 text-center">
                <Trophy className="mx-auto h-5 w-5 text-amber-500" />
                <p className="mt-1 text-xs text-muted-foreground">الإجمالي</p>
                <p className="text-sm font-bold tabular-nums">{formatHM(stats.totalMin)}</p>
              </Card>
              <Card className="p-3 text-center">
                <Clock className="mx-auto h-5 w-5 text-blue-500" />
                <p className="mt-1 text-xs text-muted-foreground">آخر شهر</p>
                <p className="text-sm font-bold tabular-nums">{formatHM(stats.monthMin)}</p>
              </Card>
              <Card className="p-3 text-center">
                <Clock className="mx-auto h-5 w-5 text-emerald-500" />
                <p className="mt-1 text-xs text-muted-foreground">آخر أسبوع</p>
                <p className="text-sm font-bold tabular-nums">{formatHM(stats.weekMin)}</p>
              </Card>
            </div>

            {/* Line chart - last 30 days */}
            <Card className="p-4">
              <h4 className="mb-3 text-sm font-semibold">المستوى البياني — آخر 30 يوم (ساعات)</h4>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.dailySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="hours"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Category bar */}
            <Card className="p-4">
              <h4 className="mb-3 text-sm font-semibold">التوزيع حسب الفئة (ساعات)</h4>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.catSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
