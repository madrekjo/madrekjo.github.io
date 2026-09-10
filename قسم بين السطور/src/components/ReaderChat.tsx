import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { BookOpen, Pencil, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getChatMessages, postChatMessage, type ChatMessage } from "@/lib/api";
import { getDeviceId } from "@/lib/device";

const NICK_KEY = "bayn:reader:nickname";

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = d.toLocaleTimeString("ar", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return sameDay ? hm : `${d.toLocaleDateString("ar", { weekday: "short" })} ${hm}`;
}

export default function ReaderChat() {
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState<string>(
    () => localStorage.getItem(NICK_KEY) ?? ""
  );
  const [draft, setDraft] = useState("");
  const [nickDraft, setNickDraft] = useState("");
  const [editingNick, setEditingNick] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ownDevice = getDeviceId();

  const load = () => {
    getChatMessages(50)
      .then(setMessages)
      .catch((e) => setError(String(e.message ?? e)));
  };

  useEffect(() => {
    if (!open) return;
    setError("");
    if (messages.length === 0) load();
  }, [open]);

  useEffect(() => {
    const channel = supabase
      .channel("reader-chat-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reader_chat" },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id)
              ? prev
              : [row, ...prev].slice(0, 80)
          );
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  const saveNickname = () => {
    const n = nickDraft.trim().slice(0, 40);
    if (!n) return;
    setNickname(n);
    localStorage.setItem(NICK_KEY, n);
    setEditingNick(false);
    setNickDraft("");
  };

  const startEditNick = () => {
    setNickDraft(nickname);
    setEditingNick(true);
  };

  const cancelEditNick = () => {
    setEditingNick(false);
    setNickDraft("");
  };

  const send = async () => {
    const msg = draft.trim().slice(0, 300);
    if (!msg || sending) return;
    setSending(true);
    setError("");
    try {
      const id = await postChatMessage(nickname, msg);
      setMessages((prev) => [...prev, { id, nickname, message: msg, created_at: new Date().toISOString() }]);
      setDraft("");
    } catch (e) {
      setError(String(e.message ?? e));
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void send();
  };

  const isMine = (m: ChatMessage) =>
    Boolean(m.device_id) && m.device_id === ownDevice;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-gold px-4 py-3 font-bold text-white shadow-lg transition hover:bg-gold-deep"
        aria-label="فتح ركن القرّاء"
      >
        <BookOpen size={18} />
        ركن القرّاء
      </button>

      <div
        className={
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-hidden bg-paper shadow-2xl transition-transform duration-300 " +
          (open ? "translate-x-0" : "translate-x-full")
        }
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between bg-ink px-4 py-4 text-paper">
          <div>
            <h2 className="flex items-center gap-2 font-serif text-lg font-bold">
              <BookOpen size={18} className="text-gold" />
              ركن القرّاء
            </h2>
            <p className="mt-0.5 text-xs text-paper/70">
              شات حي — شارك رأيَك بالسطر واقرأ آراء رفاقك
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="grid size-9 place-items-center rounded-full text-paper/70 transition hover:bg-white/10 hover:text-paper"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !error && (
            <p className="rounded-xl border border-line bg-card p-4 text-center text-sm leading-6 text-ink-soft">
              ركن القرّاء فاضي — كن أول من يترك بصمته هنا ✨
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                "rounded-2xl border p-3 " +
                (isMine(m)
                  ? "border-gold bg-gold-deep/10"
                  : "border-line bg-card")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex max-w-[70%] truncate rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-white">
                  {m.nickname}
                </span>
                <span className="shrink-0 text-[10px] text-ink-soft">
                  {timeLabel(m.created_at)}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                {m.message}
              </p>
            </div>
          ))}
          {error && (
            <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-line bg-card px-4 py-3">
          {(!nickname || editingNick) ? (
            <div className="flex gap-2">
              <input
                value={nickDraft}
                onChange={(e) => setNickDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveNickname()}
                maxLength={40}
                placeholder="اكتب اسماً مستعاراً ليظهر بجانب رسائلك"
                className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2.5 text-sm outline-none transition focus:border-gold-deep"
              />
              <button
                onClick={saveNickname}
                disabled={!nickDraft.trim()}
                className="shrink-0 rounded-full bg-gold px-4 py-2.5 text-sm font-bold text-white transition hover:bg-gold-deep disabled:opacity-40"
              >
                حفظ
              </button>
              {editingNick && (
                <button
                  onClick={cancelEditNick}
                  className="shrink-0 rounded-full border border-line bg-paper px-4 py-2.5 text-sm font-bold text-ink-soft transition hover:border-gold-deep hover:text-gold-deep"
                >
                  إلغاء
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex max-w-[70%] items-center gap-1.5 truncate rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-white">
                  {nickname}
                </span>
                <button
                  onClick={startEditNick}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-ink-soft transition hover:text-gold-deep"
                >
                  <Pencil size={12} />
                  غيّر الاسم
                </button>
              </div>
              <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                maxLength={300}
                placeholder="اكتب رسالة…"
                className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2.5 text-sm outline-none transition focus:border-gold-deep"
              />
              <button
                onClick={() => void send()}
                disabled={!draft.trim() || sending}
                aria-label="إرسال"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-gold text-white shadow-sm transition hover:bg-gold-deep disabled:opacity-40"
              >
                <Send size={17} />
              </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}