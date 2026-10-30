import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Send,
  Loader2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

/* ============================================================
 * الدعم والمساعدة — مدعوم بمشروع «الإنجاز»
 *
 * القاعدة: romocwtqzdnovfgtmwzb (مشروع الدردشة) متوقفة مؤقتاً،
 * فصفحة الدعم صارت تقرأ وتكتب في مشروع الإنجاز مباشرة:
 *   - جدول public.messages  (sender_id / receiver_id / content / is_read)
 *   - دالة public.get_support_admin_ids() لمعرفة المسؤولين
 * الجلسة تُقرأ من مشروع الإنجاز نفسه (نفس الأصل ⇒ نفس localStorage)،
 * أو تُنشأ عبر نافذة الدخول الموحّد (ticket) دون الحاجة لجلسة دردشة.
 * التصميم بقي كما هو (نفس شكل الدعم القديم).
 * ============================================================ */

const ACHIEVEMENT_SUPABASE_URL = "https://itflhfhsfzrdfpxvlzrv.supabase.co";
const ACHIEVEMENT_SUPABASE_KEY =
  "sb_publishable_3mypt4J1F0sG5RD6oTSZZg_6PNgwoyY";
const SSO_BASE = "https://madrekjo-sso.madrekjo.workers.dev";
const SSO_TARGET = "/achievement/";

const supportDb = createClient(ACHIEVEMENT_SUPABASE_URL, ACHIEVEMENT_SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

interface SupportMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface ConversationGroup {
  userId: string;
  profile: ProfileRow | null;
  messages: SupportMessage[];
  unreadCount: number;
}

const SUGGESTED_QUESTIONS = [
  "هل يمكنك تغيير اسمي؟",
  "ما التحديثات الجديدة التي ستطرأ على الموقع؟",
  "كيف يمكنني تغيير صورتي الشخصية؟",
  "أواجه مشكلة في الموقع",
];

const dedupeMessages = (list: SupportMessage[]) => {
  const seen = new Set<string>();
  const out: SupportMessage[] = [];
  for (const m of list) {
    const key = `${m.sender_id}|${m.content}|${new Date(m.created_at).toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
};

const Support = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const [isStaff, setIsStaff] = useState(false);
  const [adminIds, setAdminIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(true);

  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedConvos, setExpandedConvos] = useState<Set<string>>(new Set());
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const popupCleanupRef = useRef<(() => void) | null>(null);

  /* ---------------- الجلسة (مشروع الإنجاز) ---------------- */

  useEffect(() => {
    let alive = true;

    const syncUser = async () => {
      const { data } = await supportDb.auth.getSession();
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    };

    void (async () => {
      await syncUser();
      // استعادة صامتة من الدخول الموحّد (إن كان المستخدم سجّل دخوله من صفحة /login/).
      const { data } = await supportDb.auth.getSession();
      if (data.session) return;
      try {
        const raw = localStorage.getItem("mdk:sso:session");
        const payload = raw ? JSON.parse(raw) : null;
        const session = payload?.achievement ?? payload?.sections?.achievement;
        if (session?.access_token && session?.refresh_token) {
          await supportDb.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
          await syncUser();
        }
      } catch {
        /* تجاهل */
      }
    })();

    const { data: sub } = supportDb.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      popupCleanupRef.current?.();
    };
  }, []);

  const startLogin = () => {
    popupCleanupRef.current?.();

    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `${SSO_BASE}/login?target=${encodeURIComponent(SSO_TARGET)}`,
      "GoogleAuthPopup",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      toast.error("تم منع النافذة المنبثقة، يرجى السماح بالنوافذ المنبثقة للموقع.");
      return;
    }

    setLoggingIn(true);

    let timer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("message", onMessage);
      popupCleanupRef.current = null;
      setLoggingIn(false);
    };

    const ack = (success: boolean, origin: string) => {
      try {
        popup.postMessage({ type: "GOOGLE_LOGIN_POPUP_CLOSE", success }, origin);
      } catch {
        /* تجاهل */
      }
    };

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "GOOGLE_LOGIN_SUCCESS") return;

      const ticket = event.data?.ticket;
      if (typeof ticket !== "string" || ticket.trim().length === 0) return;

      try {
        const res = await fetch(
          `${SSO_BASE}/session?ticket=${encodeURIComponent(ticket)}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error(`ticket ${res.status}`);
        const payload = await res.json();
        const session = payload?.achievement;
        if (!session?.access_token || !session?.refresh_token) {
          throw new Error("achievement session missing");
        }
        const { error } = await supportDb.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (error) throw error;
        ack(true, event.origin);
        cleanup();
        try {
          popup.close();
        } catch {
          /* تجاهل */
        }
      } catch (err) {
        console.error("[support] login failed", err);
        ack(false, event.origin);
        toast.error("تعذّر إكمال الدخول — حاول مرة أخرى");
      }
    };

    window.addEventListener("message", onMessage);
    timer = setInterval(() => {
      if (popup.closed) cleanup();
    }, 700);
    popupCleanupRef.current = cleanup;
  };

  const signOut = async () => {
    await supportDb.auth.signOut();
    setUser(null);
    setMessages([]);
    setProfiles({});
    setIsStaff(false);
  };

  /* ---------------- البيانات ---------------- */

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // المسؤولون (تُستخدم لمعرفة صلاحية العرض ولإرسال رسالة المستخدم).
      const { data: idsData } = await supportDb.rpc("get_support_admin_ids");
      const ids: string[] = Array.isArray(idsData) ? (idsData as string[]) : [];
      setAdminIds(ids);
      const staff = ids.includes(user.id);
      setIsStaff(staff);

      const query = supportDb
        .from("messages")
        .select("id, sender_id, receiver_id, content, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      const { data, error } = staff
        ? await query
        : await query.or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (error) {
        console.error("[support] load failed", error);
        toast.error("تعذّر تحميل الرسائل");
        setMessages([]);
        return;
      }

      const rows = ((data ?? []) as SupportMessage[]).slice().reverse();
      setMessages(rows);

      if (staff) {
        const userIds = Array.from(
          new Set(
            rows
              .flatMap((m) => [m.sender_id, m.receiver_id])
              .filter((id) => !ids.includes(id)),
          ),
        );

        if (userIds.length) {
          const { data: profs } = await supportDb
            .from("profiles")
            .select("user_id, display_name, avatar_url")
            .in("user_id", userIds);
          const map: Record<string, ProfileRow> = {};
          ((profs ?? []) as ProfileRow[]).forEach((p) => {
            map[p.user_id] = p;
          });
          setProfiles(map);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!authReady) return;
    setLoading(true);
    void load();
  }, [authReady, user?.id, load]);

  // تحديث تلقائي خفيف (بدون Realtime) + عند عودة التبويب.
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => void load(), 15000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id, load]);

  // تعليم رسائل الإدارة كمقروءة (للمستخدم العادي).
  useEffect(() => {
    if (!user || isStaff) return;
    const unread = messages.some((m) => m.receiver_id === user.id && !m.is_read);
    if (!unread) return;
    const t = setTimeout(() => {
      void supportDb
        .from("messages")
        .update({ is_read: true })
        .eq("receiver_id", user.id)
        .eq("is_read", false)
        .then(() => void load());
    }, 5000);
    return () => clearTimeout(t);
  }, [messages, user?.id, isStaff, load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  /* ---------------- الإرسال ---------------- */

  const sendAsUser = async (preset?: string) => {
    const text = (preset ?? content).trim();
    if (!user || !text) return;

    let targets = adminIds;
    if (targets.length === 0) {
      const { data } = await supportDb.rpc("get_support_admin_ids");
      targets = Array.isArray(data) ? (data as string[]) : [];
    }
    if (targets.length === 0) {
      toast.error("لا يوجد مسؤول متاح حالياً، حاول لاحقاً");
      return;
    }

    setSending(true);
    const { error } = await supportDb.from("messages").insert({
      sender_id: user.id,
      receiver_id: targets[0],
      content: text,
    });
    setSending(false);

    if (error) {
      console.error("[support] send failed", error);
      toast.error("تعذّر إرسال الرسالة");
      return;
    }

    setContent("");
    void load();
  };

  const sendAsStaff = async (targetUserId: string) => {
    const text = replyText.trim();
    if (!user || !text || !targetUserId) return;

    setSending(true);
    const { error } = await supportDb.from("messages").insert({
      sender_id: user.id,
      receiver_id: targetUserId,
      content: text,
    });
    setSending(false);

    if (error) {
      console.error("[support] reply failed", error);
      toast.error("تعذّر إرسال الرد");
      return;
    }

    setReplyText("");
    setReplyingTo(null);
    void load();
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supportDb.from("messages").delete().eq("id", id);
    if (error) {
      toast.error("تعذّر حذف الرسالة");
      return;
    }
    toast.success("تم حذف الرسالة");
    void load();
  };

  const deleteConversation = async (userId: string) => {
    const { error } = await supportDb
      .from("messages")
      .delete()
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    if (error) {
      toast.error("تعذّر حذف المحادثة");
      return;
    }
    toast.success("تم حذف المحادثة بالكامل");
    void load();
  };

  const toggleConversation = (userId: string) => {
    setExpandedConvos((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

    if (isStaff && user) {
      void supportDb
        .from("messages")
        .update({ is_read: true })
        .eq("sender_id", userId)
        .eq("receiver_id", user.id)
        .eq("is_read", false)
        .then(() => void load());
    }
  };

  /* ---------------- المشتقات ---------------- */

  const conversations: ConversationGroup[] = (() => {
    if (!isStaff) return [];
    const map = new Map<string, SupportMessage[]>();
    for (const m of messages) {
      const other = adminIds.includes(m.sender_id) ? m.receiver_id : m.sender_id;
      if (!other || other === user?.id) continue;
      // تجاهل محادثات الإدارة مع الإدارة.
      if (adminIds.includes(m.sender_id) && adminIds.includes(m.receiver_id)) continue;
      const list = map.get(other) ?? [];
      list.push(m);
      map.set(other, list);
    }
    const groups: ConversationGroup[] = [];
    map.forEach((list, userId) => {
      groups.push({
        userId,
        profile: profiles[userId] ?? null,
        messages: list,
        unreadCount: list.filter(
          (m) => m.sender_id === userId && m.receiver_id === user?.id && !m.is_read,
        ).length,
      });
    });
    groups.sort((a, b) => {
      const lastA = a.messages[a.messages.length - 1]?.created_at ?? "";
      const lastB = b.messages[b.messages.length - 1]?.created_at ?? "";
      return new Date(lastB).getTime() - new Date(lastA).getTime();
    });
    return groups;
  })();

  const myMessages = dedupeMessages(messages);
  const hasUnreadReplies =
    !isStaff &&
    !!user &&
    messages.some((m) => m.receiver_id === user.id && !m.is_read);

  /* ---------------- العرض ---------------- */

  const timeAgo = (value: string) =>
    formatDistanceToNow(new Date(value), { addSuffix: true, locale: ar });

  if (!authReady) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-lg">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <MessageSquare className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">الدعم والمساعدة</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                سجّل الدخول بحسابك في منصة الإنجاز لتتمكن من إرسال رسالتك للإدارة ومتابعة الردود.
              </p>
            </div>
            <Button className="w-full gap-2" onClick={startLogin} disabled={loggingIn}>
              {loggingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
              {loggingIn ? "جاري فتح نافذة الدخول..." : "تسجيل الدخول باستخدام Google"}
            </Button>
            <p className="text-xs text-muted-foreground">
              أو تواصل معنا عبر البريد:{" "}
              <a className="text-primary underline" href="mailto:madrekjo@gmail.com">
                madrekjo@gmail.com
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const header = (
    <div className="flex items-center gap-2 mb-6">
      <MessageSquare className="w-6 h-6 text-primary" />
      <h1 className="text-2xl font-bold">{isStaff ? "رسائل الدعم" : "تواصل مع الإدارة"}</h1>
      <div className="mr-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => void load()}>
          <RefreshCw className="w-3 h-3" /> تحديث
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          title="تسجيل خروج"
          onClick={() => void signOut()}
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
      </div>
    );
  }

  /* -------- واجهة المسؤول -------- */
  if (isStaff) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {header}

        {conversations.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">لا توجد رسائل بعد</p>
        ) : (
          <div className="space-y-3">
            {conversations.map((convo) => {
              const name = convo.profile?.display_name?.trim() || "مستخدم";
              const expanded = expandedConvos.has(convo.userId);
              return (
                <Card key={convo.userId}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => toggleConversation(convo.userId)}
                        className="flex-1 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={convo.profile?.avatar_url || ""} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-right">
                            <p className="font-medium text-sm">{name}</p>
                            <p className="text-xs text-muted-foreground">
                              {convo.messages.length} رسالة
                              {convo.unreadCount > 0 && (
                                <span className="mr-2 text-primary font-medium">
                                  ({convo.unreadCount} جديد)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        {expanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 shrink-0 mr-1"
                        onClick={() => void deleteConversation(convo.userId)}
                        title="حذف المحادثة بالكامل"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {expanded && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        {convo.messages.map((msg) => {
                          const fromAdmin = adminIds.includes(msg.sender_id);
                          return (
                            <div
                              key={msg.id}
                              className={`p-2 rounded-lg text-sm group relative ${
                                fromAdmin ? "bg-primary/10 ml-8" : "bg-muted mr-8"
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                              <div className="flex items-center justify-between mt-1">
                                <p className="text-xs text-muted-foreground">
                                  {fromAdmin && "🛡️ رد الإدارة • "}
                                  {timeAgo(msg.created_at)}
                                </p>
                                <button
                                  onClick={() => void deleteMessage(msg.id)}
                                  className="p-1 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="حذف"
                                >
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        <div className="mt-2 flex gap-2">
                          <Textarea
                            value={replyingTo === convo.userId ? replyText : ""}
                            onChange={(e) => {
                              setReplyingTo(convo.userId);
                              setReplyText(e.target.value);
                            }}
                            onFocus={() => setReplyingTo(convo.userId)}
                            placeholder="اكتب رد الإدارة..."
                            className="resize-none min-h-[40px] text-sm"
                          />
                          <Button
                            size="icon"
                            className="shrink-0"
                            disabled={sending || replyingTo !== convo.userId || !replyText.trim()}
                            onClick={() => void sendAsStaff(convo.userId)}
                          >
                            {sending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    );
  }

  /* -------- واجهة المستخدم -------- */
  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      {header}
      <p className="text-muted-foreground mb-4 flex items-center gap-1.5 text-sm">
        <ShieldCheck className="w-4 h-4 text-primary" />
        أرسل رسالة للإدارة وسيتم الرد عليك هنا على حسابك.
      </p>

      {hasUnreadReplies && (
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary rounded-lg p-3 mb-4 animate-fade-in">
          <span className="relative flex w-2.5 h-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
          </span>
          <p className="text-sm font-medium">لديك رد جديد من الإدارة</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {SUGGESTED_QUESTIONS.map((q, i) => (
          <Button
            key={i}
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={sending}
            onClick={() => void sendAsUser(q)}
          >
            {q}
          </Button>
        ))}
      </div>

      <div className="space-y-2 mb-4 max-h-[420px] overflow-y-auto">
        {myMessages.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">
            لم ترسل أي رسائل بعد
          </p>
        ) : (
          myMessages.map((msg) => {
            const mine = msg.sender_id === user.id;
            return (
              <div
                key={msg.id}
                className={`p-3 rounded-lg text-sm ${
                  mine
                    ? "bg-primary/10 ml-8"
                    : `bg-muted mr-8 ${!msg.is_read ? "ring-2 ring-primary/50" : ""}`
                }`}
              >
                {!mine && (
                  <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                    🛡️ رد الإدارة
                    {!msg.is_read && (
                      <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold rounded-full px-1.5 py-0.5">
                        جديد
                      </span>
                    )}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className="text-xs text-muted-foreground mt-1">{timeAgo(msg.created_at)}</p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="اكتب رسالتك هنا..."
          className="resize-none min-h-[40px] text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendAsUser();
            }
          }}
        />
        <Button
          size="icon"
          className="shrink-0"
          disabled={sending || !content.trim()}
          onClick={() => void sendAsUser()}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
};

export default Support;
