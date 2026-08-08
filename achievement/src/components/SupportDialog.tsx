import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, LifeBuoy, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface SupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SupportDialog = ({ open, onOpenChange }: SupportDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading } = useMessages();

  const refreshSupportMessages = () => {
    queryClient.invalidateQueries({ queryKey: ["messages"] });
    queryClient.invalidateQueries({ queryKey: ["admin-messages-all"] });
    void queryClient.refetchQueries({ queryKey: ["messages"], type: "active" });
    void queryClient.refetchQueries({ queryKey: ["admin-messages-all"], type: "active" });
  };

  const visibleMessages = useMemo(() => {
    const sorted = [...messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const seen = new Set<string>();
    return sorted.filter((msg) => {
      const key = `${msg.sender_id}|${msg.content}|${new Date(msg.created_at).toISOString()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [messages]);

  useEffect(() => {
    if (!open || !user) return;
    const hasUnread = messages.some((m) => m.receiver_id === user.id && !m.is_read);
    if (!hasUnread) return;
    (async () => {
      await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("receiver_id", user.id)
        .eq("is_read", false);
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    })();
  }, [open, messages, user, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user) return;

    setSending(true);
    const { error } = await supabase.functions.invoke("send-support-message", {
      body: { content: trimmed },
    });
    setSending(false);
    if (error) {
      toast.error("تعذّر إرسال الرسالة");
      return;
    }
    setText("");
    refreshSupportMessages();
    toast.success("تم إرسال رسالتك للإدارة");
  };


  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) {
      toast.error("تعذّر حذف الرسالة");
      return;
    }
    refreshSupportMessages();
    toast.success("تم حذف الرسالة");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            الدعم الفني
          </DialogTitle>
          <DialogDescription>
            راسل الإدارة بأي مشكلة أو اقتراح، وسيتم الرد عليك في أقرب وقت.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-[200px] max-h-[400px] border rounded-lg p-3 overflow-y-auto bg-muted/20">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : visibleMessages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              ابدأ محادثتك مع الإدارة. اكتب مشكلتك بالأسفل ⬇️
            </p>
          ) : (
            <div className="space-y-2">
              {visibleMessages.map((msg) => {
                const mine = msg.sender_id === user?.id;
                return (
                  <div
                    key={msg.id}
                    className={`group flex items-end gap-1 ${mine ? "justify-end" : "justify-start"}`}
                  >
                    {mine && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                        onClick={() => handleDelete(msg.id)}
                        title="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                        mine
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p
                        className={`text-[10px] mt-1 ${
                          mine ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString("ar", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="flex gap-2 items-end">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب رسالتك للإدارة..."
            className="flex-1 min-h-[60px] max-h-[120px]"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
