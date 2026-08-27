import { useState, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { getProfile } from "@/lib/profile";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Paperclip, X, Loader2, ShieldCheck, Palette, Ghost } from "lucide-react";

type Attachment = { url: string; name: string; type: string };

const PRESETS = [
  { label: "افتراضي", bg: null, text: null },
  { label: "ذهبي", bg: "#fef3c7", text: "#78350f" },
  { label: "أزرق", bg: "#dbeafe", text: "#1e3a8a" },
  { label: "أخضر", bg: "#dcfce7", text: "#14532d" },
  { label: "وردي", bg: "#fce7f3", text: "#831843" },
  { label: "أسود", bg: "#111827", text: "#f9fafb" },
  { label: "أحمر", bg: "#fee2e2", text: "#7f1d1d" },
];

export function PostComposer({ onPosted }: { onPosted?: () => void }) {
  const { isAdmin } = useAuth();
  const [content, setContent] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  // admin controls
  const [postAs, setPostAs] = useState<"admin" | "anon">("admin");
  const [anonNumber, setAnonNumber] = useState<string>("");
  const [bg, setBg] = useState<string | null>(null);
  const [txt, setTxt] = useState<string | null>(null);
  const [showStyle, setShowStyle] = useState(false);
  const [brightness, setBrightness] = useState(100); // 50-120

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...list].slice(0, 5));
    e.target.value = "";
  }

  async function uploadAll(): Promise<Attachment[]> {
    const { uploadFile } = await import("@/lib/upload");
    const out: Attachment[] = [];
    for (const f of files) out.push(await uploadFile("posts", f));
    return out;
  }

  async function submit() {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const attachments = files.length ? await uploadAll() : [];
      const row: any = {
        content: content.trim(),
        attachments,
        device_id: getDeviceId(),
      };
      if (isAdmin) {
        row.post_mode = postAs;
        if (bg) row.bg_color = bg;
        if (txt) row.text_color = txt;
        if (bg || txt) row.bg_color = adjustBrightness(bg ?? "#ffffff", brightness);
        if (postAs === "admin") {
          const prof = getProfile();
          const name = authorName.trim() || prof.name || "المسؤول";
          row.author_name = name;
          row.author_avatar_url = prof.avatar_url ?? null;
          await supabase.from("admin_devices").upsert({
            device_id: getDeviceId(),
            display_name: name,
            avatar_url: prof.avatar_url ?? null,
            note: "auto",
          });
        } else {
          // posting as anonymous
          const n = parseInt(anonNumber, 10);
          if (!isNaN(n) && n > 0 && n < 100000) row.anon_number = n;
        }
      }
      const { error } = await supabase.from("posts").insert(row);
      if (error) throw error;
      setContent("");
      setFiles([]);
      if (isAdmin) toast.success("تم النشر");
      else toast.success("تم إرسال المنشور للمراجعة");
      onPosted?.();
    } catch (e: any) {
      console.error("post insert failed", e);
      const msg = e?.message || "";
      if (msg.includes("blocked") || e?.code === "42501") toast.error("تم حظرك من النشر");
      else toast.error("فشل النشر: " + (msg || "خطأ غير معروف"));
    } finally {
      setBusy(false);
    }
  }

  const preview = bg || txt ? { backgroundColor: adjustBrightness(bg ?? "#ffffff", brightness), color: txt ?? undefined } : undefined;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      {isAdmin && (
        <div className="mb-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-primary">النشر كـ:</span>
            <button onClick={() => setPostAs("admin")} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${postAs === "admin" ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"}`}>ادمن</button>
            <button onClick={() => setPostAs("anon")} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${postAs === "anon" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
              <Ghost className="h-3 w-3" /> مجهول
            </button>
            <button onClick={() => setShowStyle((v) => !v)} className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] hover:bg-accent">
              <Palette className="h-3 w-3" /> تنسيق
            </button>
          </div>

          {postAs === "admin" && (
            <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="اسم الظهور (اختياري)" maxLength={50} />
          )}
          {postAs === "anon" && (
            <Input value={anonNumber} onChange={(e) => setAnonNumber(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="رقم المجهول (اختياري، عشوائي إذا فارغ)" />
          )}

          {showStyle && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <div className="text-[11px] text-muted-foreground">لون خلفية المنشور</div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.label} onClick={() => { setBg(p.bg); setTxt(p.text); }}
                    className={`h-8 min-w-16 rounded-full border-2 px-2 text-[11px] font-medium ${bg === p.bg ? "border-primary" : "border-border"}`}
                    style={{ backgroundColor: p.bg ?? "transparent", color: p.text ?? undefined }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-[11px]">خلفية: <input type="color" value={bg ?? "#ffffff"} onChange={(e) => setBg(e.target.value)} className="h-7 w-9 rounded border border-border" /></label>
                <label className="flex items-center gap-1 text-[11px]">نص: <input type="color" value={txt ?? "#000000"} onChange={(e) => setTxt(e.target.value)} className="h-7 w-9 rounded border border-border" /></label>
                <Button size="sm" variant="ghost" onClick={() => { setBg(null); setTxt(null); setBrightness(100); }}>مسح</Button>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span>السطوع</span>
                <input type="range" min={50} max={130} value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))} className="flex-1" />
                <span className="w-8 text-left">{brightness}%</span>
              </div>
            </div>
          )}
        </div>
      )}
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={isAdmin ? "اكتب منشورك..." : "اكتب ما يخطر في بالك... سيُراجع قبل النشر."}
        className="min-h-[110px] resize-none border-0 focus-visible:ring-0"
        style={preview}
        maxLength={5000}
      />
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Paperclip className="h-4 w-4" /> إرفاق
          <input type="file" multiple className="hidden" onChange={onFileChange} accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.txt,.zip" />
        </label>
        <Button onClick={submit} disabled={busy || !content.trim()}>
          {busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
          {isAdmin ? "نشر" : "إرسال للمراجعة"}
        </Button>
      </div>
      {!isAdmin && (
        <p className="mt-2 text-xs text-muted-foreground">ملاحظة: لن يظهر منشورك حتى يوافق عليه المسؤول.</p>
      )}
    </div>
  );
}

function adjustBrightness(hex: string, pct: number): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const f = pct / 100;
  const cl = (n: number) => Math.max(0, Math.min(255, Math.round(n * f)));
  return `#${cl(r).toString(16).padStart(2, "0")}${cl(g).toString(16).padStart(2, "0")}${cl(b).toString(16).padStart(2, "0")}`;
}
