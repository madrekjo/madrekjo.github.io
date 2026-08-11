import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { useAuth } from "./useAuth";
import type { Database } from "@/integrations/supabase/types";

type TaskCategory = Database["public"]["Enums"]["task_category"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];
type ProfileSummary = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "user_id" | "display_name" | "avatar_url"
>;
type PublicSuccessfulTask = {
  id: string;
  user_id: string;
  category: TaskCategory;
  duration: number;
  daily_unit: string | null;
  created_at: string;
  updated_at: string;
};
type SuccessfulTaskWithProfile = PublicSuccessfulTask & {
  profiles: ProfileSummary | null;
};

const PAGE = 1000;

/** Fetch ALL rows by paginating past the 1000-row default limit */
async function fetchAll<T>(builder: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await builder(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export const useTasks = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: myTasks = [], isLoading: loadingMyTasks } = useQuery<Task[]>({
    queryKey: ["my-tasks", user?.id],
    queryFn: async () => {
      if (!user) return [];
      return fetchAll<Task>(async (from, to) => {
        const r = await achievementSupabase
          .from("tasks")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .range(from, to);
        return r;
      });
    },
    enabled: !!user,
  });

  const { data: allSuccessfulTasks = [], isLoading: loadingAll } = useQuery<SuccessfulTaskWithProfile[]>({
    queryKey: ["all-successful-tasks"],
    queryFn: async () => {
      if (!user) return [];

      const { data: rpcData, error: rpcError } = await (achievementSupabase.rpc as any)(
        "get_public_successful_tasks",
      );
      if (rpcError) throw rpcError;
      const tasks = (rpcData ?? []) as PublicSuccessfulTask[];
      if (tasks.length === 0) return [];

      const userIds = Array.from(new Set(tasks.map((task) => task.user_id)));
      const { data: profiles, error: profilesError } = await achievementSupabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const profilesByUserId = new Map(
        (profiles ?? []).map((profile) => [profile.user_id, profile] as const),
      );

      return tasks.map((task) => ({
        ...task,
        profiles: profilesByUserId.get(task.user_id) ?? null,
      }));
    },
    enabled: !!user,
  });

  const createTask = useMutation({
    mutationFn: async (task: { title: string; category: TaskCategory; duration: number; isStopwatch?: boolean }) => {
      if (!user) throw new Error("Not authenticated");

      let endsAt: Date;
      const now = new Date();

      if (task.isStopwatch) {
        // Stopwatch: cap at 5 hours from start
        endsAt = new Date(now.getTime() + 300 * 60 * 1000);
      } else if (task.category === "daily") {
        endsAt = new Date(now.getTime() + task.duration * 60 * 1000);
      } else if (task.category === "weekly") {
        endsAt = new Date(now.getTime() + task.duration * 24 * 60 * 60 * 1000);
      } else {
        endsAt = new Date(now.getTime() + task.duration * 7 * 24 * 60 * 60 * 1000);
      }

      const { error } = await achievementSupabase.from("tasks").insert({
        user_id: user.id,
        title: task.title,
        category: task.category,
        duration: task.isStopwatch ? 0 : task.duration,
        daily_unit: "minutes",
        started_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        paused_at: null,
        paused_total_ms: 0,
        is_stopwatch: task.isStopwatch ?? false,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    },
  });


  const completeTask = useMutation({
    mutationFn: async ({ taskId, isSuccess, isHalf, originalDuration, earlyFinish, elapsedMinutes }: {
      taskId: string;
      isSuccess: boolean;
      isHalf?: boolean;
      originalDuration?: number;
      earlyFinish?: boolean;
      elapsedMinutes?: number;
    }) => {
      if (earlyFinish && elapsedMinutes != null) {
        const { error } = await achievementSupabase
          .from("tasks")
          .update({ completed: true, is_success: true, duration: Math.max(1, elapsedMinutes) })
          .eq("id", taskId);
        if (error) throw error;
      } else if (isHalf && originalDuration != null) {
        const halfDuration = Math.max(1, Math.round(originalDuration / 2));
        const { error } = await achievementSupabase
          .from("tasks")
          .update({ completed: true, is_success: true, duration: halfDuration })
          .eq("id", taskId);
        if (error) throw error;
      } else {
        const { error } = await achievementSupabase
          .from("tasks")
          .update({ completed: true, is_success: isSuccess })
          .eq("id", taskId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-successful-tasks"] });
    },
  });

  const editTask = useMutation({
    mutationFn: async (params: {
      taskId: string;
      title?: string;
      category?: TaskCategory;
      duration?: number;
      resetTimer?: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const updates: Record<string, unknown> = {};
      if (params.title) updates.title = params.title;
      if (params.category) updates.category = params.category;

      if (params.resetTimer && params.duration != null) {
        updates.duration = params.duration;
        const cat = params.category || "daily";
        const now = new Date();
        let endsAt: Date;
        if (cat === "daily") {
          endsAt = new Date(now.getTime() + params.duration * 60 * 1000);
        } else if (cat === "weekly") {
          endsAt = new Date(now.getTime() + params.duration * 24 * 60 * 60 * 1000);
        } else {
          endsAt = new Date(now.getTime() + params.duration * 7 * 24 * 60 * 60 * 1000);
        }
        updates.ends_at = endsAt.toISOString();
        updates.started_at = now.toISOString();
        updates.paused_at = null;
        updates.paused_total_ms = 0;
      } else if (params.duration != null) {
        updates.duration = params.duration;
      }

      const { error } = await achievementSupabase
        .from("tasks")
        .update(updates)
        .eq("id", params.taskId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    },
  });

  /** Pause active task: store paused_at = now */
  const pauseTask = useMutation({
    mutationFn: async (taskId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await achievementSupabase
        .from("tasks")
        .update({ paused_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-tasks"] }),
  });

  /** Resume task: shift ends_at by paused interval, accumulate paused_total_ms */
  const resumeTask = useMutation({
    mutationFn: async (params: { taskId: string; pausedAt: string; endsAt: string; pausedTotalMs: number }) => {
      if (!user) throw new Error("Not authenticated");
      const pausedFor = Date.now() - new Date(params.pausedAt).getTime();
      const newEndsAt = new Date(new Date(params.endsAt).getTime() + pausedFor);
      const { error } = await achievementSupabase
        .from("tasks")
        .update({
          paused_at: null,
          paused_total_ms: params.pausedTotalMs + pausedFor,
          ends_at: newEndsAt.toISOString(),
        })
        .eq("id", params.taskId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-tasks"] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await achievementSupabase
        .from("tasks")
        .delete()
        .eq("id", taskId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    },
  });

  /** Heartbeat: update heartbeat_at so we can detect offline gaps for stopwatch tasks. */
  const heartbeat = async (taskId: string) => {
    if (!user) return;
    await achievementSupabase
      .from("tasks")
      .update({ heartbeat_at: new Date().toISOString() } as never)
      .eq("id", taskId)
      .eq("user_id", user.id);
  };

  /**
   * If a running stopwatch has a stale heartbeat, treat the gap as paused time
   * and freeze the task in paused state at the last heartbeat.
   */
  const catchUpOfflineGap = async (params: {
    taskId: string;
    lastHeartbeat: string;
    endsAt: string;
    pausedTotalMs: number;
  }) => {
    if (!user) return;
    const gap = Date.now() - new Date(params.lastHeartbeat).getTime();
    const newEndsAt = new Date(new Date(params.endsAt).getTime() + gap).toISOString();
    await achievementSupabase
      .from("tasks")
      .update({
        paused_at: params.lastHeartbeat,
        paused_total_ms: (params.pausedTotalMs ?? 0),
        ends_at: newEndsAt,
      } as never)
      .eq("id", params.taskId)
      .eq("user_id", user.id);
    queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
  };

  const inProgressTasks = myTasks.filter((t) => !t.completed);
  const myCompletedTasks = myTasks.filter((t) => t.completed && t.is_success);

  return {
    myTasks,
    inProgressTasks,
    myCompletedTasks,
    allSuccessfulTasks,
    loadingMyTasks,
    loadingAll,
    createTask,
    completeTask,
    editTask,
    pauseTask,
    resumeTask,
    deleteTask,
    heartbeat,
    catchUpOfflineGap,
  };
};
