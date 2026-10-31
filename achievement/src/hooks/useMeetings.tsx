import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { useAuth } from "./useAuth";
import { useAdmin } from "./useAdmin";

// جداول الاجتماعات تُضاف في ملف SQL: 20261031120000_round_limits_blocks_meetings.sql
const db = achievementSupabase as unknown as {
  from: (table: string) => ReturnType<typeof achievementSupabase.from>;
};

export interface Meeting {
  id: string;
  title: string;
  description: string;
  scheduled_at: string | null;
  created_by: string;
  created_at: string;
}

export interface MeetingMember {
  meeting_id: string;
  user_id: string;
  added_by: string | null;
  added_at: string;
}

export interface MemberProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export const isMissingMeetingsTable = (error: unknown): boolean => {
  const err = error as { code?: string; message?: string } | null | undefined;
  const code = String(err?.code ?? "");
  const message = String(err?.message ?? "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /relation .*meetings.* does not exist|schema cache/i.test(message)
  );
};

export const useMeetings = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const qc = useQueryClient();

  const { data: meetings = [], isLoading, error } = useQuery<Meeting[]>({
    queryKey: ["meetings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error: queryError } = await db
        .from("meetings")
        .select("*")
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;
      return (data ?? []) as unknown as Meeting[];
    },
    refetchInterval: 45_000,
    staleTime: 30_000,
  });

  const meetingIds = meetings.map((m) => m.id);
  const meetingKey = meetingIds.join(",");

  const { data: members = [] } = useQuery<MeetingMember[]>({
    queryKey: ["meeting-members", meetingKey],
    enabled: !!user && meetingIds.length > 0,
    queryFn: async () => {
      const { data, error: queryError } = await db
        .from("meeting_members")
        .select("*")
        .in("meeting_id", meetingIds);
      if (queryError) throw queryError;
      return (data ?? []) as unknown as MeetingMember[];
    },
    refetchInterval: 45_000,
    staleTime: 30_000,
  });

  const memberUserIds = Array.from(new Set(members.map((m) => m.user_id))).sort();
  const memberKey = memberUserIds.join(",");

  const { data: profiles = {} } = useQuery<Record<string, MemberProfile>>({
    queryKey: ["meeting-profiles", memberKey],
    enabled: memberUserIds.length > 0,
    queryFn: async () => {
      const { data, error: queryError } = await achievementSupabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", memberUserIds);
      if (queryError) throw queryError;
      const map: Record<string, MemberProfile> = {};
      ((data ?? []) as MemberProfile[]).forEach((p) => {
        map[p.user_id] = p;
      });
      return map;
    },
    staleTime: 120_000,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["meetings"] });
    void qc.invalidateQueries({ queryKey: ["meeting-members"] });
  };

  const createMeeting = useMutation({
    mutationFn: async (input: { title: string; description: string; scheduledAt: string | null }) => {
      if (!user) throw new Error("Not authenticated");
      const { error: insertError } = await db.from("meetings").insert({
        title: input.title,
        description: input.description,
        scheduled_at: input.scheduledAt,
        created_by: user.id,
      } as never);
      if (insertError) throw insertError;
    },
    onSuccess: invalidate,
  });

  const deleteMeeting = useMutation({
    mutationFn: async (meetingId: string) => {
      const { error: deleteError } = await db.from("meetings").delete().eq("id", meetingId);
      if (deleteError) throw deleteError;
    },
    onSuccess: invalidate,
  });

  const addMember = useMutation({
    mutationFn: async (input: { meetingId: string; userId: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error: insertError } = await db
        .from("meeting_members")
        .insert({
          meeting_id: input.meetingId,
          user_id: input.userId,
          added_by: user.id,
        } as never);
      if (insertError && !/duplicate/i.test(String(insertError.message))) throw insertError;
    },
    onSuccess: invalidate,
  });

  const removeMember = useMutation({
    mutationFn: async (input: { meetingId: string; userId: string }) => {
      const { error: deleteError } = await db
        .from("meeting_members")
        .delete()
        .eq("meeting_id", input.meetingId)
        .eq("user_id", input.userId);
      if (deleteError) throw deleteError;
    },
    onSuccess: invalidate,
  });

  const meetingsWithMembers = meetings.map((meeting) => ({
    ...meeting,
    members: members
      .filter((m) => m.meeting_id === meeting.id)
      .map((m) => ({
        user_id: m.user_id,
        display_name: profiles[m.user_id]?.display_name?.trim() || "مستخدم",
        avatar_url: profiles[m.user_id]?.avatar_url ?? null,
      })),
  }));

  return {
    meetings: meetingsWithMembers,
    isLoading,
    needsSetup: !!error && isMissingMeetingsTable(error),
    isAdmin,
    /** هل يظهر القسم لهذا المستخدم؟ (أدمن أو عضو في اجتماع) */
    hasAccess: isAdmin || meetings.length > 0,
    createMeeting,
    deleteMeeting,
    addMember,
    removeMember,
  };
};
