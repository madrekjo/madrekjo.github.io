import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Trash2, Loader2, Reply, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { usePoints } from "@/contexts/PointsContext";

interface Msg {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  reply_to: string | null;
  profile?: { full_name: string; avatar_url: string | null } | null;
}

const RoundChat = ({ roundId }: { roundId: string }) => {
  const { user, isAdmin, isModerator, isStaff } = useAuth();
  const { spend, getCost, balance } = usePoints();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const profilesRef = useRef<Record<string, { full_name: string; avatar_url: string | null }>>({});

  const fetchMsgs = async () => {
    const { data } = await (supabase as any)
      .from("round_chat").select("id, user_id, content, created_at, reply_to").eq("round_id", roundId)
      .order("created_at", { ascending: true });
    if (!data) { setLoading(false); return; }
    const ids = Array.from(new Set(data.map((m: any) => m.user_id)));
    const { data: profiles } = await supabase
      .from("profiles").select("user_id, full_name, avatar_url").in("user_id", ids as string[]);
    (profiles || []).forEach((p: any) => { profilesRef.current[p.user_id] = p; });
    setMsgs(data.map((m: any) => ({ ...m, profile: profilesRef.current[m.user_id] || null })));
    setLoading(false);
  };

  // بدون Realtime (كان يفتح قناة socket لكل جولة). الجلب عند الفتح +
  // عند عودة التبويب + زر تحديث + إعادة جلب بعد الإرسال/الحذف.
  useEffect(() => {
    void fetchMsgs();
    const onVis = () => { if (document.visibilityState === "visible") void fetchMsgs(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [roundId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    if (!user || !text.trim()) return;
    // فحص النقاط: تكلفة رسالة الجولة = 1
    if (!isStaff) {
      const msgCost = getCost("round_message");
      if (balance < msgCost) {
        toast.error(`لا نقاط كافية لإرسال رسالة. رصيدك: ${balance}`);
        return;
      }
    }
    setSending(true);
    const { error } = await (supabase as any).from("round_chat").insert({
      round_id: roundId, user_id: user.id, content: text.trim(), reply_to: replyTo?.id || null,
    });
    if (error) toast.error("فشل الإرسال - تأكد من انضمامك للجولة");
    else {
      // خصم النقاط بعد الإرسال الناجح
      if (!isStaff) {
        await spend(getCost("round_message"), "round_message", "round_chat", { roundId });
      }
      setText(""); setReplyTo(null);
      void fetchMsgs();
    }
    setSending(false);
  };

  const del = async (id: string) => {
    const { error } = await (supabase as any).from("round_chat").delete().eq("id", id);
    if (error) toast.error("فشل الحذف"); else void fetchMsgs();
  };

  const findMsg = (id: string) => msgs.find(m => m.id === id);

  return (
    <div className="rounded-lg border bg-background mt-3 overflow-hidden">
      <div className="px-3 py-2 bg-muted text-xs font-medium border-b flex items-center justify-between">
        <span>💬 شات البريك (للمشاركين فقط)</span>
        <button onClick={() => void fetchMsgs()} title="تحديث" className="text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin mx-auto text-primary" />
        ) : msgs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">لا رسائل بعد</p>
        ) : msgs.map(m => {
          const mine = m.user_id === user?.id;
          const canDel = mine || isAdmin || isModerator;
          const replied = m.reply_to ? findMsg(m.reply_to) : null;
          return (
            <div key={m.id} className={`flex gap-2 group ${mine ? "flex-row-reverse" : ""}`}>
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={m.profile?.avatar_url || ""} />
                <AvatarFallback className="text-[10px]">{m.profile?.full_name?.charAt(0) || "م"}</AvatarFallback>
              </Avatar>
              <div className={`max-w-[75%] rounded-lg px-2 py-1 ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <p className="text-[11px] opacity-80">{m.profile?.full_name}</p>
                {replied && (
                  <div className="text-[10px] border-r-2 border-primary/50 pr-2 my-1 opacity-80">
                    <span className="font-bold">{replied.profile?.full_name}: </span>{replied.content.slice(0, 60)}
                  </div>
                )}
                <p className="text-sm break-words">{m.content}</p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 self-center flex gap-1">
                <button onClick={() => setReplyTo(m)} title="رد"><Reply className="w-3 h-3" /></button>
                {canDel && <button onClick={() => del(m.id)} className="text-destructive"><Trash2 className="w-3 h-3" /></button>}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {replyTo && (
        <div className="px-3 py-1 bg-muted/50 border-t flex items-center justify-between text-[11px]">
          <span>↩ رد على <b>{replyTo.profile?.full_name}</b>: {replyTo.content.slice(0, 50)}</span>
          <button onClick={() => setReplyTo(null)}><X className="w-3 h-3" /></button>
        </div>
      )}
      <div className="flex gap-1 p-2 border-t">
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
          placeholder="اكتب رسالة..."
          className="h-8 text-sm"
        />
        <Button size="icon" className="h-8 w-8 shrink-0" onClick={send} disabled={sending || !text.trim()}>
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};

export default RoundChat;
