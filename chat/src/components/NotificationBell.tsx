import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, Heart, MessageCircle, CornerDownLeft, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";

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
}

const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data) return;

    const actorIds = [...new Set(data.map(n => n.actor_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", actorIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    const enriched = data.map(n => ({
      ...n,
      actor_profile: profileMap.get(n.actor_id) || null,
    }));

    setNotifications(enriched);
  };

  useEffect(() => {
    fetchNotifications();

    if (!user) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleNotificationClick = (n: Notification) => {
    if (n.type === "support_reply") {
      setOpen(false);
      navigate("/support");
      return;
    }
    if (n.post_id) {
      setOpen(false);
      navigate(`/?post=${n.post_id}`);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "like": return <Heart className="w-4 h-4 text-destructive fill-current" />;
      case "comment": return <MessageCircle className="w-4 h-4 text-primary" />;
      case "reply": return <CornerDownLeft className="w-4 h-4 text-primary" />;
      case "support_reply": return <MessageSquare className="w-4 h-4 text-primary" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  const getText = (type: string, actorName: string) => {
    switch (type) {
      case "like": return `${actorName} أعجب بمنشورك`;
      case "comment": return `${actorName} علّق على منشورك`;
      case "reply": return `${actorName} رد على تعليقك`;
      case "support_reply": return "الإدارة ردّت على رسالتك في الدعم";
      default: return `${actorName} تفاعل معك`;
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">الإشعارات</h3>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              تحديد الكل كمقروء
            </button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              لا توجد إشعارات
            </div>
          ) : (
            <div>
              {notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex items-start gap-3 p-3 border-b last:border-0 transition-colors cursor-pointer hover:bg-muted/50 ${
                    !n.is_read ? "bg-primary/5" : ""
                  }`}
                >
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={n.actor_profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {n.actor_profile?.full_name?.charAt(0) || "م"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {getIcon(n.type)}
                      <p className="text-sm leading-snug">
                        {getText(n.type, n.actor_profile?.full_name || "مستخدم")}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ar })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t">
          <button
            onClick={() => { setOpen(false); navigate("/notifications"); }}
            className="w-full text-center text-sm text-primary hover:underline py-1"
          >
            عرض جميع الإشعارات
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
