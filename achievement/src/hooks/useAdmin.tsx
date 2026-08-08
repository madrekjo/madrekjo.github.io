import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const useAdmin = () => {
  const { user } = useAuth();

  const { data: isAdmin = false, isLoading: loadingAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
    enabled: !!user,
  });

  const { data: allUsers = [], isLoading: loadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-all-users"],
    queryFn: async () => {
      // Get all profiles
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return profiles ?? [];
    },
    enabled: isAdmin,
  });

  const { data: allTasks = [], isLoading: loadingTasks, refetch: refetchTasks } = useQuery({
    queryKey: ["admin-all-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  const deleteUser = async (userId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await supabase.functions.invoke("admin-delete-user", {
      body: { userId },
    });
    if (res.error) throw res.error;
    await refetchUsers();
    await refetchTasks();
  };

  const updateTaskDuration = async (taskId: string, duration: number) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await supabase.functions.invoke("admin-update-task", {
      body: { taskId, duration },
    });
    if (res.error) throw res.error;
    await refetchTasks();
  };

  const resetAllTasks = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await supabase.functions.invoke("admin-reset-all-tasks");
    if (res.error) throw res.error;
    await refetchTasks();
  };

  const adminUserAction = async (body: Record<string, unknown>) => {
    const res = await supabase.functions.invoke("admin-user-actions", { body });
    if (res.error) throw res.error;
    await refetchTasks();
  };

  const adminDeleteTask = (taskId: string) =>
    adminUserAction({ action: "delete_task", taskId });

  const adminUpdateTask = (taskId: string, updates: Record<string, unknown>) =>
    adminUserAction({ action: "update_task", taskId, updates });

  const adminResetUser = (userId: string) =>
    adminUserAction({ action: "reset_user", userId });

  const adminReduceHours = (userId: string, minutesToRemove: number) =>
    adminUserAction({ action: "reduce_hours", userId, minutesToRemove });

  return {
    isAdmin,
    loadingAdmin,
    allUsers,
    loadingUsers,
    allTasks,
    loadingTasks,
    deleteUser,
    updateTaskDuration,
    resetAllTasks,
    adminDeleteTask,
    adminUpdateTask,
    adminResetUser,
    adminReduceHours,
    refetchUsers,
    refetchTasks,
  };
};
