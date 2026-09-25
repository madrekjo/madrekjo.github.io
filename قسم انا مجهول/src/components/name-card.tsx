import { useEffect, useState } from "react";
import { UserRound, Check, X, Pencil, Loader2, EyeOff } from "lucide-react";
import { getDeviceId } from "@/lib/device";
import { setDeviceName } from "@/lib/device-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const HIDE_KEY = "anon-name-hint-hidden-until";

function hiddenUntil() {
  try {
    const v = Number(localStorage.getItem(HIDE_KEY) || 0);
    return Number.isFinite(v) && v > Date.now() ? v : 0;
  } catch {
    return 0;
  }
}

function hide(days: number) {
  try {
    localStorage.setItem(HIDE_KEY, String(Date.now() + days * 86_400_000));
  } catch {
    /* ignore */
  }
}

export function NameCard({ name, onSaved }: { name: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const [saving, setSaving] = useState(false);
  const [snoozed, setSnoozed] = useState(() => hiddenUntil() > Date.now());

  useEffect(() => {
    if (name) {
      setValue(name);
      setSnoozed(false);
    }
  }, [name]);

  async function save() {
    const trimmed = value.trim();
    if (trimmed.length < 2) { toast.error("اكتب اسماً من حرفين على الأقل"); return; }
    setSaving(true);
    const r = await setDeviceName(trimmed);
    setSaving(false);
    if (r.ok) {
      toast.success("تم حفظ اسمك — سيراه الإدارة فقط");
      setOpen(false);
      onSaved();
    } else {
      toast.error(
        r.error === "no links" ? "الاسم ما بقدر يكون رابط" :
        r.error === "too long" ? "الاسم طويل زيادة (٤٠ حرف كحد أقصى)" : "تعذّر الحفظ"
      );
    }
  }

  async function remove() {
    setSaving(true);
    const r = await setDeviceName("");
    setSaving(false);
    if (r.ok) { toast.success("تم حذف الاسم"); setOpen(false); onSaved(); }
  }

  if (name && !open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <UserRound className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-semibold">{name}</span>
          <span className="truncate text-xs text-muted-foreground">(اسمك لدى الإدارة — خفي عن الناس)</span>
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            <Pencil className="h-3 w-3" /> تغيير
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={saving} title="حذف الاسم">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  if (snoozed && !open && !name) {
    return (
      <button
        onClick={() => setSnoozed(false)}
        className="mx-auto flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground hover:bg-accent"
      >
        <UserRound className="h-3 w-3" /> أضف اسمك ليعرفك الإدارة
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
      <div className="flex items-center gap-2 font-bold">
        <UserRound className="h-4 w-4 text-primary" />
        أضف اسمك الذي تريده
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        اكتب أي اسم تريده (مستعار) — <b className="text-foreground">يراه الإدارة فقط</b> чтобы تعرفك من اسمك
        بدل الكود الطويل، وتعطيك تحذيراً أو حظراً إن احتاج. يبقى ظاهرك أمام الناس <b className="text-foreground">مجهولاً تماماً</b>.
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          placeholder="مثال: أبو محمد"
          maxLength={40}
          className="h-9"
        />
        <Button size="sm" onClick={save} disabled={saving} className="h-9 shrink-0">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} حفظ
        </Button>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{value.trim().length}/40</span>
        <button
          onClick={() => { hide(7); setSnoozed(true); setOpen(false); }}
          className="flex items-center gap-1 hover:text-foreground"
        >
          <EyeOff className="h-3 w-3" /> لاحقاً
        </button>
      </div>
    </div>
  );
}
