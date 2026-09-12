import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, UserRound, RefreshCcw, MonitorSmartphone, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import {
  listAdminProfiles,
  saveAdminProfile,
  getOrCreateDeviceId,
  type AdminProfile,
} from "@/lib/teacher-files";

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleString("ar-JO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return ts;
  }
}

export function AdminProfilesTab() {
  const [profiles, setProfiles] = useState<AdminProfile[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVal, setEditingVal] = useState("");
  const [busy, setBusy] = useState(false);

  const currentDeviceId = getOrCreateDeviceId();

  async function load() {
    try {
      setProfiles(await listAdminProfiles());
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر تحميل القائمة");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function saveRename(id: string) {
    const v = editingVal.trim();
    if (!v) return;
    setBusy(true);
    try {
      await saveAdminProfile(v);
      setEditingId(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">جميع من دخلوا بالرمز وعرّفوا أنفسهم.</p>
        <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
          <RefreshCcw className={`ml-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {profiles === null ? (
        <p className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </p>
      ) : profiles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          لم يُدخل أي شخص الرمز بعد.
        </p>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => {
            const isMine = p.device_id === currentDeviceId;
            const isEditing = editingId === p.id;
            return (
              <div
                key={p.id}
                className={`flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${isMine ? "border-primary/40 bg-primary/5" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold">
                    <UserRound className="h-4 w-4 text-accent-foreground" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isEditing ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveRename(p.id);
                          }}
                          className="flex items-center gap-1"
                        >
                          <input
                            autoFocus
                            value={editingVal}
                            onChange={(e) => setEditingVal(e.target.value)}
                            className="rounded-md border border-border bg-background px-2 py-0.5 text-sm outline-none focus:border-primary"
                          />
                          <Button size="icon" variant="ghost" type="submit" disabled={busy} className="h-6 w-6">
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </Button>
                        </form>
                      ) : (
                        <span className="text-sm font-bold">
                          {p.name}
                          {isMine && (
                            <span className="mr-1 inline-block rounded-full bg-primary/20 px-1.5 py-px text-[10px] font-medium text-primary">
                              أنت
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MonitorSmartphone className="h-3 w-3" />
                        {p.device_id.slice(0, 12)}…
                      </span>
                      <span>انضم {formatTs(p.created_at)}</span>
                      {p.last_seen_at && <span>آخر ظهور {formatTs(p.last_seen_at)}</span>}
                    </div>
                  </div>
                </div>
                {isMine && !isEditing && (
                  <button
                    onClick={() => {
                      setEditingId(p.id);
                      setEditingVal(p.name);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="inline h-3.5 w-3.5 ml-1" />
                    تعديل اسمي
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}