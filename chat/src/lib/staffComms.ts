import { supabase } from "@/integrations/supabase/client";

export type CommKind = "note" | "task";
export type TargetRole = "all" | "admin" | "moderator" | "supervisor";

export interface OwnerCommunication {
  id: string;
  kind: CommKind;
  content: string;
  target_role: TargetRole;
  task_status: "pending" | "done" | null;
  created_by: string | null;
  created_at: string;
  done_by: string | null;
  done_at: string | null;
  author_name?: string | null;
  doer_name?: string | null;
}

export const COMM_TARGET_LABEL: Record<TargetRole, string> = {
  all: "الكُل",
  admin: "الأدمن",
  moderator: "المشرفين",
  supervisor: "المسؤولين",
};

export async function fetchOwnerComms(): Promise<OwnerCommunication[]> {
  const { data, error } = await supabase
    .from("owner_communications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const comms = (data || []) as OwnerCommunication[];

  const ids = Array.from(
    new Set(
      comms.flatMap((c) => [c.created_by, c.done_by].filter((v): v is string => !!v))
    )
  );
  if (!ids.length) return comms;

  const { data: profs } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", ids);
  const map: Record<string, string> = {};
  (profs || []).forEach((p: { user_id: string; full_name: string | null }) => {
    map[p.user_id] = p.full_name || "—";
  });

  return comms.map((c) => ({
    ...c,
    author_name: c.created_by ? map[c.created_by] || "—" : null,
    doer_name: c.done_by ? map[c.done_by] || "—" : null,
  }));
}

export async function sendOwnerComms(kind: CommKind, content: string, targetRole: TargetRole): Promise<void> {
  const { error } = await supabase.rpc("send_owner_communication", {
    _kind: kind,
    _content: content,
    _target_role: targetRole,
  });
  if (error) throw error;
}

export async function completeOwnerTask(id: string): Promise<void> {
  const { error } = await supabase.rpc("complete_owner_task", { _id: id });
  if (error) throw error;
}

export async function deleteOwnerComms(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_owner_communication", { _id: id });
  if (error) throw error;
}