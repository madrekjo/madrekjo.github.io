import { useEffect, useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, Heart, MessageCircle, CornerDownLeft, AtSign, Loader2, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

function dedupe(list: Notification[]): Notification[] {
  const seen = new Set<string>();
  return list.filter(n => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}

interface Notification {
  id: string;
  user_id: string;
  actor_id: string;
  type: string;
  post_id: string | null;
  comment_id: string | null;
  is_read: boolean;
  created_at: string;
  actor_profile?: { full_name: string; avatar_url: string | null } | null;
  is_all?: boolean;
}

const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const BATCH = 10;

  const fetchBatch = useCallback(async (offset: number, append: boolean) => {
    if (!user) return;
    if (append) setLoadingMore(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, actor_id, type, post_id, comment_id, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + BATCH - 1);
    if (error || !data) { if (append) setLoadingMore(false); else setLoading(false); return; }
    const actorIds = [...new Set(data.map(n => n.actor_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", actorIds);
    const map = new Map(profiles?.map(p => [p.user_id, p]) || []);
    const enriched = data.map(n => ({ ...n, actor_profile: map.get(n.actor_id) || null, is_all: false }));
    setNotifications(prev => append ? dedupe([...prev, ...enriched]) : enriched);
    setHasMore(data.length === BATCH);
    if (append) setLoadingMore(false); else setLoading(false);
  }, [user]);

  // عند كل فتح: نحذف الإشعارات الأقدم من آخر 10 تلقائياً ليُبقى فقط 10 إشعارات لكل مستخدم
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: keep } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(BATCH);
      const keepIds: string[] = (keep || []).map(n => n.id);
      if (keepIds.length) {
        await supabase
          .from("notifications")
          .delete()
          .eq("user_id", user.id)
          .not("id", "in", `(${keepIds.join(",")})`);
      }
      await fetchBatch(0, false);
      await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    })();
  }, [user, fetchBatch]);

  const loadMore = async () => {
    await fetchBatch(notifications.length, true);
  };


  const getIcon = (type: string) => {
    switch (type) {
      case "like": return <Heart className="w-4 h-4 text-destructive fill-current" />;
      case "comment": return <MessageCircle className="w-4 h-4 text-primary" />;
      case "reply": return <CornerDownLeft className="w-4 h-4 text-primary" />;
      case "mention": return <AtSign className="w-4 h-4 text-primary" />;
      case "support_reply": return <MessageSquare className="w-4 h-4 text-primary" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  const getText = (type: string, name: string, isAll?: boolean) => {
    switch (type) {
      case "like": return `${name} أعجب بمنشورك`;
      case "comment": return `${name} علّق على منشورك`;
      case "reply": return `${name} رد على تعليقك`;
      case "mention": return isAll ? `${name} منشن الجميع في منشور` : `${name} منشنك`;
      case "support_reply": return "الإدارة ردّت على رسالتك في الدعم";
      default: return `${name} تفاعل معك`;
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Bell className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">جميع الإشعارات</h1>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">لا توجد إشعارات</div>
      ) : (
        <div className="bg-card border rounded-xl divide-y">
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => n.type === "support_reply" ? navigate("/support") : (n.post_id && navigate(`/?post=${n.post_id}`))}
              className="flex items-start gap-3 p-4 hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <Avatar className="w-10 h-10 shrink-0">
                <AvatarImage src={n.actor_profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {n.actor_profile?.full_name?.charAt(0) || "م"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {getIcon(n.type)}
                  <p className="text-sm">{getText(n.type, n.actor_profile?.full_name || "مستخدم", n.is_all)}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ar })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && notifications.length > 0 && hasMore && (
        <div className="mt-4 text-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "عرض المزيد"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default Notifications;
