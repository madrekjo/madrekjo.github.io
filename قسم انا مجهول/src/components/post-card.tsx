import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { getProfile } from "@/lib/profile";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Ghost, MessageCircle, Trash2, Ban, Loader2, Reply, Pin, PinOff, ShieldCheck, Heart, Pencil, Settings2, History } from "lucide-react";
import { toast } from "sonner";
import { DeviceInspector } from "@/components/device-inspector";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDeviceLabel } from "@/lib/device-labels";
import { ReportButton } from "@/components/report-dialog";

type EditRow = { id: string; previous_content: string; new_content: string; edited_at: string };

function EditHistoryDialog({ kind, id, open, onOpenChange }: { kind: "post" | "comment"; id: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const table = kind === "post" ? "post_edits" : "comment_edits";
    const col = kind === "post" ? "post_id" : "comment_id";
    (supabase.from(table as any) as any)
      .select("id, previous_content, new_content, edited_at")
      .eq(col, id)
      .order("edited_at", { ascending: false })
      .then(({ data }: any) => { setRows(data ?? []); setLoading(false); });
  }, [open, id, kind]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>سجل التعديلات</DialogTitle></DialogHeader>
        {loading && <p className="text-sm text-muted-foreground">جاري التحميل...</p>}
        {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">لا توجد تعديلات مسجلة.</p>}
        <div className="max-h-[60vh] overflow-y-auto space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="mb-1 text-[10px] text-muted-foreground">{new Date(r.edited_at).toLocaleString("ar")}</div>
              <div className="rounded bg-red-500/10 p-2 text-red-800 dark:text-red-300 whitespace-pre-wrap"><span className="text-[10px] font-bold">قبل:</span> {r.previous_content}</div>
              <div className="mt-1 rounded bg-green-500/10 p-2 text-green-800 dark:text-green-300 whitespace-pre-wrap"><span className="text-[10px] font-bold">بعد:</span> {r.new_content}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}



type Attachment = { url: string; name: string; type: string };
type Post = {
  id: string;
  content: string;
  attachments: Attachment[];
  device_id: string;
  created_at: string;
  edited_at?: string | null;
  status?: string;
  pinned?: boolean;
  is_admin?: boolean;
  author_name?: string | null;
  author_avatar_url?: string | null;
  user_id?: string | null;
  anon_number?: number | null;
  bg_color?: string | null;
  text_color?: string | null;
  post_mode?: string | null;
};
type Comment = {
  id: string;
  post_id: string;
  parent_id: string | null;
  content: string;
  device_id: string;
  created_at: string;
  edited_at?: string | null;
  anon_number?: number | null;
  is_admin?: boolean;
  author_name?: string | null;
  author_avatar_url?: string | null;
  bg_color?: string | null;
  text_color?: string | null;
};


function isImage(a: Attachment) { return a.type?.startsWith("image/"); }
function isVideo(a: Attachment) { return a.type?.startsWith("video/"); }
function isAudio(a: Attachment) { return a.type?.startsWith("audio/"); }

function AttachmentView({ a }: { a: Attachment }) {
  if (isImage(a)) {
    return (
      <a href={a.url} target="_blank" rel="noreferrer">
        <img src={a.url} alt={a.name} className="max-h-96 rounded-lg border border-border object-cover" />
      </a>
    );
  }
  if (isVideo(a)) return <video src={a.url} controls className="max-h-96 w-full rounded-lg border border-border" />;
  if (isAudio(a)) return <audio src={a.url} controls className="w-full" />;
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm hover:bg-accent">
      📎 {a.name}
    </a>
  );
}

function timeAgo(d: string) {
  try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ar }); } catch { return ""; }
}

function anonLabel(n?: number | null) {
  return n ? `مجهول ${n}` : "مجهول";
}

function CommentNode({ c, all, postId, postAuthorDeviceId, onChanged }: { c: Comment; all: Comment[]; postId: string; postAuthorDeviceId: string; onChanged: () => void }) {
  const { isAdmin } = useAuth();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(c.content);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const label = useDeviceLabel(c.device_id, isAdmin);
  const children = all.filter((x) => x.parent_id === c.id);
  const isMine = typeof window !== "undefined" && c.device_id === getDeviceId();
  const isAdminComment = !!c.is_admin;
  const isPostAuthor = !isAdminComment && c.device_id === postAuthorDeviceId;

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    if (isAdmin) {
      const prof = getProfile();
      await supabase.from("admin_devices").upsert({
        device_id: getDeviceId(),
        display_name: prof.name || "الادمن",
        avatar_url: prof.avatar_url ?? null,
        note: "auto",
      });
    }
    const { error } = await supabase.from("comments").insert({
      post_id: postId, parent_id: c.id, content: text.trim(), device_id: getDeviceId(),
    });
    setBusy(false);
    if (error) { toast.error("فشل الرد"); return; }
    setText(""); setReplying(false); onChanged();
  }

  async function saveEdit() {
    const v = editText.trim();
    if (!v) return;
    const { error } = await supabase.rpc("edit_comment", { p_id: c.id, p_device_id: getDeviceId(), p_content: v });
    if (error) { toast.error("فشل التعديل"); return; }
    setEditing(false); onChanged();
  }

  async function del() {
    if (!confirm("حذف التعليق؟")) return;
    const { error } = await supabase.from("comments").delete().eq("id", c.id);
    if (error) toast.error("فشل الحذف: " + error.message); else { toast.success("تم"); onChanged(); }
  }

  const labelEl = isAdminComment ? (
    <span className="flex items-center gap-1.5">
      <Avatar className="h-5 w-5 ring-1 ring-amber-400"><AvatarImage src={c.author_avatar_url ?? undefined} /><AvatarFallback><ShieldCheck className="h-3 w-3" /></AvatarFallback></Avatar>
      <span className="font-semibold text-amber-600">{c.author_name || "الادمن"}</span>
      <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">ادمن</span>
    </span>
  ) : (
    <span className="flex items-center gap-1">
      <Ghost className="h-3 w-3" /> {anonLabel(c.anon_number)}
      {isPostAuthor && <span className="mr-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary">صاحب المنشور</span>}
      {isAdmin && label && <span className="mr-1 rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600 dark:text-purple-300">🔖 {label}</span>}
    </span>
  );

  const bubbleStyle = (c.bg_color || c.text_color) ? { backgroundColor: c.bg_color ?? undefined, color: c.text_color ?? undefined } : undefined;


  return (
    <div className="border-r-2 border-border pr-3">
      <div className={`rounded-lg p-3 ${isAdminComment ? "bg-amber-50 ring-1 ring-amber-300/60 dark:bg-amber-950/30" : bubbleStyle ? "" : "bg-muted/40"}`} style={bubbleStyle}>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {labelEl}
            {isAdmin && !isAdminComment && (
              <button onClick={() => setInspect(true)} className="mr-1 inline-flex items-center rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="خيارات الجهاز">
                <Settings2 className="h-3 w-3" />
              </button>
            )}
          </span>
          <span>{timeAgo(c.created_at)}{c.edited_at ? " (معدّل)" : ""}</span>
        </div>
        {editing ? (
          <div className="mt-2 space-y-2">
            <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[60px] text-sm" maxLength={2000} />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit}>حفظ</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditText(c.content); }}>إلغاء</Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm">{c.content}</p>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs">
          <button onClick={() => setReplying((v) => !v)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Reply className="h-3 w-3" /> رد
          </button>
          {isMine && !editing && (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <Pencil className="h-3 w-3" /> تعديل
            </button>
          )}
          {isAdmin && c.edited_at && (
            <button onClick={() => setShowHistory(true)} className="flex items-center gap-1 text-purple-600 hover:opacity-80" title="سجل التعديلات">
              <History className="h-3 w-3" /> السجل
            </button>
          )}
          {isAdmin && (
            <button onClick={del} className="flex items-center gap-1 text-destructive hover:opacity-80">
              <Trash2 className="h-3 w-3" /> حذف
            </button>
          )}
          {!isMine && <ReportButton contentType="comment" contentId={c.id} compact />}
        </div>
        {replying && (
          <div className="mt-2 space-y-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب ردك..." className="min-h-[60px] text-sm" />
            <Button size="sm" onClick={submit} disabled={busy || !text.trim()}>
              {busy && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}إرسال
            </Button>
          </div>
        )}
      </div>
      {isAdmin && <DeviceInspector deviceId={c.device_id} open={inspect} onOpenChange={setInspect} />}
      {isAdmin && <EditHistoryDialog kind="comment" id={c.id} open={showHistory} onOpenChange={setShowHistory} />}
      {children.length > 0 && (
        <div className="mt-2 space-y-2">
          {children.map((ch) => <CommentNode key={ch.id} c={ch} all={all} postId={postId} postAuthorDeviceId={postAuthorDeviceId} onChanged={onChanged} />)}
        </div>
      )}
    </div>
  );
}

export function PostCard({ post, onDeleted, onChanged }: { post: Post; onDeleted: () => void; onChanged?: () => void }) {
  const { isAdmin } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.content);
  const [inspect, setInspect] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const label = useDeviceLabel(post.device_id, isAdmin);

  const isAdminPost = !!post.is_admin;
  const isMine = typeof window !== "undefined" && post.device_id === getDeviceId();
  const hasCustomStyle = !!(post.bg_color || post.text_color);
  const articleStyle = hasCustomStyle ? { backgroundColor: post.bg_color ?? undefined, color: post.text_color ?? undefined } : undefined;

  async function loadComments() {
    const { data } = await supabase.from("comments").select("*").eq("post_id", post.id).order("created_at", { ascending: true });
    setComments((data as Comment[]) ?? []);
  }

  async function loadLikes() {
    const did = getDeviceId();
    const { data } = await supabase.from("post_likes").select("device_id").eq("post_id", post.id);
    const list = data ?? [];
    setLikeCount(list.length);
    setLiked(list.some((l: any) => l.device_id === did));
  }

  useEffect(() => {
    loadComments();
    loadLikes();
    const ch = supabase.channel(`c-${post.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${post.id}` }, loadComments)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes", filter: `post_id=eq.${post.id}` }, loadLikes)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  async function toggleLike() {
    if (likeBusy) return;
    setLikeBusy(true);
    const did = getDeviceId();
    if (liked) {
      const { error } = await supabase.rpc("unlike_post", { p_post_id: post.id, p_device_id: did });
      if (error) toast.error("فشل");
    } else {
      const { error } = await supabase.from("post_likes").insert({ post_id: post.id, device_id: did });
      if (error && !error.message.includes("duplicate")) toast.error(error.message.includes("blocked") ? "تم حظرك" : "فشل الإعجاب");
    }
    await loadLikes();
    setLikeBusy(false);
  }

  async function comment() {
    if (!text.trim()) return;
    setBusy(true);
    if (isAdmin) {
      const prof = getProfile();
      await supabase.from("admin_devices").upsert({
        device_id: getDeviceId(),
        display_name: prof.name || "الادمن",
        avatar_url: prof.avatar_url ?? null,
        note: "auto",
      });
    }
    const { error } = await supabase.from("comments").insert({
      post_id: post.id, content: text.trim(), device_id: getDeviceId(), parent_id: null,
    });
    setBusy(false);
    if (error) { toast.error(error.message?.includes("blocked") ? "تم حظرك" : "فشل التعليق"); return; }
    setText("");
  }

  async function del() {
    if (!confirm("حذف المنشور؟")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) toast.error("فشل الحذف: " + error.message); else { toast.success("تم الحذف"); onDeleted(); }
  }

  async function block() {
    if (!confirm("حظر جهاز صاحب المنشور؟")) return;
    const { error } = await supabase.from("blocked_devices").upsert({ device_id: post.device_id, reason: "from post" });
    if (error) toast.error("فشل الحظر: " + error.message); else toast.success("تم الحظر");
  }

  async function togglePin() {
    const { error } = await supabase.from("posts").update({ pinned: !post.pinned }).eq("id", post.id);
    if (error) toast.error("فشل: " + error.message); else { toast.success(post.pinned ? "أُلغي التثبيت" : "تم التثبيت"); onChanged?.(); }
  }

  async function saveEdit() {
    const v = editText.trim();
    if (!v) return;
    const { error } = await supabase.rpc("edit_post", { p_id: post.id, p_device_id: getDeviceId(), p_content: v });
    if (error) toast.error("فشل التعديل");
    else { toast.success("تم"); setEditing(false); onChanged?.(); }
  }

  const roots = comments.filter((c) => !c.parent_id);

  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm ${
        hasCustomStyle
          ? "border-border"
          : isAdminPost
          ? "border-amber-400/70 bg-gradient-to-br from-amber-50 to-amber-100/40 ring-2 ring-amber-300/60 dark:from-amber-950/40 dark:to-amber-900/10 dark:border-amber-500/50"
          : post.pinned ? "border-primary/60 bg-card ring-1 ring-primary/30" : "border-border bg-card"
      }`}
      style={articleStyle}
    >
      {post.pinned && (
        <div className="mb-2 flex items-center gap-1 text-xs font-medium text-primary">
          <Pin className="h-3 w-3" /> مثبّت
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          {isAdminPost ? (
            <Avatar className="h-9 w-9 ring-2 ring-amber-400">
              <AvatarImage src={post.author_avatar_url ?? undefined} />
              <AvatarFallback className="bg-amber-500 text-white"><ShieldCheck className="h-4 w-4" /></AvatarFallback>
            </Avatar>
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary">
              <Ghost className="h-4 w-4" />
            </span>
          )}
          <span className="flex items-center gap-1.5 font-medium">
            {isAdminPost ? post.author_name : anonLabel(post.anon_number)}
            {isAdminPost && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">ادمن</span>}
            {isAdmin && !isAdminPost && label && (
              <span className="rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-300">🔖 {label}</span>
            )}
            {isAdmin && (
              <button onClick={() => setInspect(true)} className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="خيارات الجهاز">
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </span>
        <span className="text-xs">{timeAgo(post.created_at)}{post.edited_at ? " (معدّل)" : ""}</span>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[90px]" maxLength={5000} />
          <div className="flex gap-2">

            <Button size="sm" onClick={saveEdit}>حفظ</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditText(post.content); }}>إلغاء</Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap leading-relaxed">{post.content}</p>
      )}

      {post.attachments?.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {post.attachments.map((a, i) => <AttachmentView key={i} a={a} />)}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button onClick={toggleLike} disabled={likeBusy} className={`flex items-center gap-1 transition-colors ${liked ? "text-red-500" : "text-muted-foreground hover:text-red-500"}`}>
          <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
          {likeCount}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <MessageCircle className="h-4 w-4" />
          {comments.length} تعليق
        </button>
        {isMine && !isAdminPost && !editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Pencil className="h-4 w-4" /> تعديل
          </button>
        )}
        {isAdmin && (
          <>
            <button onClick={togglePin} className="flex items-center gap-1 text-primary hover:opacity-80">
              {post.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              {post.pinned ? "إلغاء التثبيت" : "تثبيت"}
            </button>
            <button onClick={del} className="flex items-center gap-1 text-destructive hover:opacity-80">
              <Trash2 className="h-4 w-4" /> حذف
            </button>
            {post.edited_at && (
              <button onClick={() => setShowHistory(true)} className="flex items-center gap-1 text-purple-600 hover:opacity-80">
                <History className="h-4 w-4" /> سجل التعديلات
              </button>
            )}
            {!isAdminPost && (
              <button onClick={() => setInspect(true)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                <Settings2 className="h-4 w-4" /> ملف الجهاز
              </button>
            )}
          </>
        )}
        {!isMine && !isAdminPost && <ReportButton contentType="post" contentId={post.id} />}
      </div>

      {isAdmin && <DeviceInspector deviceId={post.device_id} open={inspect} onOpenChange={setInspect} />}
      {isAdmin && <EditHistoryDialog kind="post" id={post.id} open={showHistory} onOpenChange={setShowHistory} />}

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          <div className="flex gap-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="علّق مجهولاً..." className="min-h-[60px]" />
            <Button onClick={comment} disabled={busy || !text.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "تعليق"}
            </Button>
          </div>
          <div className="space-y-2">
            {roots.map((c) => <CommentNode key={c.id} c={c} all={comments} postId={post.id} postAuthorDeviceId={post.device_id} onChanged={loadComments} />)}
          </div>
        </div>
      )}
    </article>
  );
}
