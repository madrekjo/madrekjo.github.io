import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Send, Loader2, MessageSquare, ChevronDown, ChevronUp, Trash2, Edit2, Check, X, Settings, ImagePlus, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import UserActionsDialog from "@/components/UserActionsDialog";
import Lightbox from "@/components/Lightbox";
import { compressImage } from "@/lib/mediaCompression";
import { uploadMedia } from "@/lib/storage";

interface SupportMessage {
  id: string;
  user_id: string | null;
  sender_id: string | null;
  content: string;
  image_urls?: string[] | null;
  is_read: boolean;
  created_at: string;
  guest_token?: string | null;
  guest_name?: string | null;
  guest_contact?: string | null;
  from_admin?: boolean;
}

interface ConversationGroup {
  key: string;
  user_id: string | null;
  guest_token: string | null;
  guest_name: string | null;
  guest_contact: string | null;
  profile: { full_name: string; avatar_url: string | null } | null;
  messages: SupportMessage[];
  unreadCount: number;
}

const SUGGESTED_QUESTIONS = [
  "هل يمكنك تغيير اسمي؟",
  "ما التحديثات الجديدة التي ستطرأ على الموقع؟",
  "كيف يمكنني تغيير صورتي الشخصية؟",
  "أواجه مشكلة في الموقع",
];

const Support = () => {
  const { user } = useAuth();
  const [supportAdmin, setSupportAdmin] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationGroup[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [expandedConvos, setExpandedConvos] = useState<Set<string>>(new Set());
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgText, setEditMsgText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [actionsUserId, setActionsUserId] = useState<string | null>(null);
  const [sendImages, setSendImages] = useState<File[]>([]);
  const [replyImages, setReplyImages] = useState<File[]>([]);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const sendFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const isStaff = supportAdmin;
  const isGuest = !user;

  useEffect(() => {
    (supabase as any).rpc("support_is_admin").then(({ data }: any) => setSupportAdmin(data === true));
  }, [user?.id]);

  // ---- حالة الزائر (بلا حساب) ----
  const [guestToken] = useState<string>(() => {
    let t: string | null = null;
    try { t = localStorage.getItem("mdk:support:token"); } catch { /* ignore */ }
    if (!t) {
      t = (crypto as any)?.randomUUID?.() || (Date.now() + "-" + Math.random().toString(16).slice(2));
      try { localStorage.setItem("mdk:support:token", t); } catch { /* ignore */ }
    }
    return t;
  });
  const [guestMsgs, setGuestMsgs] = useState<SupportMessage[]>([]);
  const [guestSending, setGuestSending] = useState(false);
  const [guestName, setGuestName] = useState<string>(() => { try { return localStorage.getItem("mdk:support:name") || ""; } catch { return ""; } });
  const [guestContact, setGuestContact] = useState<string>(() => { try { return localStorage.getItem("mdk:support:contact") || ""; } catch { return ""; } });

  const uploadSupportImages = async (files: File[], ownerId: string): Promise<string[] | null> => {
    const urls: string[] = [];
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        const cdnUrl = await uploadMedia(compressed);
        urls.push(cdnUrl);
      } catch (e) {
        console.error("support upload failed", e);
        return null;
      }
    }
    return urls.length > 0 ? urls : null;
  };

  // بدون Realtime (كان يفتح قناة socket دائمة للدعم). الجلب عند الفتح +
  // عند عودة التبويب + زر تحديث، وبعد أي إرسال/حذف يُعاد الجلب (أدناه).
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    void fetchMessages();
    const onVis = () => { if (document.visibilityState === "visible") void fetchMessages(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isStaff]);

  useEffect(() => {
    if (!isGuest) return;
    void fetchGuest();
    const t = setInterval(() => void fetchGuest(), 10000);
    const onVis = () => { if (document.visibilityState === "visible") void fetchGuest(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest]);

  const fetchGuest = async () => {
    const { data, error } = await (supabase as any).rpc("support_guest_fetch", { p_token: guestToken });
    if (error) return;
    setGuestMsgs((data || []) as SupportMessage[]);
  };

  const sendGuest = async (preset?: string) => {
    const text = (preset ?? content).trim();
    if (!text) return;
    try { localStorage.setItem("mdk:support:name", guestName); localStorage.setItem("mdk:support:contact", guestContact); } catch { /* ignore */ }
    setGuestSending(true);
    const { error } = await (supabase as any).rpc("support_guest_send", {
      p_token: guestToken, p_name: guestName || null, p_contact: guestContact || null, p_content: text,
    });
    setGuestSending(false);
    if (error) { toast.error("تعذّر الإرسال"); return; }
    setContent("");
    fetchGuest();
  };

  const newAdminRepliesLocal = messages.filter(m => m.user_id === user?.id && m.sender_id !== user?.id && !m.is_read).length;

  // Regular user: mark admin replies as read after showing the notification
  useEffect(() => {
    if (!user || isStaff) return;
    if (newAdminRepliesLocal > 0) {
      const t = setTimeout(() => {
        (supabase as any)
          .from("support_messages")
          .update({ is_read: true })
          .eq("user_id", user.id)
          .neq("sender_id", user.id)
          .eq("is_read", false)
          .then(() => fetchMessages());
      }, 6000);
      return () => clearTimeout(t);
    }
  }, [user?.id, isStaff, newAdminRepliesLocal]);

  const fetchMessages = async () => {
    const { data, error } = await (supabase as any)
      .from("support_messages")
      .select("id, user_id, sender_id, guest_token, guest_name, guest_contact, content, image_urls, is_read, created_at")
      .order("created_at", { ascending: false }).limit(200);

    if (!error && data) {
      const sorted = [...data].reverse();
      setMessages(sorted);
      if (isStaff) {
        await buildConversations(sorted);
      }
    }
    setLoading(false);
  };

  const buildConversations = async (msgs: SupportMessage[]) => {
    const grouped = new Map<string, SupportMessage[]>();
    msgs.forEach(m => {
      const key = m.user_id || ("g:" + m.guest_token);
      const existing = grouped.get(key) || [];
      existing.push(m);
      grouped.set(key, existing);
    });

    const userIds = Array.from(grouped.keys()).filter(k => !k.startsWith("g:"));
    let profiles: { user_id: string; full_name: string | null; avatar_url: string | null }[] = [];
    if (userIds.length) {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);
      profiles = (data as any) || [];
    }

    const convos: ConversationGroup[] = Array.from(grouped.entries()).map(([key, list]) => {
      const guest = key.startsWith("g:");
      const guestMsg = guest ? list.find(x => x.guest_name || x.guest_contact) : null;
      return {
        key,
        user_id: guest ? null : key,
        guest_token: guest ? key.slice(2) : null,
        guest_name: guestMsg?.guest_name ?? null,
        guest_contact: guestMsg?.guest_contact ?? null,
        profile: guest ? null : (profiles.find(p => p.user_id === key) || null),
        messages: list,
        unreadCount: list.filter(m => !m.is_read && (guest ? m.sender_id === null : m.sender_id === key)).length,
      };
    });

    convos.sort((a, b) => {
      const lastA = a.messages[a.messages.length - 1]?.created_at || "";
      const lastB = b.messages[b.messages.length - 1]?.created_at || "";
      return new Date(lastB).getTime() - new Date(lastA).getTime();
    });

    setConversations(convos);
  };

  const renderMessageImages = (msg: SupportMessage) => {
    if (!msg.image_urls || msg.image_urls.length === 0) return null;
    return (
      <div className={`grid gap-1 mt-2 ${msg.image_urls.length > 1 ? "grid-cols-2" : "grid-cols-1"} max-w-[260px]`}>
        {msg.image_urls.map((src, i) => (
          <button
            key={i}
            onClick={() => setLightbox({ images: msg.image_urls!, index: i })}
            className="overflow-hidden rounded-lg"
          >
            <img src={src} alt="صورة" className="w-full h-auto object-cover rounded-lg hover:opacity-90 transition-opacity" loading="lazy" />
          </button>
        ))}
      </div>
    );
  };

  const handleSend = async (text?: string) => {
    const messageText = text || content.trim();
    if (!user || (!messageText && sendImages.length === 0)) return;
    setSending(true);
    let imageUrls: string[] | null = null;
    if (sendImages.length > 0) {
      imageUrls = await uploadSupportImages(sendImages, user.id);
      if (!imageUrls) { toast.error("فشل رفع الصور"); setSending(false); return; }
    }
    const insertData: any = {
      user_id: user.id,
      sender_id: user.id,
      content: messageText,
    };
    if (imageUrls) insertData.image_urls = imageUrls;
    const { error } = await (supabase as any).from("support_messages").insert(insertData);
    if (error) toast.error("فشل إرسال الرسالة");
    else {
      setContent("");
      setSendImages([]);
      fetchMessages();
    }
    setSending(false);
  };

  const handleAdminReply = async (targetUserId: string | null, guestToken: string | null = null) => {
    if (!user || (!replyText.trim() && replyImages.length === 0)) return;
    setSending(true);
    let imageUrls: string[] | null = null;
    if (replyImages.length > 0) {
      imageUrls = await uploadSupportImages(replyImages, user.id);
      if (!imageUrls) { toast.error("فشل رفع الصور"); setSending(false); return; }
    }
    const insertData: any = {
      user_id: targetUserId,
      sender_id: user.id,
      guest_token: guestToken,
      content: replyText.trim(),
    };
    if (imageUrls) insertData.image_urls = imageUrls;
    const { error } = await (supabase as any).from("support_messages").insert(insertData);
    if (error) toast.error("فشل إرسال الرد");
    else {
      if (targetUserId && targetUserId !== user.id) {
        await (supabase as any).from("notifications").insert({
          user_id: targetUserId,
          actor_id: user.id,
          type: "support_reply",
        });
      }
      setReplyText("");
      setReplyImages([]);
      fetchMessages();
    }
    setSending(false);
  };

  const handleDeleteMessage = async (msgId: string) => {
    const { error } = await (supabase as any).from("support_messages").delete().eq("id", msgId);
    if (error) toast.error("فشل حذف الرسالة");
    else {
      toast.success("تم حذف الرسالة");
      fetchMessages();
    }
  };

  const handleDeleteConversation = async (userId: string | null, guestToken: string | null = null) => {
    let q = (supabase as any).from("support_messages").delete();
    q = userId ? q.eq("user_id", userId) : q.eq("guest_token", guestToken);
    const { error } = await q;
    if (error) toast.error("فشل حذف المحادثة");
    else {
      toast.success("تم حذف المحادثة بالكامل");
      fetchMessages();
    }
  };

  const handleEditMessage = async (msgId: string) => {
    if (!editMsgText.trim()) return;
    const { error } = await (supabase as any)
      .from("support_messages")
      .update({ content: editMsgText.trim() })
      .eq("id", msgId);
    if (error) toast.error("فشل تعديل الرسالة");
    else {
      toast.success("تم تعديل الرسالة");
      setEditingMsgId(null);
      setEditMsgText("");
      fetchMessages();
    }
  };

  const toggleConvo = (key: string, userId: string | null, guestToken: string | null) => {
    setExpandedConvos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

    // Mark messages as read when expanding
    if (isStaff) {
      let q = (supabase as any).from("support_messages").update({ is_read: true });
      q = userId ? q.eq("user_id", userId) : q.eq("guest_token", guestToken);
      q.eq("is_read", false).then(() => fetchMessages());
    }
  };

  const userMessages = messages.filter(m => m.user_id === user?.id);

  const renderImagePreview = (files: File[], onRemove: (i: number) => void) => {
    if (files.length === 0) return null;
    return (
      <div className="flex gap-2 flex-wrap mt-2">
        {files.map((f, i) => (
          <div key={i} className="relative">
            <img src={URL.createObjectURL(f)} alt="معاينة" className="w-14 h-14 object-cover rounded-lg border" />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -left-1.5 bg-destructive text-white rounded-full w-4.5 h-4.5 w-[18px] h-[18px] text-[10px] leading-none flex items-center justify-center"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  const pickImages = (fileList: FileList | null, setter: (f: File[]) => void, current: File[]) => {
    if (!fileList) return;
    const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
    const merged = [...current, ...files].slice(0, 4);
    setter(merged);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
      </div>
    );
  }

  // Guest view (بلا حساب)
  if (isGuest) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <MessageSquare className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">تواصل مع الإدارة</h1>
        </div>
        <p className="text-muted-foreground mb-4">أرسل رسالتك وسيصلنا الرد هنا. احفظ هذا المتصفح لترى الرد لاحقاً.</p>

        <Card className="mb-4">
          <CardContent className="pt-4 space-y-3">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">اسمك (اختياري)</label>
              <Input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="اكتب اسمك" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">وسيلة تواصل (اختياري): إيميل / جوال / تيليجرام</label>
              <Input value={guestContact} onChange={e => setGuestContact(e.target.value)} placeholder="مثلاً: name@email.com" />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 mb-6">
          {SUGGESTED_QUESTIONS.map((q, i) => (
            <Button key={i} variant="outline" size="sm" className="text-xs" onClick={() => sendGuest(q)}>{q}</Button>
          ))}
        </div>

        <div className="space-y-2 mb-4 max-h-[400px] overflow-y-auto">
          {guestMsgs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">لا توجد رسائل بعد — اكتب رسالتك وسنرد عليك</p>
          ) : guestMsgs.map(msg => (
            <div key={msg.id} className={`p-3 rounded-lg text-sm ${!msg.from_admin ? "bg-primary/10 ml-8" : "bg-muted mr-8"}`}>
              {msg.from_admin && <p className="text-xs font-medium text-primary mb-1">🛡️ رد الإدارة</p>}
              <p>{msg.content}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ar })}
              </p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="اكتب رسالتك هنا..."
            className="resize-none min-h-[40px] text-sm"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendGuest(); } }}
          />
          <Button size="icon" className="shrink-0" disabled={guestSending || !content.trim()} onClick={() => sendGuest()}>
            {guestSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    );
  }

  // Staff view
  if (isStaff) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <MessageSquare className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">رسائل الدعم</h1>
          <Button variant="ghost" size="sm" className="mr-auto gap-1" onClick={() => void fetchMessages()}>
            <RefreshCw className="w-3 h-3" /> تحديث
          </Button>
        </div>

        {conversations.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">لا توجد رسائل بعد</p>
        ) : (
          <div className="space-y-3">
            {conversations.map(convo => (
              <Card key={convo.key}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleConvo(convo.key, convo.user_id, convo.guest_token)}
                      className="flex-1 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={convo.profile?.avatar_url || ""} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {(convo.profile?.full_name || convo.guest_name || "ز").charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-right">
                          <p className="font-medium text-sm">
                            {convo.profile?.full_name || convo.guest_name || "زائر"}
                            {!convo.user_id && <span className="text-muted-foreground"> (زائر)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {convo.messages.length} رسالة
                            {convo.guest_contact && <span className="mr-2">• {convo.guest_contact}</span>}
                            {convo.unreadCount > 0 && (
                              <span className="mr-2 text-primary font-medium">({convo.unreadCount} جديد)</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {expandedConvos.has(convo.key) ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    {convo.user_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setActionsUserId(convo.user_id)}
                        title="إجراءات المستخدم"
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 shrink-0 mr-1"
                      onClick={() => handleDeleteConversation(convo.user_id, convo.guest_token)}
                      title="حذف المحادثة بالكامل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {expandedConvos.has(convo.key) && (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {convo.messages.map(msg => (
                        <div
                          key={msg.id}
                          className={`p-2 rounded-lg text-sm group relative ${
                            msg.sender_id === convo.user_id
                              ? "bg-muted mr-8"
                              : "bg-primary/10 ml-8"
                          }`}
                        >
                          {editingMsgId === msg.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editMsgText}
                                onChange={e => setEditMsgText(e.target.value)}
                                className="resize-none min-h-[40px] text-sm"
                              />
                              <div className="flex gap-1 justify-end">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingMsgId(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => handleEditMessage(msg.id)}>
                                  <Check className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p>{msg.content}</p>
                              {renderMessageImages(msg)}
                              <div className="flex items-center justify-between mt-1">
                                <p className="text-xs text-muted-foreground">
                                  {msg.sender_id !== convo.user_id && "🛡️ رد الإدارة • "}
                                  {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ar })}
                                </p>
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {msg.sender_id !== convo.user_id && (
                                    <button
                                      onClick={() => { setEditingMsgId(msg.id); setEditMsgText(msg.content); }}
                                      className="p-1 rounded hover:bg-background/50"
                                      title="تعديل"
                                    >
                                      <Edit2 className="w-3 h-3 text-muted-foreground" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteMessage(msg.id)}
                                    className="p-1 rounded hover:bg-destructive/10"
                                    title="حذف"
                                  >
                                    <Trash2 className="w-3 h-3 text-destructive" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      <div className="mt-2">
                        <div className="flex gap-2">
                          <Textarea
                            value={selectedUserId === convo.key ? replyText : ""}
                            onChange={e => { setSelectedUserId(convo.key); setReplyText(e.target.value); }}
                            onFocus={() => setSelectedUserId(convo.key)}
                            placeholder="اكتب رد الإدارة..."
                            className="resize-none min-h-[40px] text-sm"
                          />
                          <div className="flex flex-col gap-2 shrink-0">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => replyFileInputRef.current?.click()}
                              title="إرفاق صور"
                            >
                              <ImagePlus className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              className="shrink-0"
                              disabled={sending || (!replyText.trim() && replyImages.length === 0) || selectedUserId !== convo.key}
                              onClick={() => handleAdminReply(convo.user_id, convo.guest_token)}
                            >
                              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                        <input
                          ref={replyFileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          onChange={e => { pickImages(e.target.files, setReplyImages, replyImages); e.target.value = ""; }}
                        />
                        {selectedUserId === convo.key ? renderImagePreview(replyImages, i => setReplyImages(replyImages.filter((_, idx) => idx !== i))) : null}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <UserActionsDialog userId={actionsUserId} open={!!actionsUserId} onOpenChange={(o) => { if (!o) setActionsUserId(null); }} onChanged={fetchMessages} />
        {lightbox && (
          <Lightbox
            images={lightbox.images}
            initialIndex={lightbox.index}
            onClose={() => setLightbox(null)}
          />
        )}
      </div>
    );
  }

  // Regular user view
  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">تواصل مع الإدارة</h1>
        <Button variant="ghost" size="sm" className="mr-auto gap-1" onClick={() => void fetchMessages()}>
          <RefreshCw className="w-3 h-3" /> تحديث
        </Button>
      </div>
      <p className="text-muted-foreground mb-4">أرسل رسالة للإدارة وسيتم الرد عليك</p>

      {newAdminRepliesLocal > 0 && (
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary rounded-lg p-3 mb-4 animate-fade-in">
          <span className="relative flex w-2.5 h-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
          </span>
          <p className="text-sm font-medium">لديك رد جديد من الإدارة</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {SUGGESTED_QUESTIONS.map((q, i) => (
          <Button key={i} variant="outline" size="sm" className="text-xs" onClick={() => handleSend(q)}>
            {q}
          </Button>
        ))}
      </div>

      <div className="space-y-2 mb-4 max-h-[400px] overflow-y-auto">
        {userMessages.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">لم ترسل أي رسائل بعد</p>
        ) : (
          userMessages.map(msg => (
            <div
              key={msg.id}
              className={`p-3 rounded-lg text-sm ${
                msg.sender_id === user?.id
                  ? "bg-primary/10 ml-8"
                  : `bg-muted mr-8 ${!msg.is_read ? "ring-2 ring-primary/50" : ""}`
              }`}
            >
              {msg.sender_id !== user?.id && (
                <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                  🛡️ رد الإدارة
                  {!msg.is_read && (
                    <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold rounded-full px-1.5 py-0.5">جديد</span>
                  )}
                </p>
              )}
              <p>{msg.content}</p>
              {renderMessageImages(msg)}
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ar })}
              </p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div>
        <div className="flex gap-2">
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="اكتب رسالتك هنا..."
            className="resize-none min-h-[40px] text-sm"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <div className="flex flex-col gap-2 shrink-0">
            <Button size="icon" variant="outline" onClick={() => sendFileInputRef.current?.click()} title="إرفاق صور">
              <ImagePlus className="w-4 h-4" />
            </Button>
            <Button size="icon" className="shrink-0" disabled={sending || (!content.trim() && sendImages.length === 0)} onClick={() => handleSend()}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <input
          ref={sendFileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => { pickImages(e.target.files, setSendImages, sendImages); e.target.value = ""; }}
        />
        {renderImagePreview(sendImages, i => setSendImages(sendImages.filter((_, idx) => idx !== i)))}
      </div>

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
};

export default Support;
