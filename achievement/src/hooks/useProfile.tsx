import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { useAuth } from "./useAuth";

export const useProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await achievementSupabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;

      // لا يوجد بروفايل بعد (مثلاً trigger handle_new_user لم يُنشئه في مشروع الإنجاز).
      // نحاول إنشاءه الآن؛ إن فشل (قيد المفتاح الأجنبي أو RLS) نعيد null ولا نكسر الواجهة.
      const { data: created, error: createError } = await achievementSupabase
        .from("profiles")
        .insert({ user_id: user.id })
        .select("*")
        .single();
      if (createError) {
        console.error("[useProfile] auto-create failed:", createError.message);
        return null;
      }
      return created;
    },
    enabled: !!user,
  });

  const updateProfile = useMutation({
    mutationFn: async (updates: { display_name?: string; avatar_url?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await achievementSupabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });

  return { profile, isLoading, updateProfile };
};
