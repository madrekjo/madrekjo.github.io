import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { useAuth } from "./useAuth";
import type { Database } from "@/integrations/supabase/types";

type TaskCategory = Database["public"]["Enums"]["task_category"];

/**
 * مهمة مجدولة («مهمة قادمة»): يحدّد لها المستخدم وقت البداية، ولا تبدأ
 * إلا عندما يأتي ويضغط «ابدأ الآن».
 */
export interface ScheduledTask {
  id: string;
  user_id: string;
  title: string;
  category: TaskCategory;
  duration: number;
  is_stopwatch: boolean;
  scheduled_at: string;
  status: "pending" | "started" | "cancelled";
  created_at: string;
}

// الجدول جديد والأنواع المولّدة لا تتضمنه بعد؛ نستخدم واجهة مرنة مثل useRounds.
const db = achievementSupabase as unknown as {
  from: (table: string) => ReturnType<typeof achievementSupabase.from>;
};

export interface CreateScheduledInput {
  title: string;
  category: TaskCategory;
  duration: number;
  isStopwatch?: boolean;
  scheduledAt: string;
}

/** هل الخطأ بسبب عدم تنفيذ ملف SQL الخاص بالجدول؟ */
export const isMissingScheduledTasksTable = (error: unknown): boolean => {
  const err = error as { code?: string; message?: string } | null | undefined;
  const code = String(err?.code ?? "");
  const message = String(err?.message ?? "");
  return code === "42P01" || /does not exist|schema cache|relation .*scheduled_tasks/i.test(message);
};

export const useScheduledTasks = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: pending = [], isLoading, error } = useQuery<ScheduledTask[]>({
    queryKey: ["scheduled-tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error: queryError } = await db
        .from("scheduled_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("scheduled_at", { ascending: true });
      if (queryError) throw queryError;
      return (data ?? []) as unknown as ScheduledTask[];
    },
    // تحديث دوري حتى تظهر الحالة «حان الوقت» تلقائياً.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["scheduled-tasks", user?.id] });
  };

  const scheduleTask = useMutation({
    mutationFn: async (input: CreateScheduledInput) => {
      if (!user) throw new Error("Not authenticated");
      const { error: insertError } = await db.from("scheduled_tasks").insert({
        user_id: user.id,
        title: input.title,
        category: input.category,
        duration: input.isStopwatch ? 0 : input.duration,
        is_stopwatch: !!input.isStopwatch,
        scheduled_at: input.scheduledAt,
        status: "pending",
      } as never);
      if (insertError) throw insertError;
    },
    onSuccess: invalidate,
  });

  const removeScheduled = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await db.from("scheduled_tasks").delete().eq("id", id);
      if (deleteError) throw deleteError;
    },
    onSuccess: invalidate,
  });

  const markScheduledStarted = useMutation({
    mutationFn: async (id: string) => {
      const { error: updateError } = await db
        .from("scheduled_tasks")
        .update({ status: "started" } as never)
        .eq("id", id);
      if (updateError) throw updateError;
    },
    onSuccess: invalidate,
  });

  return {
    pending,
    isLoading,
    /** الخطأ العام من الاستعلام (إن وُجد) */
    error,
    /** يحتاج المستخدم لتنفيذ ملف SQL أولاً */
    needsSetup: !!error && isMissingScheduledTasksTable(error),
    scheduleTask,
    removeScheduled,
    markScheduledStarted,
  };
};
