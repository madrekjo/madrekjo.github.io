import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserPlus, Search, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import type { Round } from "./types";

interface InviteDialogProps {
  /** الجولة المفتوح لها الدعوة — null = مغلق */
  round: Round | null;
  onClose: () => void;
}

interface ProfileLite {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

/**
 * دعوة أشخاص للجولة: بحث بالاسم + إرسال إشعار round_invite
 * يفتح المرسل إليه الجولة بنقرة واحدة. سقفك اليومي 100 دعوة (SQL).
 */
const InviteDialog = ({ round, onClose }: InviteDialogProps) => {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [selected, setSelected] = useState<Map<string, ProfileLite>>(new Map());
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!round) {
      setQ("");
      setResults([]);
      setSelected(new Map());
    }
  }, [round]);

  const participantIds = round ? round.participants.map((p) => p.user_id) : [];

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .ilike("full_name", `%${term}%`)
        .limit(10);
      setResults(
        (data || []).filter(
          (p) => p.user_id !== user?.id && !participantIds.includes(p.user_id)
        )
      );
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, round?.id]);

  const toggle = (p: ProfileLite) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(p.user_id)) next.delete(p.user_id);
      else next.set(p.user_id, p);
      return next;
    });
  };

  const send = async () => {
    if (!round || !user || selected.size === 0 || sending) return;
    setSending(true);
    const rows = [...selected.values()].map((p) => ({
      user_id: p.user_id,
      actor_id: user.id,
      type: "round_invite",
      round_id: round.id,
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    setSending(false);
    if (error) {
      toast.error("تعذر إرسال الدعوات — قد يكون وصلت للحد اليومي (100 دعوة)");
      return;
    }
    toast.success(`أُرسلت ${rows.length} دعوة إلى "${round.title}"`);
    setSelected(new Map());
    setQ("");
    onClose();
  };

  return (
    <Dialog open={!!round} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> دعوة إلى "{round?.title}"
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالاسم…"
            className="pr-9"
            autoFocus
          />
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[...selected.values()].map((p) => (
              <button
                key={p.user_id}
                type="button"
                onClick={() => toggle(p)}
                className="flex items-center gap-1 rounded-full border bg-primary/10 px-2.5 py-1 text-xs hover:bg-primary/20"
              >
                {p.full_name || "مستخدم"}
                <span className="text-muted-foreground">×</span>
              </button>
            ))}
          </div>
        )}

        <div className="min-h-[120px] space-y-1">
          {searching && (
            <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> بحث…
            </p>
          )}
          {!searching && q.trim() && results.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">لا نتائج</p>
          )}
          {!searching &&
            results.map((p) => {
              const on = selected.has(p.user_id);
              return (
                <button
                  key={p.user_id}
                  type="button"
                  onClick={() => toggle(p)}
                  className={`flex w-full items-center gap-2 rounded-lg p-2 text-right transition-colors hover:bg-muted/60 ${
                    on ? "bg-primary/10" : ""
                  }`}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={p.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {p.full_name?.charAt(0) || "م"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-sm">{p.full_name}</span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      on ? "border-primary bg-primary text-primary-foreground" : "text-transparent"
                    }`}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
          {!q.trim() && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              اكتب اسم شخص لتدعوه — يصله إشعار يفتح الجولة مباشرة.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="self-center text-xs text-muted-foreground">
            {selected.size} مختار · الحد اليومي 100 دعوة
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>إلغاء</Button>
            <Button onClick={send} disabled={selected.size === 0 || sending} className="gap-1">
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              إرسال الدعوات
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteDialog;
