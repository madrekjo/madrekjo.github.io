import { MessageSquare, Ghost, Trophy, User, AlertCircle } from "lucide-react";
import { StatsCard, StatusBadge } from "@/components/ui";
import { usePlatformStats } from "@/hooks/usePlatformStats";
import { useEffect, useState } from "react";
import { chatClient, anonClient } from "@/lib/supabase-clients";
import { timeAgo } from "@/lib/utils";

export function Dashboard() {
  const { stats, loading, workerStatus } = usePlatformStats(true);
  const [recentChat, setRecentChat] = useState<any[]>([]);
  const [recentAnon, setRecentAnon] = useState<any[]>([]);

  useEffect(() => {
    chatClient
      .from("posts")
      .select("id, content, created_at, user_id, channel, status")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setRecentChat(data ?? []));
    anonClient
      .from("posts")
      .select("id, content, created_at, hidden, status, post_mode")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setRecentAnon(data ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ops-text">لوحة القيادة</h1>
        <p className="text-sm text-ops-dim">نظرة عامة على منظومة مدارك جو</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatsCard label="مستخدمي الشات" value={stats.chatUsers} icon={<User className="h-4 w-4" />} accent="cyan" sub={`${stats.chatActiveToday} نشط اليوم`} />
        <StatsCard label="منشورات الشات" value={stats.chatPosts} icon={<MessageSquare className="h-4 w-4" />} accent="cyan" />
        <StatsCard label="منشورات أنا مجهول" value={stats.anonPosts} icon={<Ghost className="h-4 w-4" />} accent="violet" />
        <StatsCard label="أجهزة محظورة" value={stats.anonBlocked} icon={<AlertCircle className="h-4 w-4" />} accent="red" />
        <StatsCard label="بلاغات مفتوحة" value={stats.anonReportsOpen} icon={<AlertCircle className="h-4 w-4" />} accent="amber" />
        <StatsCard label="مستخدمي الإنجازات" value={stats.achievementUsers} icon={<Trophy className="h-4 w-4" />} accent="green" sub={`${stats.achievementActiveRounds} جولة نشطة`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="ops-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ops-cyan">أحدث منشورات الشات</h3>
            <span className="font-mono text-[10px] text-ops-dim">LIVE FEED</span>
          </div>
          {loading ? (
            <div className="font-mono text-xs text-ops-dim">...تحميل</div>
          ) : recentChat.length === 0 ? (
            <div className="font-mono text-xs text-ops-dim">لا توجد منشورات</div>
          ) : (
            <div className="space-y-2">
              {recentChat.map((p) => (
                <div key={p.id} className="rounded-md border border-ops-border bg-ops-bg px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-ops-dim">{p.channel ?? "عام"}</span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={p.status} />
                      <span className="font-mono text-[10px] text-ops-dim">{timeAgo(p.created_at)}</span>
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-ops-text">{p.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ops-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ops-violet">أحدث منشورات أنا مجهول</h3>
            <span className="font-mono text-[10px] text-ops-dim">LIVE FEED</span>
          </div>
          {loading ? (
            <div className="font-mono text-xs text-ops-dim">...تحميل</div>
          ) : recentAnon.length === 0 ? (
            <div className="font-mono text-xs text-ops-dim">لا توجد منشورات</div>
          ) : (
            <div className="space-y-2">
              {recentAnon.map((p) => (
                <div key={p.id} className="rounded-md border border-ops-border bg-ops-bg px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-ops-dim">{p.post_mode}</span>
                    <span className="flex items-center gap-2">
                      {p.hidden && <span className="text-[10px] text-ops-amber">مخفي</span>}
                      <span className="font-mono text-[10px] text-ops-dim">{timeAgo(p.created_at)}</span>
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-ops-text">{p.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ops-panel p-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase text-ops-dim">حالة النظام</span>
          <StatusBadge
            status={workerStatus === "online" ? "نشط" : workerStatus === "offline" ? "مغلق" : "قيد المراجعة"}
            mapping={{
              "نشط": { label: "متصل", cls: "bg-ops-green/15 text-ops-green border-ops-green/40" },
              "مغلق": { label: "غير متصل", cls: "bg-ops-red/15 text-ops-red border-ops-red/40" },
              "قيد المراجعة": { label: "جاري الفحص", cls: "bg-ops-amber/15 text-ops-amber border-ops-amber/40" },
            }}
          />
          <span className="font-mono text-[10px] text-ops-dim">
            آخر تحديث للبيانات: الآن
          </span>
        </div>
      </div>
    </div>
  );
}
