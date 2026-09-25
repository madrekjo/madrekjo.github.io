import { useEffect, useState } from "react";
import { UserRound, Check, X, Pencil, Loader2, ShieldQuestion } from "lucide-react";
import { setDeviceName } from "@/lib/device-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const MAX = 40;

function useNameForm(initial: string | null) {
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(): Promise<boolean> {
    const trimmed = value.trim().replace(/\s{2,}/g, " ");
    if (trimmed.length < 2) {
      setErr("اكتب اسماً من حرفين على الأقل");
      return false;
    }
    setErr(null);
    setSaving(true);
    const r = await setDeviceName(trimmed);
    setSaving(false);
    if (r.ok) {
      toast.success("تم — الإدارة رح تعرفك من اسمك");
      return true;
    }
    setErr(
      r.error === "no links" ? "الاسم ما بقدر يكون رابط أو إيميل" :
      r.error === "too long" ? `الاسم طويل زيادة (${MAX} حرف كحد أقصى)` :
      r.error === "too short" ? "الاسم قصير زيادة" :
      "تعذّر الحفظ، جرّب مرة ثانية"
    );
    return false;
  }

  return { value, setValue, saving, err, save };
}

export function NameGate({ onSaved }: { onSaved: () => void }) {
  const form = useNameForm(null);
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/15">
          <UserRound className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mt-5 text-2xl font-black">اختر اسمك قبل ما تنشر</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          اكتب أي اسم مستعار تحبّه يميّزك بين الناس.
          <span className="mt-2 block font-semibold text-foreground">
            اسمك يظهر للإدارة وحدها — عشان يقدروا يحذروا منشوراتك أو يعاقبك بدون ما يتعاملوا مع كود جهازك الطويل.
          </span>
          <span className="mt-2 block">وأمام الناس بتضل مجهول تماماً، ما رح يشوفوا اسمك أبداً.</span>
        </p>
        <div className="mt-5 w-full">
          <Input
            autoFocus
            value={form.value}
            onChange={(e) => { form.setValue(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") form.save().then((ok) => ok && onSaved()); }}
            placeholder="مثال: أبو محمد"
            maxLength={MAX}
            className="h-11 text-center text-base"
          />
          {form.err && <p className="mt-1.5 text-xs text-destructive">{form.err}</p>}
          <Button
            size="lg"
            className="mt-3 w-full"
            disabled={form.saving}
            onClick={() => form.save().then((ok) => ok && onSaved())}
          >
            {form.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            حفظ الاسم ومتابعة
          </Button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            بينحفظ الاسم على جهازك، وبتقدر تغيّره أو تحذفه بأي وقت.
          </p>
        </div>
        <p className="mt-8 flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShieldQuestion className="h-3 w-3" /> الاسم للاستخدام الداخلي فقط، ولا يظهر مع أي منشور.
        </p>
      </div>
    </div>
  );
}

export function NameCard({ name, onSaved }: { name: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const form = useNameForm(name);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (name) form.setValue(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function remove() {
    setRemoving(true);
    const r = await setDeviceName("");
    setRemoving(false);
    if (r.ok) { toast.success("تم حذف الاسم"); setOpen(false); onSaved(); }
  }

  if (!name || open) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
        <div className="flex items-center gap-2 font-bold">
          <UserRound className="h-4 w-4 text-primary" /> {name ? "تغيير الاسم" : "أضف اسمك"}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          الاسم يظهر للإدارة وحدها، فيميزونك به بدل الكود الطويل — ويفضل ظاهرك أمام الناس مجهولاً.
        </p>
        <div className="mt-2 flex gap-2">
          <Input
            autoFocus={open}
            value={form.value}
            onChange={(e) => form.setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") form.save().then((ok) => ok && onSaved()); }}
            placeholder="مثال: أبو محمد"
            maxLength={MAX}
            className="h-9"
          />
          <Button
            size="sm"
            className="h-9 shrink-0"
            disabled={form.saving}
            onClick={() => form.save().then((ok) => ok && onSaved())}
          >
            {form.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} حفظ
          </Button>
        </div>
        {form.err && <p className="mt-1.5 text-xs text-destructive">{form.err}</p>}
        {name && (
          <Button size="sm" variant="ghost" className="mt-1 h-7 gap-1 text-xs" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
        )}
      </div>
    );
  }

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
        <Button size="sm" variant="ghost" onClick={remove} disabled={removing} title="حذف الاسم">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
