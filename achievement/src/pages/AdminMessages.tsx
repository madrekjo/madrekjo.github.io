import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, ArrowRight, MessageCircle, UserCog, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LeaderboardUserDialog } from "@/components/LeaderboardUserDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Msg {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}
interface Profile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

const MESSAGE_PAGE_SIZE = 1000;

const isSupportMessagesQuery = (queryKey: readonly unknown[]) =>
  queryKey[0] === "admin-messages-all" || queryKey[0] === "messages";

const dedupeThreadMessages = (items: Msg[]) => {
  const seen = new Set<string>();
  const out: Msg[] = [];
  for (const m of items) {
    const key = `${m.sender_id}|${m.content}|${new Date(m.created_at).toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
};

const AdminMessages = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loadingAdmin } = useAdmin();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const channelNameRef = useRef(crypto.randomUUID());

  const refreshSupportMessages = useCallback(() => {
    queryClient.invalidateQueries({ predicate: (q) => isSupportMessagesQuery(q.queryKey) });
    void queryClient.refetchQueries({ predicate: (q) => isSupportMessagesQuery(q.queryKey), type: "active" });
  }, [queryClient]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
    if (!loadingAdmin && user && !isAdmin) navigate("/dashboard");
  }, [authLoading, user, loadingAdmin, isAdmin, navigate]);

  // Auto-select from ?user=... query param
  useEffect(() => {
    const u = searchParams.get("user");
    if (u) setActiveUserId(u);
  }, [searchParams]);

  // Load all admin ids to identify the non-admin party in each thread
  const { data: adminIds = [], isLoading: loadingAdminIds } = useQuery({
    queryKey: ["all-admin-ids"],
    queryFn: async () => {
      const { data, error } = await achievementSupabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id as string);
    },
    enabled: isAdmin,
  });
  const adminIdSet = useMemo(() => new Set(adminIds), [adminIds]);

  // ALL support messages — admins can SELECT all via RLS, so every admin sees every thread.
  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ["admin-messages-all"],
    queryFn: async () => {
      const out: Msg[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await achievementSupabase
          .from("messages")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + MESSAGE_PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data as Msg[]) ?? [];
        out.push(...page);
        if (page.length < MESSAGE_PAGE_SIZE) break;
        from += MESSAGE_PAGE_SIZE;
      }
      return out;
    },
    enabled: !!user && isAdmin && !loadingAdminIds,
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Profiles for sidebar
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-msg-profiles"],
    queryFn: async () => {
      const { data, error } = await achievementSupabase
        .from("profiles")
        .select("user_id, display_name, avatar_url");
      if (error) throw error;
      return (data as Profile[]) ?? [];
    },
    enabled: isAdmin,
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  // Group conversations by the non-admin user in each thread (skip admin↔admin chats)
  const conversations = useMemo(() => {
    if (!user) return [];
    const map = new Map<string, { userId: string; lastMsg: Msg; unread: number }>();
    for (const m of messages) {
      const senderIsAdmin = adminIdSet.has(m.sender_id);
      const receiverIsAdmin = adminIdSet.has(m.receiver_id);
      if (senderIsAdmin && receiverIsAdmin) continue;
      const other = senderIsAdmin ? m.receiver_id : m.sender_id;
      const existing = map.get(other);
      const unreadInc = m.receiver_id === user.id && !m.is_read ? 1 : 0;
      if (!existing || new Date(m.created_at) > new Date(existing.lastMsg.created_at)) {
        map.set(other, { userId: other, lastMsg: m, unread: (existing?.unread ?? 0) + unreadInc });
      } else {
        existing.unread += unreadInc;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMsg.created_at).getTime() - new Date(a.lastMsg.created_at).getTime()
    );
  }, [messages, user, adminIdSet]);

  // Active conversation: all messages between selected user and ANY admin, deduped
  const activeConversation = useMemo(() => {
    if (!user || !activeUserId) return [];
    const filtered = messages
      .filter(
        (m) =>
          (m.sender_id === activeUserId && adminIdSet.has(m.receiver_id)) ||
          (m.receiver_id === activeUserId && adminIdSet.has(m.sender_id))
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return dedupeThreadMessages(filtered);
  }, [messages, user, activeUserId, adminIdSet]);

  // Realtime
  useEffect(() => {
    if (!user || !isAdmin) return;
    const ch = achievementSupabase
      .channel(`admin-msgs-${user.id}-${channelNameRef.current}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        refreshSupportMessages();
      })
      .subscribe();
    return () => {
      void achievementSupabase.removeChannel(ch);
    };
  }, [user?.id, isAdmin, refreshSupportMessages]);

  // Auto-scroll & mark as read on open conversation
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation.length]);

  useEffect(() => {
    const markRead = async () => {
      if (!user || !activeUserId) return;
      const hasUnread = messages.some(
        (m) => m.sender_id === activeUserId && m.receiver_id === user.id && !m.is_read
      );
      if (!hasUnread) return;
      await achievementSupabase
        .from("messages")
        .update({ is_read: true })
        .eq("sender_id", activeUserId)
        .eq("receiver_id", user.id)
        .eq("is_read", false);
      refreshSupportMessages();
    };
    markRead();
  }, [activeUserId, messages, user, refreshSupportMessages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !activeUserId || !user) return;
    setSending(true);
    const { error } = await achievementSupabase.from("messages").insert({
      sender_id: user.id,
      receiver_id: activeUserId,
      content: trimmed,
    });
    setSending(false);
    if (error) {
      toast.error("تعذّر إرسال الرسالة");
      return;
    }
    setText("");
    refreshSupportMessages();
  };

  // Fetch email for active conversation user
  useEffect(() => {
    if (!activeUserId) {
      setActiveEmail(null);
      return;
    }
    setActiveEmail(null);
    (async () => {
      const { data, error } = await achievementSupabase.functions.invoke("admin-user-actions", {
        body: { action: "get_user_email", userId: activeUserId },
      });
      if (!error && data?.email) setActiveEmail(data.email);
    })();
  }, [activeUserId]);

  const handleDeleteConversation = async () => {
    if (!user || !activeUserId) return;
    setDeleting(true);
    const { error } = await achievementSupabase
      .from("messages")
      .delete()
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${activeUserId}),and(sender_id.eq.${activeUserId},receiver_id.eq.${user.id})`
      );
    setDeleting(false);
    if (error) {
      toast.error("تعذّر حذف المحادثة");
      return;
    }
    toast.success("تم حذف المحادثة");
    setConfirmDeleteOpen(false);
    setActiveUserId(null);
    refreshSupportMessages();
  };

  const handleDeleteMessage = async (id: string) => {
    const { error } = await achievementSupabase.from("messages").delete().eq("id", id);
    if (error) {
      toast.error("تعذّر حذف الرسالة");
      return;
    }
    refreshSupportMessages();
  };

  if (authLoading || loadingAdmin || (isAdmin && loadingAdminIds)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeProfile = activeUserId ? profileMap.get(activeUserId) : null;
  const activeName = activeProfile?.display_name?.trim() || "مستخدم";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">صندوق رسائل الدعم</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-12rem)]">
          {/* Conversation list */}
          <aside
            className={`md:col-span-1 rounded-xl border bg-card overflow-y-auto ${
              activeUserId ? "hidden md:block" : "block"
            }`}
          >
            {loadingMsgs ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8 px-4">
                لا توجد محادثات بعد
              </p>
            ) : (
              <ul className="divide-y">
                {conversations.map((c) => {
                  const p = profileMap.get(c.userId);
                  const name = p?.display_name?.trim() || "مستخدم";
                  const isActive = c.userId === activeUserId;
                  return (
                    <li key={c.userId}>
                      <button
                        onClick={() => setActiveUserId(c.userId)}
                        className={`w-full text-right flex items-center gap-3 px-3 py-3 hover:bg-muted/50 transition ${
                          isActive ? "bg-muted/60" : ""
                        }`}
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={p?.avatar_url || ""} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                            {name[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground truncate">{name}</span>
                            {c.unread > 0 && (
                              <Badge className="h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px]">
                                {c.unread}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {c.lastMsg.content}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Conversation view */}
          <section
            className={`md:col-span-2 rounded-xl border bg-card flex flex-col ${
              activeUserId ? "flex" : "hidden md:flex"
            }`}
          >
            {!activeUserId ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                اختر محادثة لعرضها
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-3 border-b">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="md:hidden"
                    onClick={() => setActiveUserId(null)}
                  >
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                  <button
                    type="button"
                    onClick={() => setProfileOpen(true)}
                    className="flex items-center gap-3 flex-1 text-right rounded-lg p-1 -m-1 hover:bg-muted/50 transition"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={activeProfile?.avatar_url || ""} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                        {activeName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{activeName}</p>
                      <p className="text-xs text-muted-foreground truncate" dir="ltr">
                        {activeEmail ?? "..."}
                      </p>
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() => setProfileOpen(true)}
                  >
                    <UserCog className="h-4 w-4" />
                    <span className="hidden sm:inline">البروفايل</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setConfirmDeleteOpen(true)}
                    title="حذف المحادثة"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">حذف</span>
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/10">
                  {activeConversation.map((m) => {
                    // Any admin's message shows on the right as الإدارة, so other admins
                    // can clearly see staff replies vs. the user's messages.
                    const mine = adminIdSet.has(m.sender_id);
                    const fromOtherAdmin = mine && m.sender_id !== user?.id;
                    return (
                      <div
                        key={m.id}
                        className={`group flex items-end gap-1 ${mine ? "justify-end" : "justify-start"}`}
                      >
                        {mine && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                            onClick={() => handleDeleteMessage(m.id)}
                            title="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <div
                          className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                            mine
                              ? "bg-primary text-primary-foreground"
                              : "bg-card border text-foreground"
                          }`}
                        >
                          {fromOtherAdmin && (
                            <p className="text-[10px] font-semibold mb-0.5 opacity-80">
                              رد من الإدارة
                            </p>
                          )}
                          <p className="whitespace-pre-wrap">{m.content}</p>
                          <p
                            className={`text-[10px] mt-1 ${
                              mine ? "text-primary-foreground/70" : "text-muted-foreground"
                            }`}
                          >
                            {new Date(m.created_at).toLocaleTimeString("ar", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        {!mine && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                            onClick={() => handleDeleteMessage(m.id)}
                            title="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <div className="p-3 border-t flex gap-2">
                  <Input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="اكتب رداً..."
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    className="flex-1"
                  />
                  <Button size="icon" onClick={handleSend} disabled={!text.trim() || sending}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {activeUserId && (
        <LeaderboardUserDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          userId={activeUserId}
          userName={activeName}
        />
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المحادثة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف جميع الرسائل بينك وبين {activeName} نهائياً. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminMessages;
