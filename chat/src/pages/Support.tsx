import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createClient, type User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Send,
  Loader2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
  LogOut,
  ShieldCheck,
  ImagePlus,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import Lightbox from "@/components/Lightbox";
import { compressImage } from "@/lib/mediaCompression";

/* ============================================================
 * الدعم والمساعدة — مشروع «الإنجاز»
 *
 * - المستخدم/الإدارة: جدول public.messages
 * - الزائر (بلا حساب): جدول public.support_guest_messages عبر دالتَي
 *   support_guest_send / support_guest_fetch (الرمز في المتصفح).
 * - الصور: دلو support-media (يُرفع للقراءة العامة).
 *
 * ملاحظة: ميزات الصور والزائر تحتاج تنفيذ ملف SQL:
 *   achievement/supabase/migrations/20261030120000_support_images_and_guests.sql
 * الصفحة تعمل بدونها (تعرض تنبيهًا بدل الانهيار).
 * ============================================================ */

const ACHIEVEMENT_SUPABASE_URL = "https://itflhfhsfzrdfpxvlzrv.supabase.co";
const ACHIEVEMENT_SUPABASE_KEY =
  "sb_publishable_3mypt4J1F0sG5RD6oTSZZg_6PNgwoyY";
const SSO_BASE = "https://madrekjo-sso.madrekjo.workers.dev";
const SSO_TARGET = "/achievement/";
const SUPPORT_BUCKET = "support-media";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const supportDb = createClient(ACHIEVEMENT_SUPABASE_URL, ACHIEVEMENT_SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

interface SupportMessage {
  id: string;
  sender_id: string | null;
  receiver_id: string | null;
  content: string;
  image_urls?: string[] | null;
  is_read: boolean;
  created_at: string;
}

interface GuestRow {
  id: string;
  guest_token: string;
  guest_name: string | null;
  guest_contact: string | null;
  sender_id: string | null;
  content: string;
  image_urls: string[] | null;
  is_read: boolean;
  created_at: string;
}

interface GuestMessage {
  id: string;
  content: string;
  image_urls: string[] | null;
  is_read: boolean;
  from_admin: boolean;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Conversation {
  key: string;
  kind: "user" | "guest";
  userId?: string;
  guestToken?: string;
  name: string;
  contact?: string | null;
  profile: ProfileRow | null;
  messages: SupportMessage[];
  unread: number;
}

interface PickedImage {
  file: File;
  url: string;
}

const SUGGESTED_QUESTIONS = [
  "هل يمكنك تغيير اسمي؟",
  "ما التحديثات الجديدة التي ستطرأ على الموقع؟",
  "كيف يمكنني تغيير صورتي الشخصية؟",
  "أواجه مشكلة في الموقع",
];

const randomId = (): string => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* تجاهل */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const dedupeMessages = (list: SupportMessage[]) => {
  const seen = new Set<string>();
  const out: SupportMessage[] = [];
  for (const m of list) {
    const key = `${m.sender_id}|${m.content}|${new Date(m.created_at).toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
};

const imageExt = (file: File) => {
  const byMime = (file.type.split("/")[1] || "").toLowerCase();
  if (byMime === "jpeg") return "jpg";
  if (byMime && /^[a-z0-9]{2,5}$/.test(byMime)) return byMime;
  const nameExt = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "";
  return /^[a-z0-9]{2,5}$/.test(nameExt) ? nameExt : "jpg";
};

/** رفع صورة إلى دلو support-media وإرجاع رابطها العام. */
async function uploadSupportImage(file: File, folder: string): Promise<string> {
  const compressed = await compressImage(file, {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.82,
  });

  if (compressed.size > MAX_IMAGE_BYTES) {
    throw new Error("حجم الصورة كبير جدًا (الحد 5 ميغابايت)");
  }

  const path = `${folder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${imageExt(compressed)}`;

  const { error } = await supportDb.storage.from(SUPPORT_BUCKET).upload(path, compressed, {
    cacheControl: "31536000",
    upsert: false,
    contentType: compressed.type || "image/jpeg",
  });

  if (error) throw new Error(error.message);

  const { data } = supportDb.storage.from(SUPPORT_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("تعذّر توليد رابط الصورة");
  return data.publicUrl;
}

const Support = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const [caps, setCaps] = useState({ images: false, guests: false });

  const [isStaff, setIsStaff] = useState(false);
  const [adminIds, setAdminIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [guestRows, setGuestRows] = useState<GuestRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(true);

  const [content, setContent] = useState("");
  const [sendImages, setSendImages] = useState<PickedImage[]>([]);
  const [sending, setSending] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [replyText, setReplyText] = useState("");
  const [replyImages, setReplyImages] = useState<PickedImage[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  // ---- الزائر ----
  const [guestToken] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("mdk:support:token");
      if (saved) return saved;
    } catch {
      /* تجاهل */
    }
    const t = randomId();
    try {
      localStorage.setItem("mdk:support:token", t);
    } catch {
      /* تجاهل */
    }
    return t;
  });
  const [guestMsgs, setGuestMsgs] = useState<GuestMessage[]>([]);
  const [guestName, setGuestName] = useState<string>(() => {
    try {
      return localStorage.getItem("mdk:support:name") || "";
    } catch {
      return "";
    }
  });
  const [guestContact, setGuestContact] = useState<string>(() => {
    try {
      return localStorage.getItem("mdk:support:contact") || "";
    } catch {
      return "";
    }
  });
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);

  const sendFileRef = useRef<HTMLInputElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const popupCleanupRef = useRef<(() => void) | null>(null);

  /* ---------------- الجلسة (مشروع الإنجاز) ---------------- */

  useEffect(() => {
    let alive = true;

    const syncUser = async () => {
      const { data } = await supportDb.auth.getSession();
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    };

    void (async () => {
      await syncUser();
      // استعادة صامتة من الدخول الموحّد (صفحة /login/).
      const { data } = await supportDb.auth.getSession();
      if (data.session) return;
      try {
        const raw = localStorage.getItem("mdk:sso:session");
        const payload = raw ? JSON.parse(raw) : null;
        const session = payload?.achievement ?? payload?.sections?.achievement;
        if (session?.access_token && session?.refresh_token) {
          await supportDb.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
          await syncUser();
        }
      } catch {
        /* تجاهل */
      }
    })();

    const { data: sub } = supportDb.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      popupCleanupRef.current?.();
    };
  }, []);

  /* ---------------- كشف الميزات المتاحة في القاعدة ---------------- */

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [img, guest] = await Promise.all([
        supportDb.from("messages").select("image_urls").limit(1),
        supportDb.from("support_guest_messages").select("id").limit(1),
      ]);
      if (!alive) return;
      setCaps({ images: !img.error, guests: !guest.error });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const startLogin = () => {
    popupCleanupRef.current?.();

    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `${SSO_BASE}/login?target=${encodeURIComponent(SSO_TARGET)}`,
      "GoogleAuthPopup",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      toast.error("تم منع النافذة المنبثقة، يرجى السماح بالنوافذ المنبثقة للموقع.");
      return;
    }

    setLoggingIn(true);

    let timer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("message", onMessage);
      popupCleanupRef.current = null;
      setLoggingIn(false);
    };

    const ack = (success: boolean, origin: string) => {
      try {
        popup.postMessage({ type: "GOOGLE_LOGIN_POPUP_CLOSE", success }, origin);
      } catch {
        /* تجاهل */
      }
    };

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "GOOGLE_LOGIN_SUCCESS") return;

      const ticket = event.data?.ticket;
      if (typeof ticket !== "string" || ticket.trim().length === 0) return;

      try {
        const res = await fetch(
          `${SSO_BASE}/session?ticket=${encodeURIComponent(ticket)}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error(`ticket ${res.status}`);
        const payload = await res.json();
        const session = payload?.achievement;
        if (!session?.access_token || !session?.refresh_token) {
          throw new Error("achievement session missing");
        }
        const { error } = await supportDb.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (error) throw error;
        ack(true, event.origin);
        cleanup();
        try {
          popup.close();
        } catch {
          /* تجاهل */
        }
      } catch (err) {
        console.error("[support] login failed", err);
        ack(false, event.origin);
        toast.error("تعذّر إكمال الدخول — حاول مرة أخرى");
      }
    };

    window.addEventListener("message", onMessage);
    timer = setInterval(() => {
      if (popup.closed) cleanup();
    }, 700);
    popupCleanupRef.current = cleanup;
  };

  const signOut = async () => {
    await supportDb.auth.signOut();
    setUser(null);
    setMessages([]);
    setGuestRows([]);
    setProfiles({});
    setIsStaff(false);
  };

  /* ---------------- تحميل بيانات المستخدم/الإدارة ---------------- */

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data: idsData } = await supportDb.rpc("get_support_admin_ids");
      const ids: string[] = Array.isArray(idsData) ? (idsData as string[]) : [];
      setAdminIds(ids);
      const staff = ids.includes(user.id);
      setIsStaff(staff);

      const base = supportDb
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      const { data, error } = staff
        ? await base
        : await base.or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (error) {
        console.error("[support] load failed", error);
        toast.error("تعذّر تحميل الرسائل");
        setMessages([]);
        return;
      }

      const rows = ((data ?? []) as SupportMessage[]).slice().reverse();
      setMessages(rows);

      if (staff) {
        // نحاول دائمًا؛ الجدول غير الموجود (قبل تنفيذ SQL) يرجع خطأً ونتجاهله.
        const { data: guests } = await supportDb
          .from("support_guest_messages")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);
        setGuestRows(((guests ?? []) as GuestRow[]).slice().reverse());

        const userIds = Array.from(
          new Set(
            rows
              .flatMap((m) => [m.sender_id, m.receiver_id])
              .filter((id): id is string => !!id && !ids.includes(id)),
          ),
        );

        if (userIds.length) {
          const { data: profs } = await supportDb
            .from("profiles")
            .select("user_id, display_name, avatar_url")
            .in("user_id", userIds);
          const map: Record<string, ProfileRow> = {};
          ((profs ?? []) as ProfileRow[]).forEach((p) => {
            map[p.user_id] = p;
          });
          setProfiles(map);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id, caps.images, caps.guests]);

  useEffect(() => {
    if (!authReady) return;
    setLoading(true);
    void load();
  }, [authReady, user?.id, load]);

  // تحديث تلقائي خفيف + عند عودة التبويب.
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => void load(), 15000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id, load]);

  // تعليم رسائل الإدارة كمقروءة (للمستخدم العادي).
  useEffect(() => {
    if (!user || isStaff) return;
    const unread = messages.some((m) => m.receiver_id === user.id && !m.is_read);
    if (!unread) return;
    const t = setTimeout(() => {
      void supportDb
        .from("messages")
        .update({ is_read: true })
        .eq("receiver_id", user.id)
        .eq("is_read", false)
        .then(() => void load());
    }, 5000);
    return () => clearTimeout(t);
  }, [messages, user?.id, isStaff, load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, guestMsgs.length]);

  /* ---------------- الزائر ---------------- */

  const fetchGuest = useCallback(async () => {
    setGuestLoading(true);
    const { data, error } = await (supportDb as any).rpc("support_guest_fetch", {
      p_token: guestToken,
    });
    setGuestLoading(false);

    if (error) {
      console.error("[support] guest fetch failed", error);
      setGuestError(
        "وضع الزائر غير مفعّل حاليًا على القاعدة (يحتاج تنفيذ ملف SQL الخاص بالدعم).",
      );
      return;
    }

    setGuestError(null);
    setGuestMsgs((data ?? []) as GuestMessage[]);
  }, [guestToken]);

  useEffect(() => {
    if (user) return;
    void fetchGuest();
    const t = setInterval(() => void fetchGuest(), 10000);
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchGuest();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id, fetchGuest]);

  /* ---------------- الصور ---------------- */

  const addPickedImages = (
    files: FileList | null,
    current: PickedImage[],
    setter: (next: PickedImage[]) => void,
  ) => {
    if (!files?.length) return;
    const picked: PickedImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error("الملفات المسموحة صور فقط");
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error("حجم الصورة أكبر من 5 ميغابايت");
        continue;
      }
      if (current.length + picked.length >= MAX_IMAGES) {
        toast.error(`الحد الأقصى ${MAX_IMAGES} صور في الرسالة`);
        break;
      }
      picked.push({ file, url: URL.createObjectURL(file) });
    }
    if (picked.length) setter([...current, ...picked]);
  };

  const removePickedImage = (
    index: number,
    current: PickedImage[],
    setter: (next: PickedImage[]) => void,
  ) => {
    const target = current[index];
    if (target) URL.revokeObjectURL(target.url);
    setter(current.filter((_, i) => i !== index));
  };

  const clearPickedImages = (
    current: PickedImage[],
    setter: (next: PickedImage[]) => void,
  ) => {
    current.forEach((p) => URL.revokeObjectURL(p.url));
    setter([]);
  };

  const uploadPicked = async (picked: PickedImage[], folder: string) => {
    const urls: string[] = [];
    for (const p of picked) {
      urls.push(await uploadSupportImage(p.file, folder));
    }
    return urls;
  };

  /* ---------------- الإرسال ---------------- */

  const sendAsUser = async (preset?: string) => {
    const text = (preset ?? content).trim();
    if (!user || (!text && sendImages.length === 0)) return;

    if (sendImages.length > 0 && !caps.images) {
      toast.error("إرفاق الصور يحتاج تنفيذ ملف SQL الخاص بالدعم أولًا.");
      return;
    }

    let targets = adminIds;
    if (targets.length === 0) {
      const { data } = await supportDb.rpc("get_support_admin_ids");
      targets = Array.isArray(data) ? (data as string[]) : [];
    }
    if (targets.length === 0) {
      toast.error("لا يوجد مسؤول متاح حاليًا، حاول لاحقًا");
      return;
    }

    setSending(true);
    try {
      let imageUrls: string[] = [];
      if (sendImages.length > 0) {
        imageUrls = await uploadPicked(sendImages, user.id);
      }

      const payload: Record<string, unknown> = {
        sender_id: user.id,
        receiver_id: targets[0],
        content: text,
      };
      if (imageUrls.length > 0) payload.image_urls = imageUrls;

      const { error } = await supportDb.from("messages").insert(payload);
      if (error) throw error;

      setContent("");
      clearPickedImages(sendImages, setSendImages);
      void load();
    } catch (err: any) {
      console.error("[support] send failed", err);
      toast.error(
        err?.code === "PGRST204" || String(err?.message || "").includes("image_urls")
          ? "إرفاق الصور يحتاج تنفيذ ملف SQL الخاص بالدعم أولًا."
          : "تعذّر إرسال الرسالة",
      );
    } finally {
      setSending(false);
    }
  };

  const sendGuest = async (preset?: string) => {
    const text = (preset ?? content).trim();
    if ((!text && sendImages.length === 0) || sending) return;

    if (guestError) {
      toast.error(guestError);
      return;
    }

    setSending(true);
    try {
      let imageUrls: string[] = [];
      if (sendImages.length > 0) {
        imageUrls = await uploadPicked(sendImages, `guest/${guestToken}`);
      }

      const { error } = await (supportDb as any).rpc("support_guest_send", {
        p_token: guestToken,
        p_name: guestName || null,
        p_contact: guestContact || null,
        p_content: text,
        p_image_urls: imageUrls,
      });
      if (error) throw error;

      try {
        localStorage.setItem("mdk:support:name", guestName);
        localStorage.setItem("mdk:support:contact", guestContact);
      } catch {
        /* تجاهل */
      }

      setContent("");
      clearPickedImages(sendImages, setSendImages);
      void fetchGuest();
    } catch (err: any) {
      console.error("[support] guest send failed", err);
      toast.error(
        String(err?.message || "").includes("support_guest_send")
          ? "وضع الزائر يحتاج تنفيذ ملف SQL الخاص بالدعم أولًا."
          : "تعذّر إرسال الرسالة",
      );
    } finally {
      setSending(false);
    }
  };

  const sendAsStaff = async (convo: Conversation) => {
    const text = replyText.trim();
    if (!user || (!text && replyImages.length === 0)) return;

    if (replyImages.length > 0 && !caps.images) {
      toast.error("إرفاق الصور يحتاج تنفيذ ملف SQL الخاص بالدعم أولًا.");
      return;
    }

    setSending(true);
    try {
      let imageUrls: string[] = [];
      if (replyImages.length > 0) {
        imageUrls = await uploadPicked(replyImages, user.id);
      }

      if (convo.kind === "guest") {
        const payload: Record<string, unknown> = {
          guest_token: convo.guestToken,
          guest_name: convo.name === "زائر" ? null : convo.name,
          guest_contact: convo.contact ?? null,
          sender_id: user.id,
          content: text,
        };
        if (imageUrls.length > 0) payload.image_urls = imageUrls;

        const { error } = await supportDb
          .from("support_guest_messages")
          .insert(payload);
        if (error) throw error;
      } else {
        const payload: Record<string, unknown> = {
          sender_id: user.id,
          receiver_id: convo.userId,
          content: text,
        };
        if (imageUrls.length > 0) payload.image_urls = imageUrls;

        const { error } = await supportDb.from("messages").insert(payload);
        if (error) throw error;
      }

      setReplyText("");
      clearPickedImages(replyImages, setReplyImages);
      setReplyingTo(null);
      void load();
    } catch (err: any) {
      console.error("[support] reply failed", err);
      toast.error(
        err?.code === "PGRST204" || String(err?.message || "").includes("image_urls")
          ? "إرفاق الصور يحتاج تنفيذ ملف SQL الخاص بالدعم أولًا."
          : "تعذّر إرسال الرد",
      );
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (msg: SupportMessage, kind: "user" | "guest") => {
    const table = kind === "guest" ? "support_guest_messages" : "messages";
    const { error } = await supportDb.from(table).delete().eq("id", msg.id);
    if (error) {
      toast.error("تعذّر حذف الرسالة");
      return;
    }
    toast.success("تم حذف الرسالة");
    void load();
  };

  const deleteConversation = async (convo: Conversation) => {
    if (convo.kind === "guest") {
      const { error } = await supportDb
        .from("support_guest_messages")
        .delete()
        .eq("guest_token", convo.guestToken);
      if (error) {
        toast.error("تعذّر حذف المحادثة");
        return;
      }
    } else {
      const { error } = await supportDb
        .from("messages")
        .delete()
        .or(`sender_id.eq.${convo.userId},receiver_id.eq.${convo.userId}`);
      if (error) {
        toast.error("تعذّر حذف المحادثة");
        return;
      }
    }
    toast.success("تم حذف المحادثة بالكامل");
    void load();
  };

  const toggleConversation = (convo: Conversation) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(convo.key)) next.delete(convo.key);
      else next.add(convo.key);
      return next;
    });

    if (!isStaff || !user || convo.unread === 0) return;

    if (convo.kind === "guest") {
      void supportDb
        .from("support_guest_messages")
        .update({ is_read: true })
        .eq("guest_token", convo.guestToken)
        .is("sender_id", null)
        .eq("is_read", false)
        .then(() => void load());
    } else {
      void supportDb
        .from("messages")
        .update({ is_read: true })
        .eq("sender_id", convo.userId)
        .eq("receiver_id", user.id)
        .eq("is_read", false)
        .then(() => void load());
    }
  };

  /* ---------------- المشتقات ---------------- */

  const conversations: Conversation[] = (() => {
    if (!isStaff || !user) return [];
    const map = new Map<string, Conversation>();

    for (const m of messages) {
      if (!m.sender_id || !m.receiver_id) continue;
      if (adminIds.includes(m.sender_id) && adminIds.includes(m.receiver_id)) continue;
      const other = adminIds.includes(m.sender_id) ? m.receiver_id : m.sender_id;
      if (!other || other === user.id) continue;

      const existing = map.get(other);
      if (existing) {
        existing.messages.push(m);
        if (m.sender_id === other && !m.is_read) existing.unread += 1;
      } else {
        map.set(other, {
          key: other,
          kind: "user",
          userId: other,
          name: profiles[other]?.display_name?.trim() || "مستخدم",
          profile: profiles[other] ?? null,
          messages: [m],
          unread: m.sender_id === other && !m.is_read ? 1 : 0,
        });
      }
    }

    for (const g of guestRows) {
      const key = `g:${g.guest_token}`;
      const existing = map.get(key);
      if (existing) {
        existing.messages.push({
          id: g.id,
          sender_id: g.sender_id,
          receiver_id: null,
          content: g.content,
          image_urls: g.image_urls,
          is_read: g.is_read,
          created_at: g.created_at,
        });
        if (!g.sender_id && !g.is_read) existing.unread += 1;
        if (g.guest_name) existing.name = g.guest_name;
        if (g.guest_contact) existing.contact = g.guest_contact;
      } else {
        map.set(key, {
          key,
          kind: "guest",
          guestToken: g.guest_token,
          name: g.guest_name?.trim() || "زائر",
          contact: g.guest_contact,
          profile: null,
          messages: [
            {
              id: g.id,
              sender_id: g.sender_id,
              receiver_id: null,
              content: g.content,
              image_urls: g.image_urls,
              is_read: g.is_read,
              created_at: g.created_at,
            },
          ],
          unread: !g.sender_id && !g.is_read ? 1 : 0,
        });
      }
    }

    const list = Array.from(map.values());
    list.forEach((c) =>
      c.messages.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    );
    list.sort((a, b) => {
      const lastA = a.messages[a.messages.length - 1]?.created_at ?? "";
      const lastB = b.messages[b.messages.length - 1]?.created_at ?? "";
      return new Date(lastB).getTime() - new Date(lastA).getTime();
    });
    return list;
  })();

  const myMessages = dedupeMessages(messages);
  const hasUnreadReplies =
    !isStaff &&
    !!user &&
    messages.some((m) => m.receiver_id === user.id && !m.is_read);

  /* ---------------- العرض ---------------- */

  const timeAgo = (value: string) =>
    formatDistanceToNow(new Date(value), { addSuffix: true, locale: ar });

  const renderImages = (images?: string[] | null) => {
    if (!images || images.length === 0) return null;
    return (
      <div
        className={`mt-2 grid gap-1 ${
          images.length > 1 ? "grid-cols-2" : "grid-cols-1"
        } max-w-[260px]`}
      >
        {images.map((src, i) => (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => setLightbox({ images, index: i })}
            className="overflow-hidden rounded-lg border bg-background"
          >
            <img
              src={src}
              alt=""
              loading="lazy"
              className="h-28 w-full object-cover transition-transform hover:scale-105"
            />
          </button>
        ))}
      </div>
    );
  };

  const renderPicked = (
    picked: PickedImage[],
    setter: (next: PickedImage[]) => void,
  ) =>
    picked.length > 0 && (
      <div className="mb-2 flex flex-wrap gap-2">
        {picked.map((p, i) => (
          <div key={p.url} className="relative">
            <img
              src={p.url}
              alt=""
              className="h-16 w-16 rounded-lg border object-cover"
            />
            <button
              type="button"
              onClick={() => removePickedImage(i, picked, setter)}
              className="absolute -top-1.5 -left-1.5 rounded-full bg-destructive p-1 text-destructive-foreground shadow"
              aria-label="إزالة الصورة"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    );

  const attachButtons = (
    picked: PickedImage[],
    setter: (next: PickedImage[]) => void,
    inputRef: RefObject<HTMLInputElement>,
  ) => (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addPickedImages(e.target.files, picked, setter);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        title="إرفاق صورة"
        disabled={sending}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus className="h-4 w-4" />
      </Button>
    </>
  );

  if (!authReady) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
      </div>
    );
  }

  const header = (title: string) => (
    <div className="flex items-center gap-2 mb-6">
      <MessageSquare className="w-6 h-6 text-primary" />
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mr-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => (user ? void load() : void fetchGuest())}
        >
          <RefreshCw className="w-3 h-3" /> تحديث
        </Button>
        {user && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            title="تسجيل خروج"
            onClick={() => void signOut()}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );

  /* ---------------- وضع الزائر (بلا حساب) ---------------- */

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {header("الدعم والمساعدة")}

        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 mb-4 text-sm">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-muted-foreground leading-relaxed">
            يمكنك المراسلة <span className="font-medium text-foreground">بدون حساب</span> —
            احفظ هذا المتصفح (نفس الجهاز) لترى رد الإدارة لاحقًا.
            {guestError && (
              <span className="block mt-1 text-destructive">{guestError}</span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          <Input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="اسمك (اختياري)"
            className="text-sm"
          />
          <Input
            value={guestContact}
            onChange={(e) => setGuestContact(e.target.value)}
            placeholder="وسيلة تواصل (اختياري)"
            className="text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {SUGGESTED_QUESTIONS.map((q, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={sending || !!guestError}
              onClick={() => void sendGuest(q)}
            >
              {q}
            </Button>
          ))}
        </div>

        <div className="space-y-2 mb-4 max-h-[420px] overflow-y-auto">
          {guestLoading && guestMsgs.length === 0 ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
            </div>
          ) : guestMsgs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">
              لم ترسل أي رسائل بعد
            </p>
          ) : (
            guestMsgs.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-lg text-sm ${
                  msg.from_admin ? "bg-muted mr-8" : "bg-primary/10 ml-8"
                }`}
              >
                {msg.from_admin && (
                  <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                    🛡️ رد الإدارة
                  </p>
                )}
                {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                {renderImages(msg.image_urls)}
                <p className="text-xs text-muted-foreground mt-1">
                  {timeAgo(msg.created_at)}
                </p>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {renderPicked(sendImages, setSendImages)}

        <div className="flex gap-2">
          {attachButtons(sendImages, setSendImages, sendFileRef)}
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="اكتب رسالتك هنا..."
            className="resize-none min-h-[40px] text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendGuest();
              }
            }}
          />
          <Button
            size="icon"
            className="shrink-0"
            disabled={sending || (!content.trim() && sendImages.length === 0)}
            onClick={() => void sendGuest()}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={startLogin}
            disabled={loggingIn}
            className="text-xs text-muted-foreground underline hover:text-primary disabled:opacity-60"
          >
            {loggingIn ? "جاري فتح نافذة الدخول..." : "لديك حساب؟ سجّل الدخول لمتابعة رسائلك على حسابك"}
          </button>
        </div>

        {lightbox && (
          <Lightbox
            src={lightbox.images[lightbox.index] ?? null}
            images={lightbox.images}
            initialIndex={lightbox.index}
            type="image"
            onClose={() => setLightbox(null)}
          />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
      </div>
    );
  }

  /* ---------------- واجهة المسؤول ---------------- */

  if (isStaff) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {header("رسائل الدعم")}

        {conversations.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">لا توجد رسائل بعد</p>
        ) : (
          <div className="space-y-3">
            {conversations.map((convo) => {
              const isOpen = expanded.has(convo.key);
              const name = convo.name;

              return (
                <Card key={convo.key}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => toggleConversation(convo)}
                        className="flex-1 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={convo.profile?.avatar_url || ""} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {convo.kind === "guest" ? "ز" : name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-right">
                            <p className="font-medium text-sm flex items-center gap-1.5">
                              {name}
                              {convo.kind === "guest" && (
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  زائر
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {convo.messages.length} رسالة
                              {convo.contact && ` • ${convo.contact}`}
                              {convo.unread > 0 && (
                                <span className="mr-2 text-primary font-medium">
                                  ({convo.unread} جديد)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        {isOpen ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 shrink-0 mr-1"
                        onClick={() => void deleteConversation(convo)}
                        title="حذف المحادثة بالكامل"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {isOpen && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        {convo.messages.map((msg) => {
                          const fromAdmin = !!msg.sender_id;
                          return (
                            <div
                              key={msg.id}
                              className={`p-2 rounded-lg text-sm group relative ${
                                fromAdmin ? "bg-primary/10 ml-8" : "bg-muted mr-8"
                              }`}
                            >
                              {msg.content && (
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                              )}
                              {renderImages(msg.image_urls)}
                              <div className="flex items-center justify-between mt-1">
                                <p className="text-xs text-muted-foreground">
                                  {fromAdmin && "🛡️ رد الإدارة • "}
                                  {timeAgo(msg.created_at)}
                                </p>
                                <button
                                  onClick={() =>
                                    void deleteMessage(msg, convo.kind === "guest" ? "guest" : "user")
                                  }
                                  className="p-1 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="حذف"
                                >
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {replyingTo === convo.key &&
                          renderPicked(replyImages, setReplyImages)}

                        <div className="mt-2 flex gap-2">
                          {attachButtons(replyImages, setReplyImages, replyFileRef)}
                          <Textarea
                            value={replyingTo === convo.key ? replyText : ""}
                            onChange={(e) => {
                              setReplyingTo(convo.key);
                              setReplyText(e.target.value);
                            }}
                            onFocus={() => setReplyingTo(convo.key)}
                            placeholder="اكتب رد الإدارة..."
                            className="resize-none min-h-[40px] text-sm"
                          />
                          <Button
                            size="icon"
                            className="shrink-0"
                            disabled={
                              sending ||
                              replyingTo !== convo.key ||
                              (!replyText.trim() && replyImages.length === 0)
                            }
                            onClick={() => void sendAsStaff(convo)}
                          >
                            {sending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />

        {lightbox && (
          <Lightbox
            src={lightbox.images[lightbox.index] ?? null}
            images={lightbox.images}
            initialIndex={lightbox.index}
            type="image"
            onClose={() => setLightbox(null)}
          />
        )}
      </div>
    );
  }

  /* ---------------- واجهة المستخدم ---------------- */

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      {header("تواصل مع الإدارة")}

      <p className="text-muted-foreground mb-4 flex items-center gap-1.5 text-sm">
        <ShieldCheck className="w-4 h-4 text-primary" />
        أرسل رسالة للإدارة وسيتم الرد عليك هنا على حسابك.
      </p>

      {hasUnreadReplies && (
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
          <Button
            key={i}
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={sending}
            onClick={() => void sendAsUser(q)}
          >
            {q}
          </Button>
        ))}
      </div>

      <div className="space-y-2 mb-4 max-h-[420px] overflow-y-auto">
        {myMessages.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">
            لم ترسل أي رسائل بعد
          </p>
        ) : (
          myMessages.map((msg) => {
            const mine = msg.sender_id === user.id;
            return (
              <div
                key={msg.id}
                className={`p-3 rounded-lg text-sm ${
                  mine
                    ? "bg-primary/10 ml-8"
                    : `bg-muted mr-8 ${!msg.is_read ? "ring-2 ring-primary/50" : ""}`
                }`}
              >
                {!mine && (
                  <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                    🛡️ رد الإدارة
                    {!msg.is_read && (
                      <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold rounded-full px-1.5 py-0.5">
                        جديد
                      </span>
                    )}
                  </p>
                )}
                {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                {renderImages(msg.image_urls)}
                <p className="text-xs text-muted-foreground mt-1">
                  {timeAgo(msg.created_at)}
                </p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {renderPicked(sendImages, setSendImages)}

      <div className="flex gap-2">
        {attachButtons(sendImages, setSendImages, sendFileRef)}
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="اكتب رسالتك هنا..."
          className="resize-none min-h-[40px] text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendAsUser();
            }
          }}
        />
        <Button
          size="icon"
          className="shrink-0"
          disabled={sending || (!content.trim() && sendImages.length === 0)}
          onClick={() => void sendAsUser()}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {lightbox && (
        <Lightbox
          src={lightbox.images[lightbox.index] ?? null}
          images={lightbox.images}
          initialIndex={lightbox.index}
          type="image"
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
};

export default Support;
