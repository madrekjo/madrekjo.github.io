import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarDays, Plus, Loader2, Trash2, Pin, Send, ImageIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { compressImage } from "@/lib/mediaCompression";
import { uploadToCloudinary } from "@/lib/cloudinary";

interface Schedule {
  id: string; user_id: string; title: string | null; image_url: string;
  is_pinned: boolean; created_at: string;
  profile?: { full_name: string; avatar_url: string | null } | null;
}
interface ScheduleComment {
  id: string; schedule_id: string; user_id: string; content: string; is_pinned: boolean; created_at: string;
  profile?: { full_name: string; avatar_url: string | null } | null;
}

const Schedules = () => {
  const { user, isAdmin, isModerator } = useAuth();
  const isStaff = isAdmin || isModerator;
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [comments, setComments] = useState<Record<string, ScheduleComment[]>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAll();
    const ch = supabase.channel("schedules-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "schedules" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_comments" }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchAll = async () => {
    try {
      const { data: schs, error: schErr } = await (supabase as any)
        .from("schedules")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (schErr) throw schErr;
      const scheduleIds = (schs || []).map((s: any) => s.id);
      const { data: cmts } = scheduleIds.length
        ? await (supabase as any)
            .from("schedule_comments")
            .select("*")
            .in("schedule_id", scheduleIds)
            .order("is_pinned", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(500)
        : { data: [] };
      const ids = Array.from(new Set([...(schs || []).map((s: any) => s.user_id), ...(cmts || []).map((c: any) => c.user_id)]));
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", ids as string[])
        : { data: [] };

      setSchedules((schs || []).map((s: any) => ({ ...s, profile: profiles?.find(p => p.user_id === s.user_id) || null })));
      const grouped: Record<string, ScheduleComment[]> = {};
      (cmts || []).forEach((c: any) => {
        const enr = { ...c, profile: profiles?.find(p => p.user_id === c.user_id) || null };
        grouped[c.schedule_id] = [...(grouped[c.schedule_id] || []), enr];
      });
      setComments(grouped);
    } catch (err) {
      console.error("Failed to load schedules", err);
      toast.error("تعذر تحميل الجداول");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!user || !file) return;
    setUploading(true);
    const compressed = await compressImage(file);
    let imageUrl: string;
    try {
      imageUrl = await uploadToCloudinary(compressed);
    } catch {
      toast.error("فشل رفع الصورة"); setUploading(false); return;
    }
    const { error } = await (supabase as any).from("schedules").insert({
      user_id: user.id, title: title.trim() || null, image_url: imageUrl,
    });
    if (error) toast.error("فشل النشر");
    else { toast.success("تم نشر الجدول"); setOpen(false); setTitle(""); setFile(null); fetchAll(); }
    setUploading(false);
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm("حذف الجدول؟")) return;
    const { error } = await (supabase as any).from("schedules").delete().eq("id", id);
    if (error) toast.error("فشل الحذف"); else { toast.success("تم الحذف"); fetchAll(); }
  };

  const handlePinSchedule = async (id: string, val: boolean) => {
    const { error } = await (supabase as any).from("schedules").update({ is_pinned: val }).eq("id", id);
    if (error) toast.error("فشل"); else fetchAll();
  };

  const handleAddComment = async (scheduleId: string) => {
    if (!user || !commentText[scheduleId]?.trim()) return;
    const { error } = await (supabase as any).from("schedule_comments").insert({
      schedule_id: scheduleId, user_id: user.id, content: commentText[scheduleId].trim(),
    });
    if (error) toast.error("فشل التعليق");
    else { setCommentText(p => ({ ...p, [scheduleId]: "" })); fetchAll(); }
  };

  const handleDeleteComment = async (id: string) => {
    const { error } = await (supabase as any).from("schedule_comments").delete().eq("id", id);
    if (error) toast.error("فشل الحذف"); else fetchAll();
  };

  const handlePinComment = async (id: string, val: boolean) => {
    const { error } = await (supabase as any).from("schedule_comments").update({ is_pinned: val }).eq("id", id);
    if (error) toast.error("فشل"); else fetchAll();
  };

  if (loading) return <div className="container mx-auto px-4 py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">الجداول</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="w-4 h-4" />رفع جدول</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>رفع صورة جدول</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="عنوان (اختياري)" value={title} onChange={e => setTitle(e.target.value)} />
              <Input ref={fileRef} type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
              {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
              <Button onClick={handleUpload} disabled={uploading || !file} className="w-full">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "نشر"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {schedules.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">لا توجد جداول حالياً</p>
      ) : (
        <div className="space-y-4">
          {schedules.map(s => (
            <Card key={s.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={s.profile?.avatar_url || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">{s.profile?.full_name?.charAt(0) || "م"}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1">
                        {s.profile?.full_name}
                        {s.is_pinned && <Pin className="w-3 h-3 text-primary fill-primary" />}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ar })}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {isStaff && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePinSchedule(s.id, !s.is_pinned)}>
                        <Pin className={`w-4 h-4 ${s.is_pinned ? "text-primary fill-primary" : ""}`} />
                      </Button>
                    )}
                    {(s.user_id === user?.id || isStaff) && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteSchedule(s.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {s.title && <p className="text-sm font-medium">{s.title}</p>}
                <a href={s.image_url} target="_blank" rel="noreferrer">
                  <img src={s.image_url} alt={s.title || "جدول"} className="w-full rounded-lg border" loading="lazy" />
                </a>

                <div className="space-y-2 border-t pt-3">
                  {(comments[s.id] || []).map(c => (
                    <div key={c.id} className={`flex items-start gap-2 p-2 rounded-lg group ${c.is_pinned ? "bg-primary/5 border border-primary/20" : "bg-muted/50"}`}>
                      <Avatar className="w-7 h-7 shrink-0">
                        <AvatarImage src={c.profile?.avatar_url || ""} />
                        <AvatarFallback className="text-xs">{c.profile?.full_name?.charAt(0) || "م"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium flex items-center gap-1">
                          {c.profile?.full_name}
                          {c.is_pinned && <Pin className="w-3 h-3 text-primary fill-primary" />}
                        </p>
                        <p className="text-sm break-words">{c.content}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ar })}</p>
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                        {isStaff && (
                          <button onClick={() => handlePinComment(c.id, !c.is_pinned)} className="p-1 rounded hover:bg-background">
                            <Pin className={`w-3 h-3 ${c.is_pinned ? "text-primary fill-primary" : ""}`} />
                          </button>
                        )}
                        {(c.user_id === user?.id || isStaff) && (
                          <button onClick={() => handleDeleteComment(c.id)} className="p-1 rounded hover:bg-destructive/10">
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Textarea
                      value={commentText[s.id] || ""}
                      onChange={e => setCommentText(p => ({ ...p, [s.id]: e.target.value }))}
                      placeholder="اكتب تعليق..."
                      className="resize-none min-h-[40px] text-sm"
                    />
                    <Button size="icon" className="shrink-0" disabled={!commentText[s.id]?.trim()} onClick={() => handleAddComment(s.id)}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Schedules;
