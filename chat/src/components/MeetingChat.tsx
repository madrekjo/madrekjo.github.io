import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Trash2, Loader2, ImagePlus, X, UserPlus, Reply, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import Lightbox from "@/components/Lightbox";
import { compressImage } from "@/lib/mediaCompression";
import { uploadToCloudinary } from "@/lib/cloudinary";

interface Msg {
  id: string; user_id: string; content: string | null; image_url: string | null; created_at: string;
  profile?: { full_name: string; avatar_url: string | null } | null;
}
interface Member { user_id: string; full_name: string; avatar_url: string | null; }

const MeetingChat = ({ meetingId, ownerId, title, onClose }: { meetingId: string; ownerId: string; title: string; onClose: () => void; }) => {
  const { user, isAdmin } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [allUsers, setAllUsers] = useState<Member[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const profilesRef = useRef<Record<string, { full_name: string; avatar_url: string | null }>>({});

  const isOwner = user?.id === ownerId;

  const fetchAll = async () => {
    const [{ data: mData }, { data: memData }] = await Promise.all([
      (supabase as any).from("round_meeting_messages").select("id, meeting_id, user_id, content, image_url, created_at").eq("meeting_id", meetingId).order("created_at", { ascending: true }),
      (supabase as any).from("round_meeting_members").select("user_id").eq("meeting_id", meetingId),
    ]);
    const userIds = new Set<string>([ownerId]);
    (mData || []).forEach((m: any) => userIds.add(m.user_id));
    (memData || []).forEach((m: any) => userIds.add(m.user_id));
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", Array.from(userIds));
    (profiles || []).forEach((p: any) => { profilesRef.current[p.user_id] = p; });
    const findP = (id: string) => profiles?.find(p => p.user_id === id) || null;
    setMsgs((mData || []).map((m: any) => ({ ...m, profile: findP(m.user_id) })));
    setMembers((memData || []).map((m: any) => ({ user_id: m.user_id, full_name: findP(m.user_id)?.full_name || "", avatar_url: findP(m.user_id)?.avatar_url || null })));
    setLoading(false);
  };

  // بدون Realtime (كان يفتح قناة socket لكل اجتماع). نعتمد على:
  //  - جلب أولي عند الفتح + إعادة جلب عند عودة التبويب (visibilitychange)
  //  - إعادة جلب محلية بعد الإرسال/الحذف/إضافة الأعضاء (أدناه)
  useEffect(() => {
    void fetchAll();
    const onVis = () => { if (document.visibilityState === "visible") void fetchAll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [meetingId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    if (!user || (!text.trim() && !file)) return;
    setSending(true);
    let imageUrl: string | null = null;
    if (file) {
      const compressed = await compressImage(file);
      try {
        imageUrl = await uploadToCloudinary(compressed);
      } catch {
        toast.error("فشل رفع الصورة"); setSending(false); return;
      }
    }
    const { error } = await (supabase as any).from("round_meeting_messages").insert({
      meeting_id: meetingId, user_id: user.id, content: text.trim() || null, image_url: imageUrl,
    });
    if (error) toast.error("فشل الإرسال"); else { setText(""); setFile(null); if (fileRef.current) fileRef.current.value = ""; void fetchAll(); }
    setSending(false);
  };

  const del = async (id: string) => {
    const { error } = await (supabase as any).from("round_meeting_messages").delete().eq("id", id);
    if (error) toast.error("فشل الحذف"); else void fetchAll();
  };

  const openAdd = async () => {
    setShowAdd(true);
    const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url").order("full_name");
    setAllUsers((data || []).map(p => ({ user_id: p.user_id, full_name: p.full_name, avatar_url: p.avatar_url })));
  };

  const addMember = async (uid: string) => {
    if (members.find(m => m.user_id === uid) || uid === ownerId) return;
    const { error } = await (supabase as any).from("round_meeting_members").insert({ meeting_id: meetingId, user_id: uid });
    if (error) toast.error("فشل الإضافة"); else { toast.success("تم إضافته"); void fetchAll(); }
  };
  const removeMember = async (uid: string) => {
    const { error } = await (supabase as any).from("round_meeting_members").delete().eq("meeting_id", meetingId).eq("user_id", uid);
    if (error) toast.error("فشل الإزالة"); else void fetchAll();
  };

  const filtered = allUsers.filter(u => u.user_id !== ownerId && u.full_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>🔒 {title}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => { void fetchAll(); }} title="تحديث" className="gap-1">
                <RefreshCw className="w-3 h-3" /> تحديث
              </Button>
              {isOwner && (
                <Button size="sm" variant="outline" onClick={openAdd} className="gap-1">
                  <UserPlus className="w-4 h-4" /> الأعضاء ({members.length + 1})
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 border rounded-lg p-3 bg-muted/30 min-h-[300px]">
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> :
            msgs.length === 0 ? <p className="text-xs text-center text-muted-foreground py-8">لا رسائل بعد</p> :
            msgs.map(m => {
              const mine = m.user_id === user?.id;
              const canDel = mine || isAdmin || isOwner;
              return (
                <div key={m.id} className={`flex gap-2 group ${mine ? "flex-row-reverse" : ""}`}>
                  <Avatar className="w-7 h-7 shrink-0">
                    <AvatarImage src={m.profile?.avatar_url || ""} />
                    <AvatarFallback className="text-xs">{m.profile?.full_name?.charAt(0) || "م"}</AvatarFallback>
                  </Avatar>
                  <div className={`max-w-[75%] rounded-2xl p-2 ${mine ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                    <p className="text-[10px] opacity-80 mb-0.5">{m.profile?.full_name}</p>
                    {m.image_url && (
                      <img src={m.image_url} alt="" className="rounded-lg max-w-full mb-1 cursor-zoom-in" onClick={() => setLightbox(m.image_url)} />
                    )}
                    {m.content && <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>}
                  </div>
                  {canDel && (
                    <button onClick={() => del(m.id)} className="opacity-0 group-hover:opacity-100 self-center text-destructive">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          <div ref={endRef} />
        </div>

        {file && (
          <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-xs">
            <ImagePlus className="w-4 h-4" />
            <span className="flex-1 truncate">{file.name}</span>
            <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="w-4 h-4" />
          </Button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => setFile(e.target.files?.[0] || null)} />
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="اكتب رسالة..."
            className="resize-none min-h-[40px] text-sm"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <Button size="icon" className="shrink-0" disabled={sending || (!text.trim() && !file)} onClick={send}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {/* Members management */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader><DialogTitle>إدارة أعضاء الاجتماع</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">الأعضاء الحاليون:</p>
                <div className="flex flex-wrap gap-1">
                  {members.map(m => (
                    <span key={m.user_id} className="flex items-center gap-1 bg-primary/10 text-primary text-xs rounded-full px-2 py-1">
                      {m.full_name}
                      <button onClick={() => removeMember(m.user_id)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {members.length === 0 && <p className="text-xs text-muted-foreground">لا أحد بعد</p>}
                </div>
              </div>
              <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
              <div className="max-h-64 overflow-y-auto space-y-1">
                {filtered.map(u => {
                  const isMember = !!members.find(m => m.user_id === u.user_id);
                  return (
                    <div key={u.user_id} className="flex items-center justify-between p-2 hover:bg-muted rounded-lg">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7"><AvatarImage src={u.avatar_url || ""} /><AvatarFallback className="text-xs">{u.full_name?.charAt(0)}</AvatarFallback></Avatar>
                        <span className="text-sm">{u.full_name}</span>
                      </div>
                      <Button size="sm" variant={isMember ? "secondary" : "outline"} disabled={isMember} onClick={() => addMember(u.user_id)}>
                        {isMember ? "موجود" : "إضافة"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Lightbox src={lightbox} type="image" onClose={() => setLightbox(null)} />
      </DialogContent>
    </Dialog>
  );
};

export default MeetingChat;
