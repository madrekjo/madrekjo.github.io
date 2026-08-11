import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMessages } from "@/hooks/useMessages";
import { useAuth } from "@/hooks/useAuth";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { Bell, Send, Loader2, MessageCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

interface Profile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  isAdmin?: boolean;
}

export const UserNotifications = ({ isAdmin = false }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { messages, unreadCount, hasAdminConversation, sendMessage, markAsRead, isLoading } =
    useMessages();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // ===== Admin profiles (for conversation labels in admin mode) =====
  const { data: profiles = [] } = useQuery({
    queryKey: ["notif-profiles"],
    queryFn: async () => {
      const { data } = await achievementSupabase
        .from("profiles")
        .select("user_id, display_name, avatar_url");
      return (data as Profile[]) ?? [];
    },
    enabled: isAdmin,
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  // ===== Admin: group conversations by the other user =====
  const conversations = useMemo(() => {
    if (!isAdmin || !user) return [];
    const map = new Map<
      string,
      { userId: string; lastContent: string; lastAt: string; unread: number }
    >();
    for (const m of messages) {
      const other = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      const unreadInc = m.receiver_id === user.id && !m.is_read ? 1 : 0;
      const existing = map.get(other);
      if (!existing || new Date(m.created_at) > new Date(existing.lastAt)) {
        map.set(other, {
          userId: other,
          lastContent: m.content,
          lastAt: m.created_at,
          unread: (existing?.unread ?? 0) + unreadInc,
        });
      } else if (existing) {
        existing.unread += unreadInc;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    );
  }, [messages, user, isAdmin]);

  // ===== Non-admin: all support messages across the admin team =====
  const adminId = messages.find((m) => m.receiver_id === user?.id)?.sender_id;
  const conversation = !isAdmin
    ? [...messages]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .filter((msg, index, arr) => {
          if (msg.sender_id !== user?.id) return true;
          return (
            arr.findIndex(
              (m) =>
                m.sender_id === msg.sender_id &&
                m.content === msg.content &&
                new Date(m.created_at).toISOString().slice(0, 19) ===
                  new Date(msg.created_at).toISOString().slice(0, 19)
            ) === index
          );
        })
    : [];

  const handleOpen = () => {
    setOpen(true);
    if (!isAdmin && user && unreadCount > 0) {
      const unreadSenderIds = Array.from(
        new Set(messages.filter((m) => m.receiver_id === user.id && !m.is_read).map((m) => m.sender_id))
      );
      unreadSenderIds.forEach((senderId) => markAsRead.mutate(senderId));
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || !adminId) return;
    sendMessage.mutate({ receiverId: adminId, content: trimmed });
    setText("");
  };

  const goToConversation = (otherUserId: string) => {
    setOpen(false);
    navigate(`/admin/messages?user=${otherUserId}`);
  };

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, conversation.length, conversations.length]);

  return (
    <>
      <Button variant="ghost" size="icon" className="relative" onClick={handleOpen}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground">
            {unreadCount}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md flex flex-col max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {isAdmin ? "صندوق رسائل الدعم" : "رسائل الإدارة"}
            </DialogTitle>
            <DialogDescription>
              {isAdmin
                ? "الرسائل الواردة من المستخدمين — اختر محادثة لفتحها"
                : "محادثتك مع الإدارة"}
            </DialogDescription>
          </DialogHeader>

          {/* ===== ADMIN MODE: list of conversations ===== */}
          {isAdmin ? (
            <>
              <div
                className="flex-1 min-h-[200px] max-h-[420px] border rounded-lg overflow-y-auto"
                ref={scrollRef}
              >
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : conversations.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-8">
                    لا توجد رسائل بعد
                  </p>
                ) : (
                  <ul className="divide-y">
                    {conversations.map((c) => {
                      const p = profileMap.get(c.userId);
                      const name = p?.display_name?.trim() || "مستخدم";
                      return (
                        <li key={c.userId}>
                          <button
                            onClick={() => goToConversation(c.userId)}
                            className="w-full text-right flex items-center gap-3 px-3 py-3 hover:bg-muted/50 transition"
                          >
                            <Avatar className="h-10 w-10 shrink-0">
                              <AvatarImage src={p?.avatar_url || ""} />
                              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                {name[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-foreground truncate">
                                  {name}
                                </span>
                                {c.unread > 0 && (
                                  <Badge className="h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px]">
                                    {c.unread}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {c.lastContent}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setOpen(false);
                  navigate("/admin/messages");
                }}
              >
                <MessageCircle className="h-4 w-4" />
                فتح صندوق الرسائل الكامل
              </Button>
            </>
          ) : (
            <>
              {/* ===== USER MODE ===== */}
              <div
                className="flex-1 min-h-[200px] max-h-[400px] border rounded-lg p-3 overflow-y-auto"
                ref={scrollRef}
              >
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : !hasAdminConversation ? (
                  <p className="text-center text-muted-foreground text-sm py-8">
                    لا توجد رسائل من الإدارة حالياً
                  </p>
                ) : conversation.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-8">لا توجد رسائل</p>
                ) : (
                  <div className="space-y-2">
                    {conversation.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.sender_id === user?.id ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                            msg.sender_id === user?.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          <p>{msg.content}</p>
                          <p
                            className={`text-[10px] mt-1 ${
                              msg.sender_id === user?.id
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            }`}
                          >
                            {new Date(msg.created_at).toLocaleTimeString("ar", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {hasAdminConversation && adminId && (
                <div className="flex gap-2">
                  <Input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="اكتب رداً..."
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!text.trim() || sendMessage.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
