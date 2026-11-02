import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useMeetingChat } from "@/hooks/useMeetingChat";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Send, Paperclip, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface MeetingChatProps {
  meetingId: string;
}

export const MeetingChat = ({ meetingId }: MeetingChatProps) => {
  const { user } = useAuth();
  const { messages, isLoading, profileMap, sendMessage, deleteMessage } = useMeetingChat(meetingId);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    if (!text.trim() && files.length === 0) return;
    try {
      await sendMessage.mutateAsync({ content: text, files });
      setText("");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      toast.error((e as Error)?.message || "تعذّر إرسال الرسالة");
    }
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
  };

  return (
    <div className="mt-4 rounded-xl border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <span>💬 دردشة الاجتماع</span>
      </div>

      <div className="h-56 overflow-y-auto rounded-lg border bg-background/60 p-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            لا توجد رسائل بعد. ابدأ المحادثة ⬇️
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => {
              const mine = msg.sender_id === user?.id;
              const images = Array.isArray(msg.image_urls) ? msg.image_urls : [];
              return (
                <div
                  key={msg.id}
                  className={`group flex items-end gap-1 ${mine ? "justify-end" : "justify-start"}`}
                >
                  {mine && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                      onClick={() => void deleteMessage.mutateAsync(msg.id).catch(() => toast.error("تعذّر حذف الرسالة"))}
                      title="حذف"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                      mine
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border text-foreground"
                    }`}
                  >
                    {!mine && (
                      <p className="mb-0.5 text-[11px] font-semibold text-primary">
                        {profileMap[msg.sender_id] || "مستخدم"}
                      </p>
                    )}
                    {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                    {images.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {images.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img
                              src={url}
                              alt=""
                              className="h-20 w-20 rounded-lg object-cover ring-1 ring-border/60"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    <p
                      className={`mt-1 text-[10px] ${
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

      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {files.map((f, i) => (
            <span key={i} className="rounded-full border bg-background/60 px-2 py-0.5">
              {f.name}
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setFiles([]);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="text-destructive hover:underline"
          >
            مسح
          </button>
        </div>
      )}

      <div className="mt-2 flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFiles}
        />
        <Button
          size="icon"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          title="إرفاق صور"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب رسالة..."
          className="flex-1 min-h-[44px] max-h-[100px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <Button
          size="icon"
          onClick={() => void handleSend()}
          disabled={sendMessage.isPending || (!text.trim() && files.length === 0)}
        >
          {sendMessage.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
};
