import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePresence } from "@/contexts/PresenceContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { X, Clock, History, UserX, Trophy, Medal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const RANK_ICONS = [
  <Trophy key="1" className="w-3.5 h-3.5 text-yellow-500" />,
  <Medal key="2" className="w-3.5 h-3.5 text-gray-400" />,
  <Medal key="3" className="w-3.5 h-3.5 text-amber-600" />,
];

const ACTIVITY_WINDOW_MIN = 10;

interface ActivityRow {
  user_id: string;
  name: string;
  avatar_url: string | null;
  gender: string | null;
  is_admin: boolean;
  is_live: boolean;
  joined_at?: number;
  last_seen_at?: string;
}

const ActivityPanel = ({ onClose }: { onClose: () => void }) => {
  const { user } = useAuth();
  const { activeUsers } = usePresence();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [timeoutMinutes, setTimeoutMinutes] = useState(30);
  const [timeoutReason, setTimeoutReason] = useState(" قضيت وقت كثير في الدردشة");
  const [givingTimeout, setGivingTimeout] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [dbActive, setDbActive] = useState<any[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshDb = useCallback(async () => {
    const since = new Date(Date.now() - ACTIVITY_WINDOW_MIN * 60 * 1000).toISOString();
    const [profRes, rolesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url, gender, is_banned, chat_banned, last_seen_at")
        .gt("last_seen_at", since),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
    ]);
    const adminIds = new Set((rolesRes.data || []).map((r: any) => r.user_id));
    const rows = (profRes.data || [])
      .filter((p: any) => !p.is_banned && !p.chat_banned)
      .map((p: any) => ({
        user_id: p.user_id,
        name: p.full_name || "مستخدم",
        avatar_url: p.avatar_url,
        gender: p.gender,
        is_admin: adminIds.has(p.user_id),
        is_live: false,
        last_seen_at: p.last_seen_at,
      }));
    setDbActive(rows);
  }, []);

  useEffect(() => {
    refreshDb();
    const timer = setInterval(refreshDb, 15000);
    return () => clearInterval(timer);
  }, [refreshDb]);

  const merged: ActivityRow[] = (() => {
    const map = new Map<string, ActivityRow>();
    for (const p of activeUsers) {
      map.set(p.user_id, {
        user_id: p.user_id,
        name: p.name,
        avatar_url: p.avatar_url,
        gender: p.gender,
        is_admin: p.is_admin,
        is_live: true,
        joined_at: p.joined_at,
      });
    }
    for (const r of dbActive) {
      const existing = map.get(r.user_id);
      if (existing) {
        existing.last_seen_at = r.last_seen_at;
      } else {
        map.set(r.user_id, r);
      }
    }
    const live = [...map.values()]
      .filter(u => u.is_live && !u.is_admin)
      .sort((a, b) => (a.joined_at || 0) - (b.joined_at || 0));
    const recent = [...map.values()]
      .filter(u => !u.is_live && !u.is_admin)
      .sort((a, b) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime());
    return [...live, ...recent];
  })();

  const top10 = merged.slice(0, 10);
  const restCount = merged.length - top10.length;

  const formatDuration = (joinedAt: number) => {
    const diff = now - joinedAt;
    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}س ${minutes}د ${seconds}ث`;
    if (minutes > 0) return `${minutes}د ${seconds}ث`;
    return `${seconds}ث`;
  };

  const formatAgo = (iso: string) => {
    const diff = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
    if (diff < 1) return "الآن";
    if (diff < 60) return `منذ ${diff} د`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `منذ ${h}س ${m}د`;
  };

  const handleTimeout = async () => {
    if (!selectedUser) return;
    setGivingTimeout(true);
    const timeoutUntil = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({ timeout_until: timeoutUntil } as any)
      .eq("user_id", selectedUser.user_id);
    if (error) {
      toast.error("فشل تطبيق التايم اوت");
    } else {
      toast.success(`تم تطبيق تايم اوت على ${selectedUser.name} لمدة ${timeoutMinutes} دقيقة`);
      setSelectedUser(null);
    }
    setGivingTimeout(false);
  };

  return (
    <div className="bg-card border rounded-xl p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">
          متصلون ونشطون الآن ({merged.length})
          <span className="text-[10px] font-normal text-muted-foreground block mt-0.5">
            خلال آخر {ACTIVITY_WINDOW_MIN} دقائق من النشر/التعليق/الإعجاب
          </span>
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {merged.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">لا يوجد نشاط حالياً</p>
      ) : (
        <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
          {top10.map((u, i) => (
            <div
              key={u.user_id}
              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${selectedUser?.user_id === u.user_id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"}`}
              onClick={() => setSelectedUser(selectedUser?.user_id === u.user_id ? null : u)}
            >
              <span className="w-5 text-center shrink-0">
                {i < 3 ? RANK_ICONS[i] : <span className="text-xs text-muted-foreground font-bold">{i + 1}</span>}
              </span>
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarImage src={u.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {u.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              {u.gender === "male" && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />}
              {u.gender === "female" && <span className="w-2.5 h-2.5 rounded-full bg-pink-500 shrink-0" />}
              <span className="text-sm font-medium flex-1 truncate">{u.name}</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                {u.is_live ? (
                  <>
                    <span className="relative flex w-2 h-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full w-2 h-2 bg-green-500" />
                    </span>
                    {formatDuration(u.joined_at!)}
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3" />
                    {u.last_seen_at ? formatAgo(u.last_seen_at) : "—"}
                  </>
                )}
              </span>
            </div>
          ))}
          {restCount > 0 && (
            <p className="text-xs text-muted-foreground text-center py-1">+ {restCount} نشط آخر</p>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
        <History className="w-3 h-3" />
        النقطة الخضراء = المتصل الآن مباشرة • المؤقت = نشاطه داخل آخر {ACTIVITY_WINDOW_MIN} دقائق
      </p>

      {selectedUser && !selectedUser.is_admin && (
        <div className="mt-3 p-3 bg-muted/50 rounded-lg border space-y-2">
          <p className="text-xs font-medium">تطبيق تايم اوت على {selectedUser.name}</p>
          <Input
            type="number"
            value={timeoutMinutes}
            onChange={e => setTimeoutMinutes(Number(e.target.value))}
            min={1}
            max={1440}
            className="h-8 text-xs"
            placeholder="المدة بالدقائق"
          />
          <Input
            value={timeoutReason}
            onChange={e => setTimeoutReason(e.target.value)}
            className="h-8 text-xs"
            placeholder="رسالة السبب"
          />
          <Button size="sm" variant="destructive" onClick={handleTimeout} disabled={givingTimeout} className="gap-1 w-full">
            <UserX className="w-3 h-3" />
            {givingTimeout ? "جاري التطبيق..." : `تايم اوت ${timeoutMinutes} دقيقة`}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ActivityPanel;