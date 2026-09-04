import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { getProfile, setProfile, type ChatProfile } from "@/lib/profile";
import { uploadFile } from "@/lib/upload";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Loader2, Send, Trash2, Ban, ImagePlus, UserCircle2, Heart, MessageCircle,
  Paperclip, X, Pencil, Pin, PinOff, MicOff, Reply,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { BanDialog } from "@/components/ban-dialog";

type Attachment = { url: string; name: string; type: string };
type ChatPost = {
  id: string; device_id: string; display_name: string; avatar_url: string | null;
  content: string; attachments: Attachment[]; pinned: boolean; is_admin: boolean;
  created_at: string; edited_at: string | null;
};
type ChatComment = {
  id: string; post_id: string; parent_id: string | null;
  device_id: string; display_name: string; avatar_url: string | null;
  content: string; created_at: string; edited_at: string | null;
};

function timeAgo(d: string) {
  try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ar }); } catch { return ""; }
}

function isImage(a: Attachment) { return a.type?.startsWith("image/"); }
function isVideo(a: Attachment) { return a.type?.startsWith("video/"); }
function isAudio(a: Attachment) { return a.type?.startsWith("audio/"); }

function AttachmentView({ a }: { a: Attachment }) {
  if (isImage(a)) return <a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="max-h-96 rounded-lg border border-border object-cover" /></a>;
  if (isVideo(a)) return <video src={a.url} controls className="max-h-96 w-full rounded-lg border border-border" />;
  if (isAudio(a)) return <audio src={a.url} controls className="w-full" />;
  return <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm hover:bg-accent">📎 {a.name}</a>;
}

function ProfileBar({ profile, setProfileState }: { profile: ChatProfile; setProfileState: (p: ChatProfile) => void }) {
  const [editing, setEditing] = useState(!profile.name);
  const [tmpName, setTmpName] = useState(profile.name);
  const [uploading, setUploading] = useState(false);
  const [tmpAvatar, setTmpAvatar] = useState<string | null>(profile.avatar_url);

  async function onAvatar(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const r = await uploadFile("avatars", f);
      setTmpAvatar(r.url);
    } catch (err: any) {
      toast.error("فشل رفع الصورة: " + (err?.message || ""));
    } finally { setUploading(false); }
  }

  function save() {
    const name = tmpName.trim();
    if (!name) { toast.error("اكتب اسماً"); return; }
    const p = { name, avatar_url: tmpAvatar };
    setProfile(p); setProfileState(p); setEditing(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <Avatar className="h-12 w-12">
        <AvatarImage src={(editing ? tmpAvatar : profile.avatar_url) ?? undefined} />
        <AvatarFallback><UserCircle2 className="h-6 w-6" /></AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input value={tmpName} onChange={(e) => setTmpName(e.target.value)} placeholder="اسمك" maxLength={40} className="h-9 max-w-[180px]" />
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs hover:bg-accent">
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />} صورة
              <input type="file" accept="image/*" className="hidden" onChange={onAvatar} />
            </label>
            <Button size="sm" onClick={save}>حفظ</Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{profile.name}</div>
              <div className="text-xs text-muted-foreground">ملفك الشخصي</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { setTmpName(profile.name); setTmpAvatar(profile.avatar_url); setEditing(true); }}>تعديل</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({ profile, onPosted }: { profile: ChatProfile; onPosted: () => void }) {
  const { isAdmin } = useAuth();
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      supabase.from("admin_devices").upsert({ device_id: getDeviceId(), note: "auto" }).then(() => {});
    }
  }, [isAdmin]);

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setFiles((p) => [...p, ...list].slice(0, 5));
    e.target.value = "";
  }

  async function submit() {
    if (!content.trim()) { toast.error("اكتب شيئاً"); return; }
    if (!profile.name) { toast.error("اضبط اسمك أولاً"); return; }
    setBusy(true);
    try {
      const atts: Attachment[] = [];
      for (const f of files) atts.push(await uploadFile("chat", f));
      const { error } = await supabase.from("chat_posts").insert({
        device_id: getDeviceId(),
        display_name: profile.name,
        avatar_url: profile.avatar_url,
        content: content.trim(),
        attachments: atts,
      });
      if (error) throw error;
      setContent(""); setFiles([]); onPosted();
    } catch (e: any) {
      toast.error(e?.message?.includes("blocked") ? "تم حظرك" : "فشل النشر: " + (e?.message || ""));
    } finally { setBusy(false); }
  }


  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="شارك ما في بالك..." className="min-h-[80px] resize-none border-0 bg-transparent focus-visible:ring-0" maxLength={5000} />
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Paperclip className="h-4 w-4" /> صور / فيديو / ملفات
          <input type="file" multiple className="hidden" onChange={onFiles} accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.txt,.zip" />
        </label>
        <Button onClick={submit} disabled={busy || !content.trim()}>
          {busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}نشر
        </Button>
      </div>
    </div>
  );
}

function CommentNode({ c, all, profile }: { c: ChatComment; all: ChatComment[]; profile: ChatProfile }) {
  const { isAdmin } = useAuth();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [editText, setEditText] = useState(c.content);
  const [busy, setBusy] = useState(false);
  const isMine = typeof window !== "undefined" && c.device_id === getDeviceId();
  const children = all.filter((x) => x.parent_id === c.id);

  async function send() {
    if (!text.trim()) return;
    if (!profile.name) { toast.error("اضبط اسمك أولاً"); return; }
    setBusy(true);
    const { error } = await supabase.from("chat_comments").insert({
      post_id: c.post_id, parent_id: c.id, content: text.trim(),
      device_id: getDeviceId(), display_name: profile.name, avatar_url: profile.avatar_url,
    });
    setBusy(false);
    if (error) { toast.error(error.message?.includes("blocked") ? "محظور" : "فشل الرد"); return; }
    setText(""); setReplying(false);
  }

  async function saveEdit() {
    const v = editText.trim();
    if (!v) return;
    const { error } = await supabase.rpc("edit_chat_comment", { p_id: c.id, p_device_id: getDeviceId(), p_content: v });
    if (error) toast.error("فشل التعديل"); else setEditing(false);
  }

  async function del() {
    if (!confirm("حذف التعليق؟")) return;
    const { error } = await supabase.from("chat_comments").delete().eq("id", c.id);
    if (error) toast.error("فشل: " + error.message);
  }

  return (
    <div className="border-r-2 border-border pr-3">
      <div className="rounded-lg bg-muted/40 p-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7"><AvatarImage src={c.avatar_url ?? undefined} /><AvatarFallback>{c.display_name.slice(0,1)}</AvatarFallback></Avatar>
          <span className="text-sm font-semibold">{c.display_name}</span>
          <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}{c.edited_at ? " (معدّل)" : ""}</span>
        </div>
        {editing ? (
          <div className="mt-2 space-y-2">
            <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[60px] text-sm" maxLength={2000} />
            <div className="flex gap-2"><Button size="sm" onClick={saveEdit}>حفظ</Button><Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditText(c.content); }}>إلغاء</Button></div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm">{c.content}</p>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs">
          <button onClick={() => setReplying((v) => !v)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Reply className="h-3 w-3" /> رد</button>
          {isMine && !editing && <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /> تعديل</button>}
          {isAdmin && <button onClick={del} className="flex items-center gap-1 text-destructive"><Trash2 className="h-3 w-3" /> حذف</button>}
        </div>
        {replying && (
          <div className="mt-2 space-y-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب ردك..." className="min-h-[60px] text-sm" />
            <Button size="sm" onClick={send} disabled={busy || !text.trim()}>{busy && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}إرسال</Button>
          </div>
        )}
      </div>
      {children.length > 0 && <div className="mt-2 space-y-2">{children.map((ch) => <CommentNode key={ch.id} c={ch} all={all} profile={profile} />)}</div>}
    </div>
  );
}

type PostRealtimeReg = { postId: string; refreshComments: () => void; refreshLikes: () => void };

function PostCard({ post, profile, mutedSet, realtimeReg }: {
  post: ChatPost; profile: ChatProfile; mutedSet: Set<string>;
  realtimeReg: (reg: PostRealtimeReg) => void;
}) {
  const isAdminPost = post.is_admin;
  const { isAdmin } = useAuth();
  const [comments, setComments] = useState<ChatComment[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.content);
  const [banOpen, setBanOpen] = useState(false);


  const myDeviceId = typeof window !== "undefined" ? getDeviceId() : "";
  const isMine = post.device_id === myDeviceId;
  const muteKey = `${post.id}:${myDeviceId}`;
  const iAmMuted = mutedSet.has(muteKey);

  async function loadComments() {
    const { data } = await supabase.from("chat_comments").select("*").eq("post_id", post.id).order("created_at", { ascending: true });
    setComments((data as ChatComment[]) ?? []);
  }
  async function loadLikes() {
    const { data } = await supabase.from("chat_likes").select("device_id").eq("post_id", post.id);
    const list = data ?? [];
    setLikeCount(list.length);
    setLiked(list.some((l: any) => l.device_id === myDeviceId));
  }

  useEffect(() => {
    loadComments(); loadLikes();
    realtimeReg({ postId: post.id, refreshComments: loadComments, refreshLikes: loadLikes });
    return () => realtimeReg(null as unknown as PostRealtimeReg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  async function toggleLike() {
    if (likeBusy) return;
    setLikeBusy(true);
    if (liked) {
      const { error } = await supabase.rpc("unlike_chat_post", { p_post_id: post.id, p_device_id: myDeviceId });
      if (error) toast.error("فشل");
    } else {
      const { error } = await supabase.from("chat_likes").insert({ post_id: post.id, device_id: myDeviceId });
      if (error && !error.message.includes("duplicate")) toast.error(error.message.includes("blocked") ? "محظور" : "فشل");
    }
    await loadLikes();
    setLikeBusy(false);
  }

  async function sendComment() {
    if (!text.trim()) return;
    if (!profile.name) { toast.error("اضبط اسمك أولاً"); return; }
    setBusy(true);
    const { error } = await supabase.from("chat_comments").insert({
      post_id: post.id, content: text.trim(), device_id: myDeviceId,
      display_name: profile.name, avatar_url: profile.avatar_url, parent_id: null,
    });
    setBusy(false);
    if (error) { toast.error(error.message?.includes("muted") || error.message?.includes("chat_post_mutes") ? "تم كتم تعليقك على هذا المنشور" : error.message?.includes("blocked") ? "محظور" : "فشل التعليق"); return; }
    setText("");
  }

  async function saveEdit() {
    const v = editText.trim();
    if (!v) return;
    const { error } = await supabase.rpc("edit_chat_post", { p_id: post.id, p_device_id: myDeviceId, p_content: v });
    if (error) toast.error("فشل التعديل"); else { setEditing(false); toast.success("تم"); }
  }

  async function del() {
    if (!confirm("حذف المنشور؟")) return;
    const { error } = await supabase.from("chat_posts").delete().eq("id", post.id);
    if (error) toast.error("فشل: " + error.message);
  }
  async function togglePin() {
    const { error } = await supabase.from("chat_posts").update({ pinned: !post.pinned }).eq("id", post.id);
    if (error) toast.error("فشل: " + error.message);
  }
  function blockDevice() { setBanOpen(true); }
  async function muteAuthor() {
    if (!confirm("كتم صاحب هذا المنشور عن التعليق هنا فقط؟")) return;
    const { error } = await supabase.from("chat_post_mutes").upsert({ post_id: post.id, device_id: post.device_id });
    if (error) toast.error("فشل: " + error.message); else toast.success("تم الكتم على هذا المنشور");
  }

  async function muteCommenter(deviceId: string) {
    if (deviceId === post.device_id) return muteAuthor();
    if (!confirm("كتم هذا الشخص عن التعليق على هذا المنشور فقط؟")) return;
    const { error } = await supabase.from("chat_post_mutes").upsert({ post_id: post.id, device_id: deviceId });
    if (error) toast.error("فشل: " + error.message); else toast.success("تم الكتم");
  }

  const roots = comments.filter((c) => !c.parent_id);

  return (
    <article className={`rounded-2xl border p-4 ${
      isAdminPost
        ? "border-amber-400/70 bg-gradient-to-br from-amber-50 to-amber-100/40 ring-2 ring-amber-300/60 dark:from-amber-950/40 dark:to-amber-900/10 dark:border-amber-500/50"
        : post.pinned ? "border-primary/60 bg-card ring-1 ring-primary/30" : "border-border bg-card"
    }`}>
      {post.pinned && <div className="mb-2 flex items-center gap-1 text-xs font-medium text-primary"><Pin className="h-3 w-3" /> مثبّت</div>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className={`h-9 w-9 ${isAdminPost ? "ring-2 ring-amber-400" : ""}`}><AvatarImage src={post.avatar_url ?? undefined} /><AvatarFallback>{post.display_name.slice(0,1)}</AvatarFallback></Avatar>
          <div>
            <div className="flex items-center gap-1.5">
              <div className="text-sm font-semibold">{post.display_name}</div>
              {isAdminPost && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">ادمن</span>}
            </div>
            <div className="text-xs text-muted-foreground">{timeAgo(post.created_at)}{post.edited_at ? " (معدّل)" : ""}</div>
          </div>
        </div>
        {isAdmin && <span className="font-mono text-[10px] text-muted-foreground" title={post.device_id}>{post.device_id.slice(0, 10)}…</span>}
      </div>


      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[80px]" maxLength={5000} />
          <div className="flex gap-2"><Button size="sm" onClick={saveEdit}>حفظ</Button><Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditText(post.content); }}>إلغاء</Button></div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap leading-relaxed">{post.content}</p>
      )}

      {post.attachments?.length > 0 && <div className="mt-3 flex flex-col gap-2">{post.attachments.map((a, i) => <AttachmentView key={i} a={a} />)}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button onClick={toggleLike} disabled={likeBusy} className={`flex items-center gap-1 ${liked ? "text-red-500" : "text-muted-foreground hover:text-red-500"}`}>
          <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} /> {likeCount}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><MessageCircle className="h-4 w-4" /> {comments.length} تعليق</button>
        {isMine && !editing && <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /> تعديل</button>}
        {isAdmin && (
          <>
            <button onClick={togglePin} className="flex items-center gap-1 text-primary">{post.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}{post.pinned ? "إلغاء التثبيت" : "تثبيت"}</button>
            <button onClick={muteAuthor} className="flex items-center gap-1 text-amber-600"><MicOff className="h-4 w-4" /> كتم هنا</button>
            <button onClick={del} className="flex items-center gap-1 text-destructive"><Trash2 className="h-4 w-4" /> حذف</button>
            <button onClick={blockDevice} className="flex items-center gap-1 text-destructive"><Ban className="h-4 w-4" /> حظر الجهاز</button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          {iAmMuted ? (
            <p className="text-center text-sm text-muted-foreground">تم كتمك عن التعليق على هذا المنشور.</p>
          ) : (
            <div className="flex gap-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={profile.name ? "علّق..." : "اضبط اسمك أولاً"} className="min-h-[60px]" />
              <Button onClick={sendComment} disabled={busy || !text.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
            </div>
          )}
          <div className="space-y-2">
            {roots.map((c) => (
              <div key={c.id}>
                <CommentNode c={c} all={comments} profile={profile} />
                {isAdmin && c.device_id !== post.device_id && (
                  <button onClick={() => muteCommenter(c.device_id)} className="mr-3 mt-1 text-[10px] text-amber-600 hover:underline">كتم هذا المعلّق هنا</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <BanDialog deviceId={post.device_id} open={banOpen} onOpenChange={setBanOpen} />
    </article>
  );
}

export function ChatRoom() {
  const [profile, setProfileState] = useState<ChatProfile>({ name: "", avatar_url: null });
  const [posts, setPosts] = useState<ChatPost[]>([]);
  const [mutes, setMutes] = useState<{ post_id: string; device_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const initRef = useRef(false);
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    setProfileState(getProfile());
  }, []);

  async function load() {
    const postsReq = supabase.from("chat_posts").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(100);
    // chat_post_mutes is admins-only now — regular users read an empty set,
    // which is fine because the DB still enforces mutes on insert.
    const mutesReq = isAdmin
      ? supabase.from("chat_post_mutes").select("post_id, device_id")
      : Promise.resolve({ data: [] as { post_id: string; device_id: string }[] });
    const [{ data: p }, { data: m }] = await Promise.all([postsReq, mutesReq]);
    setPosts(((p as unknown) as ChatPost[]) ?? []);
    setMutes(m ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("chat-posts-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_posts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_post_mutes" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const mutedSet = new Set(mutes.map((x) => `${x.post_id}:${x.device_id}`));

  return (
    <div className="space-y-4">
      <ProfileBar profile={profile} setProfileState={setProfileState} />
      {profile.name && <Composer profile={profile} onPosted={load} />}
      {loading ? (
        <p className="py-10 text-center text-muted-foreground">جاري التحميل...</p>
      ) : posts.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">لا منشورات بعد. كن أول من يشارك!</p>
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} profile={profile} mutedSet={mutedSet} />)
      )}

    </div>
  );
}
