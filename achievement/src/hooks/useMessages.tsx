import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { useAuth } from "./useAuth";
import { useCallback, useEffect, useRef } from "react";

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

const isSupportMessageQuery = (queryKey: readonly unknown[]) =>
  queryKey[0] === "messages" || queryKey[0] === "admin-messages-all";

const MESSAGE_PAGE_SIZE = 1000;

const fetchMessagePages = async (
  buildQuery: (from: number, to: number) => Promise<{ data: Message[] | null; error: unknown }>,
) => {
  const out: Message[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + MESSAGE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    out.push(...page);
    if (page.length < MESSAGE_PAGE_SIZE) break;
    from += MESSAGE_PAGE_SIZE;
  }
  return out;
};

export const useMessages = (chatWithUserId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const channelInstanceId = useRef(crypto.randomUUID());

  const refreshSupportMessages = useCallback(() => {
    queryClient.invalidateQueries({ predicate: (q) => isSupportMessageQuery(q.queryKey) });
    void queryClient.refetchQueries({ predicate: (q) => isSupportMessageQuery(q.queryKey), type: "active" });
  }, [queryClient]);

  // Get all messages for current user (or all if admin)
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages", user?.id, chatWithUserId],
    queryFn: async () => {
      if (!user) return [];
      if (chatWithUserId) {
        // Get conversation between current user and the other user
        const data = await fetchMessagePages(async (from, to) =>
          await achievementSupabase
            .from("messages")
            .select("*")
            .or(
              `and(sender_id.eq.${user.id},receiver_id.eq.${chatWithUserId}),and(sender_id.eq.${chatWithUserId},receiver_id.eq.${user.id})`
            )
            .order("created_at", { ascending: false })
            .range(from, to),
        );
        return data.reverse();
      }
      // Get all messages for user
      return fetchMessagePages(async (from, to) =>
        await achievementSupabase
          .from("messages")
          .select("*")
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .range(from, to),
      );
    },
    enabled: !!user,
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Unread count for current user
  const unreadCount = messages.filter(
    (m) => m.receiver_id === user?.id && !m.is_read
  ).length;

  // Has admin ever messaged this user?
  const hasAdminConversation = messages.some(
    (m) => m.receiver_id === user?.id
  );

  // Send message
  const sendMessage = useMutation({
    mutationFn: async ({ receiverId, content }: { receiverId: string; content: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await achievementSupabase.from("messages").insert({
        sender_id: user.id,
        receiver_id: receiverId,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refreshSupportMessages();
    },
  });

  // Mark messages as read
  const markAsRead = useMutation({
    mutationFn: async (senderId: string) => {
      if (!user) return;
      const { error } = await achievementSupabase
        .from("messages")
        .update({ is_read: true })
        .eq("sender_id", senderId)
        .eq("receiver_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshSupportMessages();
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channelName = `messages-${user.id}-${chatWithUserId ?? "all"}-${channelInstanceId.current}`;
    const channel = achievementSupabase.channel(channelName);

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      () => {
        refreshSupportMessages();
      }
    );

    channel.subscribe();

    return () => {
      void achievementSupabase.removeChannel(channel);
    };
  }, [user?.id, chatWithUserId, refreshSupportMessages]);

  return {
    messages,
    isLoading,
    unreadCount,
    hasAdminConversation,
    sendMessage,
    markAsRead,
  };
};
