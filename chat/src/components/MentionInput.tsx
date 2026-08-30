import { useRef, useState, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Suggestion {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  gender?: string | null;
  generation?: string | null;
  field?: string | null;
  is_banned?: boolean;
  chat_banned?: boolean;
}

interface MentionInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  channel: string;
  currentGender?: string | null;
  currentGeneration?: string | null;
  minRows?: number;
  maxRows?: number;
  className?: string;
  disabled?: boolean;
  isAdmin?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const MENTION_RE = /@([^@\s]{1,40})$/;

function lookupName(tokens: string[]): string {
  const parts: string[] = [];
  for (const t of tokens) {
    const m = t.match(/^@([\u0600-\u06FFa-zA-Z0-9]+)$/);
    if (m) parts.push(m[1]);
    else break;
  }
  return parts.join(" ");
}

export function extractMentions(text: string): { name: string; userId: string | null }[] {
  const out: { name: string; userId: string | null }[] = [];
  const re = /\[@([^\]\n]+)\]\(user:([^)]+)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ name: m[1].trim(), userId: m[2].trim() });
  }
  return out;
}

const MentionInput = ({
  value,
  onChange,
  placeholder,
  channel,
  currentGender,
  currentGeneration,
  minRows = 1,
  className,
  disabled,
  isAdmin,
  onKeyDown,
}: MentionInputProps) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mentionActive, setMentionActive] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cacheRef = useRef<Record<string, Suggestion[]>>({});

  const buildQuery = useCallback((search: string) => {
    let q = supabase
      .from("profiles")
      .select("user_id,full_name,avatar_url,gender,generation,field,is_banned,chat_banned")
      .is("is_banned", false);

    if (channel === "male") q = q.eq("gender", "male");
    else if (channel === "female") q = q.eq("gender", "female");
    else if (channel === "09" || channel === "10") q = q.eq("generation", channel);

    if (search) q = q.ilike("full_name", `%${search}%`);
    return q.order("full_name").limit(8);
  }, [channel]);

  const loadSuggestions = useCallback(async (search: string) => {
    const cacheKey = `${channel}:${search}`.toLowerCase();
    if (cacheRef.current[cacheKey]) {
      setSuggestions(cacheRef.current[cacheKey]);
      setSuggestionIndex(0);
      return;
    }
    const { data, error } = await buildQuery(search);
    if (error) return;
    const list = (data || []).filter(u => !u.chat_banned);
    cacheRef.current[cacheKey] = list;
    setSuggestions(list);
    setSuggestionIndex(0);
  }, [buildQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    const m = v.slice(0, e.target.selectionStart).match(MENTION_RE);
    if (m) {
      setMentionActive(true);
      void loadSuggestions(m[1]);
    } else {
      setMentionActive(false);
      setSuggestions([]);
    }
  };

  const insertSuggestion = (sug: Suggestion) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const before = value.slice(0, ta.selectionStart);
    const after = value.slice(ta.selectionEnd);
    const m = before.match(MENTION_RE);
    if (!m) {
      onChange(value);
      setMentionActive(false);
      setSuggestions([]);
      return;
    }
    const insert = `[@${sug.full_name}](user:${sug.user_id}) `;
    const newValue = before.slice(0, before.length - m[0].length) + insert + after;
    onChange(newValue);
    setMentionActive(false);
    setSuggestions([]);
    requestAnimationFrame(() => {
      const pos = before.length - m[0].length + insert.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const onSuggestionKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionActive && shownItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestionIndex(i => (i + 1) % shownItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestionIndex(i => (i - 1 + shownItems.length) % shownItems.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertSuggestion(shownItems[suggestionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionActive(false);
        setSuggestions([]);
        return;
      }
    }
    onKeyDown?.(e);
  };

  const activeSuggestion = mentionActive && (isAdmin || suggestions.length > 0);

  const allSuggestion: Suggestion = {
    user_id: "everyone",
    full_name: "الجميع",
    avatar_url: null,
    gender: null,
    generation: null,
  };
  const shownItems = isAdmin ? [allSuggestion, ...suggestions] : suggestions;

  return (
    <div className="relative w-full">
      {activeSuggestion && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 rounded-lg border bg-background shadow-lg max-h-60 overflow-y-auto">
          {shownItems.map((s, i) => (
            <button
              key={s.user_id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => insertSuggestion(s)}
              onMouseEnter={() => setSuggestionIndex(i)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm text-right hover:bg-muted transition-colors",
                i === suggestionIndex && "bg-muted"
              )}
            >
              {s.user_id === "everyone" ? (
                <>
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary font-bold text-xs shrink-0">✦</span>
                  <span className="font-bold text-primary">{s.full_name}</span>
                  <span className="text-[10px] text-primary mr-auto">منشن لجميع الطلاب هنا</span>
                </>
              ) : (
                <>
                  <Avatar className="w-6 h-6 shrink-0">
                    {s.avatar_url ? <AvatarImage src={s.avatar_url} /> : null}
                    <AvatarFallback className="text-[10px]">{(s.full_name || "؟").charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{s.full_name}</span>
                  <span className="text-[10px] text-muted-foreground mr-auto">
                    {s.gender === "male" ? "شباب" : s.gender === "female" ? "بنات" : ""}
                    {s.generation ? ` · ${s.generation}` : ""}
                  </span>
                </>
              )}
            </button>
          ))}
          {shownItems.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">لا توجد نتائج</div>
          )}
        </div>
      )}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={onSuggestionKey}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("resize-none", className)}
        style={{ minHeight: minRows * 36 }}
        dir="auto"
      />
    </div>
  );
};

export { lookupName };
export default MentionInput;