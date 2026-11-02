import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { useAuth } from "./useAuth";
import { useCallback, useEffect, useRef } from "react";

const db = achievementSupabase as unknown as {
  from: (table: string) => ReturnType<typeof achievementSupabase.from>;
};

export interface MeetingMessage {
  id: string;
  meeting_id: string;
  sender_id: string;
  content: string;
  image_urls: string[] | null;
  created_at: string;
}

export const useMeetingChat = (meetingId: string | null) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const instance = useRef(crypto.randomUUID());

  const refresh = useCallback(() => {
    if (!meetingId) return;
    qc.invalidateQueries({ queryKey: ["meeting-messages", meetingId] });
  }, [qc, meetingId]);

  const { data: messages = [], isLoading } = useQuery<MeetingMessage[]>({
    queryKey: ["meeting-messages", meetingId],
    enabled: !!user && !!meetingId,
    queryFn: async () => {
      const { data, error } = await db
        .from("meeting_messages")
        .select("*")
        .eq("meeting_id", meetingId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as MeetingMessage[]);
    },
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });

  const senderIds = Array.from(new Set(messages.map((m) => m.sender_id))).sort();
  const senderKey = senderIds.join(",");

  const { data: profileMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["meeting-chat-profiles", senderKey],
    enabled: senderIds.length > 0,
    queryFn: async () => {
      const { data } = await achievementSupabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", senderIds);
      const map: Record<string, string> = {};
      ((data ?? []) as { user_id: string; display_name: string | null }[]).forEach((p) => {
        map[p.user_id] = p.display_name?.trim() || "مستخدم";
      });
      return map;
    },
    staleTime: 120_000,
  });

  const sendMessage = useMutation({
    mutationFn: async ({ content, files }: { content: string; files: File[] }) => {
      if (!user || !meetingId) throw new Error("Not authenticated");
      const imageUrls: string[] = [];
      for (const file of files) {
        const allowed: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/gif": "gif",
          "image/webp": "webp",
        };
        const ext = allowed[file.type];
        if (!ext) throw new Error("صيغة الصورة غير مدعومة");
        if (file.size > 5 * 1024 * 1024) throw new Error("حجم الصورة يتجاوز 5 ميغابايت");
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await achievementSupabase.storage
          .from("support-media")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = achievementSupabase.storage.from("support-media").getPublicUrl(path);
        if (pub?.publicUrl) imageUrls.push(pub.publicUrl);
      }
      const { error } = await db.from("meeting_messages").insert({
        meeting_id: meetingId,
        sender_id: user.id,
        content: content.trim(),
        image_urls: imageUrls,
      } as never);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("meeting_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  useEffect(() => {
    if (!user || !meetingId) return;
    const channel = achievementSupabase.channel(`meeting-chat-${meetingId}-${instance.current}`);
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "meeting_messages", filter: `meeting_id=eq.${meetingId}` },
      () => refresh(),
    );
    channel.subscribe();
    return () => {
      void achievementSupabase.removeChannel(channel);
    };
  }, [user?.id, meetingId, refresh]);

  return {
    messages,
    isLoading,
    profileMap,
    sendMessage,
    deleteMessage,
  };
};
