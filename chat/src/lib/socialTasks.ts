import { supabase } from "@/integrations/supabase/client";

export type SocialTaskStatus = "pending" | "done" | "verified" | "rejected";

export interface SocialTask {
  id: string;
  title: string;
  details: string | null;
  status: SocialTaskStatus;
  proof_link: string | null;
  created_by: string | null;
  created_at: string;
  done_by: string | null;
  done_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  reject_reason: string | null;
  creator_name?: string | null;
  doer_name?: string | null;
  verifier_name?: string | null;
}

export const SOCIAL_TASK_STATUS: Record<SocialTaskStatus, { label: string; cls: string }> = {
  pending: { label: "بانتظار التنفيذ", cls: "bg-muted text-muted-foreground border" },
  done: { label: "تم الإنجاز ✓ — بانتظار تصديق المالك", cls: "bg-blue-500/15 text-blue-600 border border-blue-300" },
  verified: { label: "مصدّقة ✓", cls: "bg-green-500/15 text-green-600 border border-green-300" },
  rejected: { label: "مرفوضة ✗", cls: "bg-red-500/15 text-red-600 border border-red-300" },
};

export async function fetchSocialTasks(): Promise<SocialTask[]> {
  const { data, error } = await supabase
    .from("social_tasks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const tasks = (data || []) as SocialTask[];

  const ids = Array.from(
    new Set(
      tasks.flatMap((t) =>
        [t.created_by, t.done_by, t.verified_by].filter((v): v is string => !!v)
      )
    )
  );
  if (!ids.length) return tasks;

  const { data: profs } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", ids);
  const map: Record<string, string> = {};
  (profs || []).forEach((p: { user_id: string; full_name: string | null }) => {
    map[p.user_id] = p.full_name || "—";
  });

  return tasks.map((t) => ({
    ...t,
    creator_name: t.created_by ? map[t.created_by] || "—" : null,
    doer_name: t.done_by ? map[t.done_by] || "—" : null,
    verifier_name: t.verified_by ? map[t.verified_by] || "—" : null,
  }));
}

export async function createSocialTask(title: string, details: string | null): Promise<void> {
  const { error } = await supabase.rpc("create_social_task", {
    _title: title,
    _details: details,
  });
  if (error) throw error;
}

export async function completeSocialTask(taskId: string, proofLink: string | null): Promise<void> {
  const { error } = await supabase.rpc("complete_social_task", {
    _task_id: taskId,
    _proof_link: proofLink,
  });
  if (error) throw error;
}

export async function verifySocialTask(taskId: string, approved: boolean, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc("verify_social_task", {
    _task_id: taskId,
    _approved: approved,
    _reason: reason,
  });
  if (error) throw error;
}

export async function deleteSocialTask(taskId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_social_task", { _task_id: taskId });
  if (error) throw error;
}