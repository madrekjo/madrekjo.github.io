import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import {
  listSubjects,
  listFields,
  listGrades,
  addRefItem,
  renameRefItem,
  deleteRefItem,
  type RefItem,
} from "@/lib/teacher-files";

type RefTable = "teacher_subjects" | "teacher_fields" | "teacher_grades";

function RefList({
  title,
  table,
  items,
  onChanged,
}: {
  title: string;
  table: RefTable;
  items: RefItem[];
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVal, setEditingVal] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const v = newName.trim();
    if (!v) return;
    setBusy(true);
    try {
      await addRefItem(table, v);
      setNewName("");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذرت الإضافة");
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: string) {
    const v = editingVal.trim();
    if (!v) return;
    setBusy(true);
    try {
      await renameRefItem(table, id, v);
      setEditingId(null);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر التعديل");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("حذف هذا العنصر؟ سيُفصل عن كل المعلمين المرتبطين به.")) return;
    setBusy(true);
    try {
      await deleteRefItem(table, id);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر الحذف");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.map((it) =>
          editingId === it.id ? (
            <div key={it.id} className="flex gap-2">
              <Input
                value={editingVal}
                onChange={(e) => setEditingVal(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
              <Button size="sm" variant="ghost" onClick={() => rename(it.id)} disabled={busy}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div
              key={it.id}
              className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
            >
              <span className="truncate">{it.name}</span>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingId(it.id);
                    setEditingVal(it.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => remove(it.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ),
        )}
        {items.length === 0 && <p className="text-sm text-muted-foreground">لا توجد عناصر.</p>}
        <div className="flex gap-2 pt-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="عنصر جديد..."
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={add} disabled={busy}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            إضافة
          </Button>
        </div>
      </div>
    </section>
  );
}

export function RefsTab() {
  const [state, setState] = useState<{
    subjects: RefItem[];
    fields: RefItem[];
    grades: RefItem[];
  } | null>(null);

  const load = useCallback(async () => {
    const [s, f, g] = await Promise.all([listSubjects(), listFields(), listGrades()]);
    setState({ subjects: s, fields: f, grades: g });
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e?.message ?? "تعذر تحميل القوائم"));
  }, [load]);

  if (!state) {
    return <p className="py-8 text-center text-sm text-muted-foreground">جاري التحميل...</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        هذه القوائم مشتركة بين كل المعلمين. ما تحذف عنصراً مرتبطاً بمعلم إلا ويفصله تلقائياً.
      </p>
      <RefList title="المواد" table="teacher_subjects" items={state.subjects} onChanged={load} />
      <RefList title="الحقول" table="teacher_fields" items={state.fields} onChanged={load} />
      <RefList title="الصفوف" table="teacher_grades" items={state.grades} onChanged={load} />
    </div>
  );
}
