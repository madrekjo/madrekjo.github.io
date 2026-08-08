import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Flag, Trash2, Check, X, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { formatDisplayName } from "@/lib/displayName";

const REASON_LABEL: Record<string, string> = {
  offensive: "محتوى مسيء",
  spam: "سبام",
  misinformation: "معلومات خاطئة",
  harassment: "تحرش",
  other: "أخرى",
};

interface Report {
  id: string;
  post_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  post?: any;
  reporter?: any;
}

const AdminReports = () => {
  const { isAdmin, isModerator, user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [tab, setTab] = useState<"pending" | "resolved" | "dismissed">("pending");
  const [loading, setLoading] = useState(true);

  const isStaff = isAdmin || isModerator;

  const fetchReports = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("post_reports")
      .select("*")
      .eq("status", tab)
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (data || []) as Report[];
    const postIds = Array.from(new Set(rows.map(r => r.post_id)));
    const reporterIds = Array.from(new Set(rows.map(r => r.reporter_id)));

    const [postsRes, profsRes] = await Promise.all([
      postIds.length ? supabase.from("posts").select("id, content, image_url, video_url, user_id, deleted_at, profiles!posts_user_id_profiles_fkey(full_name, avatar_url, generation, field)").in("id", postIds) : Promise.resolve({ data: [] } as any),
      reporterIds.length ? supabase.from("profiles").select("user_id, full_name, generation, field").in("user_id", reporterIds) : Promise.resolve({ data: [] } as any),
    ]);
    const postMap = new Map((postsRes.data || []).map((p: any) => [p.id, p]));
    const profMap = new Map((profsRes.data || []).map((p: any) => [p.user_id, p]));

    setReports(rows.map(r => ({
      ...r,
      post: postMap.get(r.post_id),
      reporter: profMap.get(r.reporter_id),
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (isStaff) fetchReports();
  }, [isStaff, tab]);

  if (!isStaff) return <Navigate to="/" replace />;

  const deletePost = async (postId: string, reportId: string) => {
    if (!confirm("حذف المنشور نهائياً؟")) return;
    const { error } = await (supabase as any).rpc("hard_delete_post", { _post_id: postId });
    if (error) { toast.error("فشل الحذف"); return; }
    await (supabase as any).from("post_reports").update({ status: "resolved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq("id", reportId);
    toast.success("تم حذف المنشور وحسم البلاغ");
    fetchReports();
  };

  const setStatus = async (reportId: string, status: "resolved" | "dismissed") => {
    const { error } = await (supabase as any).from("post_reports").update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq("id", reportId);
    if (error) toast.error("فشل التحديث");
    else { toast.success(status === "dismissed" ? "تم تجاهل البلاغ" : "تم حسم البلاغ"); fetchReports(); }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <Flag className="w-6 h-6 text-destructive" />
        <h1 className="text-2xl font-bold">إدارة البلاغات</h1>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <Button variant={tab === "pending" ? "default" : "outline"} size="sm" onClick={() => setTab("pending")}>معلّقة</Button>
        <Button variant={tab === "resolved" ? "default" : "outline"} size="sm" onClick={() => setTab("resolved")}>محلولة</Button>
        <Button variant={tab === "dismissed" ? "default" : "outline"} size="sm" onClick={() => setTab("dismissed")}>متجاهلة</Button>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : reports.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">لا توجد بلاغات في هذه القائمة</p>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <Card key={r.id} className="border-destructive/30">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 font-medium">
                      {REASON_LABEL[r.reason] || r.reason}
                    </span>
                    <span className="text-muted-foreground">بلّغ: <b>{formatDisplayName(r.reporter)}</b></span>
                  </div>
                  <span className="text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ar })}</span>
                </div>

                {r.details && <p className="text-sm bg-muted/60 rounded p-2">💬 {r.details}</p>}

                {r.post ? (
                  <div className="border rounded-lg p-3 bg-background">
                    <p className="text-xs text-muted-foreground mb-1">
                      من: <b>{formatDisplayName(r.post.profiles)}</b>
                      {r.post.deleted_at && <span className="text-destructive mr-2">🗑️ محذوف</span>}
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words line-clamp-4">{r.post.content}</p>
                    {r.post.image_url && <img src={r.post.image_url} alt="" className="rounded mt-2 max-h-40 object-cover" />}
                    {r.post.video_url && <video src={r.post.video_url} controls className="rounded mt-2 max-h-40 w-full" />}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">المنشور تم حذفه</p>
                )}

                {tab === "pending" && (
                  <div className="flex gap-2 flex-wrap justify-end">
                    {r.post && !r.post.deleted_at && (
                      <Link to={`/?post=${r.post_id}`}>
                        <Button variant="outline" size="sm" className="gap-1"><ExternalLink className="w-4 h-4" /> فتح المنشور</Button>
                      </Link>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setStatus(r.id, "dismissed")} className="gap-1">
                      <X className="w-4 h-4" /> تجاهل
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setStatus(r.id, "resolved")} className="gap-1">
                      <Check className="w-4 h-4" /> تم الحسم
                    </Button>
                    {r.post && !r.post.deleted_at && (
                      <Button variant="destructive" size="sm" onClick={() => deletePost(r.post_id, r.id)} className="gap-1">
                        <Trash2 className="w-4 h-4" /> حذف المنشور
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminReports;
