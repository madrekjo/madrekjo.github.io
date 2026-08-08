import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Lock, Send, Loader2, Trash2, ImagePlus, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { compressImage } from "@/lib/mediaCompression";

interface StaffMessage {
  id: string; user_id: string; content: string | null; image_url: string | null; created_at: string;
  profile?: { full_name: string; avatar_url: string | null } | null;
}

const StaffMeeting = () => {
  const { user, isAdmin, isModerator } = useAuth();
  const navigate = useNavigate();
  const isStaff = isAdmin || isModerator;
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isStaff && user) navigate("/");
  }, [isStaff, user, navigate]);

  useEffect(() => {
    if (!isStaff) return;
    fetchMessages();
    const ch = supabase.channel("staff-chat-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_chat" }, fetchMessages)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isStaff]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const fetchMessages = async () => {
    const { data } = await (supabase as any).from("staff_chat").select("*").order("created_at", { ascending: true });
    if (!data) { setLoading(false); return; }
    const ids = Array.from(new Set(data.map((m: any) => m.user_id)));
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", ids as string[]);
    setMessages(data.map((m: any) => ({ ...m, profile: profiles?.find(p => p.user_id === m.user_id) || null })));
    setLoading(false);
  };

  const handleSend = async () => {
    if (!user || (!content.trim() && !file)) return;
    setSending(true);
    let imageUrl: string | null = null;
    if (file) {
      const compressed = await compressImage(file);
      const ext = compressed.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("staff-chat").upload(path, compressed);
      if (upErr) { toast.error("فشل رفع الصورة"); setSending(false); return; }
      const { data: signed } = await supabase.storage.from("staff-chat").createSignedUrl(path, 60 * 60 * 24 * 365);
      imageUrl = signed?.signedUrl || null;
    }
    const { error } = await (supabase as any).from("staff_chat").insert({
      user_id: user.id, content: content.trim() || null, image_url: imageUrl,
    });
    if (error) toast.error("فشل الإرسال");
    else { setContent(""); setFile(null); if (fileRef.current) fileRef.current.value = ""; fetchMessages(); }
    setSending(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any).from("staff_chat").delete().eq("id", id);
    if (error) toast.error("فشل الحذف"); else fetchMessages();
  };

  if (!isStaff) return null;
  if (loading) return <div className="container mx-auto px-4 py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-2">
        <Lock className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">اجتماع الإدارة</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">قناة خاصة للأدمن والمشرفين فقط 🔒</p>

      <div className="space-y-3 mb-4 max-h-[60vh] overflow-y-auto pr-2">
        {messages.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground text-sm">لا توجد رسائل بعد</p>
        ) : (
          messages.map(m => {
            const mine = m.user_id === user?.id;
            return (
              <div key={m.id} className={`flex gap-2 group ${mine ? "flex-row-reverse" : ""}`}>
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarImage src={m.profile?.avatar_url || ""} />
                  <AvatarFallback className="text-xs">{m.profile?.full_name?.charAt(0) || "م"}</AvatarFallback>
                </Avatar>
                <div className={`flex-1 max-w-[75%] ${mine ? "items-end text-left" : "items-start text-right"} flex flex-col`}>
                  <p className="text-xs text-muted-foreground mb-1">{m.profile?.full_name}</p>
                  <div className={`p-3 rounded-2xl ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.image_url && (
                      <a href={m.image_url} target="_blank" rel="noreferrer">
                        <img src={m.image_url} alt="" className="rounded-lg max-w-full mb-2" loading="lazy" />
                      </a>
                    )}
                    {m.content && <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ar })}</p>
                    {(mine || isAdmin) && (
                      <button onClick={() => handleDelete(m.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10">
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {file && (
        <div className="flex items-center gap-2 mb-2 p-2 bg-muted rounded-lg text-xs">
          <ImagePlus className="w-4 h-4" />
          <span className="flex-1 truncate">{file.name}</span>
          <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="icon" className="shrink-0" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="w-4 h-4" />
        </Button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => setFile(e.target.files?.[0] || null)} />
        <Textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="اكتب رسالة..."
          className="resize-none min-h-[40px] text-sm"
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <Button size="icon" className="shrink-0" disabled={sending || (!content.trim() && !file)} onClick={handleSend}>
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
};

export default StaffMeeting;
