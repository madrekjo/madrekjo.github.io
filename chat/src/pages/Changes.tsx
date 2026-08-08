import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Send, Sparkles, Heart, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface Msg {
  id: string;
  user_id: string;
  category: "change" | "motivation";
  content: string;
  created_at: string;
  profile?: { full_name: string; avatar_url: string | null } | null;
}

const categoryMeta = {
  change: { title: "شو المنصة غيرت فيك؟", placeholder: "احكي تجربتك مع المنصة وشو غيرت فيك...", icon: Sparkles },
  motivation: { title: "تحفيز", placeholder: "اكتب كلمة تحفيز للجميع...", icon: Heart },
};

const ChannelChat = ({ category }: { category: "change" | "motivation" }) => {
  const { user, isAdmin, isModerator } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const meta = categoryMeta[category];

  const fetchMsgs = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("changes_messages").select("*")
        .eq("category", category).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      const rows = [...(data || [])].reverse();
      const ids = Array.from(new Set(rows.map((m: any) => m.user_id)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", ids as string[])
        : { data: [] };
      setMsgs(rows.map((m: any) => ({ ...m, profile: profs?.find(p => p.user_id === m.user_id) || null })));
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
    } catch (err) {
      console.error("Failed to load changes chat", err);
      toast.error("تعذر تحميل رسائل التغيير");
    }
  };

  useEffect(() => {
    fetchMsgs();
    const ch = supabase.channel(`changes-${category}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "changes_messages", filter: `category=eq.${category}` }, fetchMsgs)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [category]);

  const send = async () => {
    if (!user || !text.trim()) return;
    setSending(true);
    // ملاحظة: في هذا القسم لا نطبّق فلتر الكلمات المحظورة
    const { error } = await (supabase as any).from("changes_messages")
      .insert({ user_id: user.id, category, content: text.trim() });
    if (error) toast.error("فشل الإرسال");
    else setText("");
    setSending(false);
  };

  const del = async (id: string) => {
    if (!confirm("حذف الرسالة؟")) return;
    await (supabase as any).from("changes_messages").delete().eq("id", id);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] border rounded-lg bg-card">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {msgs.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm">لا توجد رسائل بعد. كن أول من يكتب!</p>
        ) : msgs.map(m => {
          const mine = m.user_id === user?.id;
          const canDel = mine || isAdmin || isModerator;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarImage src={m.profile?.avatar_url || ""} />
                <AvatarFallback className="text-xs">{m.profile?.full_name?.charAt(0) || "م"}</AvatarFallback>
              </Avatar>
              <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`rounded-2xl px-3 py-2 ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <p className="text-xs font-medium mb-0.5 opacity-80">{m.profile?.full_name}</p>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                </div>
                <div className="flex items-center gap-2 mt-1 px-1">
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ar })}
                  </span>
                  {canDel && (
                    <button onClick={() => del(m.id)} className="text-destructive opacity-60 hover:opacity-100">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t p-2 flex gap-2">
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={meta.placeholder}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
        />
        <Button onClick={send} disabled={sending || !text.trim()} size="icon">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

const Changes = () => {
  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">التغيير</h1>
      </div>
      <Tabs defaultValue="change">
        <TabsList className="grid grid-cols-2 mb-3">
          <TabsTrigger value="change" className="gap-1"><Sparkles className="w-4 h-4" /> شو المنصة غيرت فيك</TabsTrigger>
          <TabsTrigger value="motivation" className="gap-1"><Heart className="w-4 h-4" /> تحفيز</TabsTrigger>
        </TabsList>
        <TabsContent value="change"><ChannelChat category="change" /></TabsContent>
        <TabsContent value="motivation"><ChannelChat category="motivation" /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Changes;
