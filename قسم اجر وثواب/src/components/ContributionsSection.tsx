import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAuthorToken } from "@/lib/authorToken";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Ban,
  Copy,
  HandHeart,
  KeyRound,
  Loader2,
  LogOut,
  Pin,
  Send,
  Sparkles,
  Trash2,
  UserX,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface Contribution {
  id: string;
  type: "dua" | "ayah";
  content: string;
  name: string | null;
  created_at: string;
  is_pinned: boolean;
}

const DEFAULT_NAME = "عابر سبيل";

interface RpcRow {
  success?: boolean;
  message?: string;
}

const ContributionsSection = () => {
  const [type, setType] = useState<"dua" | "ayah">("dua");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [items, setItems] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  // إدارة الأدمن
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from("ajr_contributions")
        .select("id, type, content, name, created_at, is_pinned")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setItems((data as Contribution[]) || []);
    } catch (err) {
      console.error("Failed to load contributions", err);
      toast.error("تعذر تحميل المساهمات");
    } finally {
      setLoading(false);
    }
  };

  const checkAdmin = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.rpc("is_ajr_admin");
        setIsAdmin(data === true);
      }
    } catch {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    void fetchItems();
    void checkAdmin();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => void checkAdmin());
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async () => {
    const text = content.trim();
    if (!text) return;
    setPosting(true);
    try {
      const { data, error } = await supabase.rpc("submit_ajr_contribution", {
        p_type: type,
        p_content: text,
        p_name: name.trim() || null,
        p_author_token: getAuthorToken(),
      });
      if (error) throw error;
      const row = (data as RpcRow[])?.[0];
      if (row?.success) {
        setContent("");
        setName("");
        toast.success(row.message || "تم نشر مشاركتك");
        void fetchItems();
      } else {
        toast.error(row?.message || "فشل نشر المشاركة");
      }
    } catch (err) {
      console.error("Submit contribution failed:", err);
      toast.error("فشل نشر المشاركة، تأكد من اتصالك بالإنترنت");
    } finally {
      setPosting(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("تم نسخ النص");
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  const handleLogin = async () => {
    if (!adminEmail.trim() || !adminPass) return;
    setLoggingIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: adminEmail.trim(),
        password: adminPass,
      });
      if (error) throw error;
      const { data } = await supabase.rpc("is_ajr_admin");
      if (data === true) {
        setIsAdmin(true);
        setShowLogin(false);
        setAdminEmail("");
        setAdminPass("");
        toast.success("أهلاً بك أيها الأدمن 👑");
      } else {
        await supabase.auth.signOut();
        toast.error("هذا الحساب ليس أدمن");
      }
    } catch {
      toast.error("بيانات الدخول غير صحيحة");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    toast.success("تم تسجيل الخروج");
  };

  const runAdmin = async (label: string, rpc: () => Promise<{ data: unknown; error: unknown }>) => {
    if (adminBusy) return;
    setAdminBusy(true);
    try {
      const { data, error } = await rpc();
      if (error) throw error;
      const row = (data as RpcRow[])?.[0];
      if (row) {
        if (row.success) {
          toast.success(row.message || label);
          void fetchItems();
        } else {
          toast.error(row.message || "فشلت العملية");
        }
      }
    } catch {
      toast.error("فشلت العملية، تأكد من تسجيل دخول الأدمن");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleDelete = (it: Contribution) => {
    if (!window.confirm("هل تريد حذف هذه المساهمة نهائياً؟")) return;
    void runAdmin("تم الحذف", () =>
      supabase.rpc("admin_delete_contribution", { p_id: it.id }),
    );
  };

  const handlePin = (it: Contribution) => {
    void runAdmin(it.is_pinned ? "إلغاء التثبيت" : "تم التثبيت", () =>
      supabase.rpc("admin_toggle_pin", { p_id: it.id }),
    );
  };

  const handleBanAuthor = (it: Contribution) => {
    if (!window.confirm("حظر جهاز هذا المرسل؟ لن يستطيع النشر بعد الآن.")) return;
    void runAdmin("تم الحظر", () =>
      supabase.rpc("admin_ban_author_of", { p_id: it.id }),
    );
  };

  const handleBanName = (it: Contribution) => {
    const nm = it.name?.trim();
    if (!nm) {
      toast.error("هذه المساهمة بدون اسم");
      return;
    }
    if (!window.confirm(`حظر الاسم «${nm}» من النشر؟`)) return;
    void runAdmin("تم حظر الاسم", () =>
      supabase.rpc("admin_ban_name", { p_name: nm }),
    );
  };

  return (
    <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary rounded-full p-2">
            <HandHeart className="h-5 w-5 text-gold" />
          </div>
          <h2 className="font-amiri text-2xl font-bold text-foreground">🤲 مساهماتكم</h2>
        </div>
        <div className="flex-shrink-0">
          {isAdmin ? (
            <Button variant="outline" size="sm" onClick={() => void handleLogout()} className="gap-1">
              <LogOut className="h-3.5 w-3.5" /> خروج الأدمن
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setShowLogin(true)} className="gap-1 text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5" /> دخول الأدمن
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        شارك معنا دعاءً أو آيةً لتعمّ الفائدة — بدون تسجيل دخول، والاسم اختياري.
      </p>

      <div className="bg-background rounded-lg border border-border p-4 mb-6 space-y-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={type === "dua" ? "default" : "outline"}
            size="sm"
            onClick={() => setType("dua")}
          >
            🤲 دعاء
          </Button>
          <Button
            type="button"
            variant={type === "ayah" ? "default" : "outline"}
            size="sm"
            onClick={() => setType("ayah")}
          >
            📖 آية
          </Button>
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسمك (اختياري)"
          maxLength={80}
        />
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={type === "dua" ? "اكتب دعاءً تثاب عليه..." : "اكتب آية كريمة مع رقم سورتها..."}
          className={`resize-none min-h-[90px] ${type === "ayah" ? "font-amiri text-lg leading-[2] text-right" : ""}`}
          maxLength={2000}
        />
        <Button
          onClick={handleSubmit}
          disabled={posting || !content.trim()}
          size="sm"
          className="gap-1"
        >
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          نشر المشاركة
        </Button>
      </div>

      <h3 className="flex items-center gap-2 font-semibold mb-3">
        <Sparkles className="h-4 w-4 text-gold" />
        آخر المساهمات
        {isAdmin && (
          <span className="text-xs font-normal text-gold bg-gold/10 rounded-full px-2 py-0.5">
            👑 وضع الإدارة مفعّل
          </span>
        )}
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin ml-2" />
          جاري التحميل...
        </div>
      ) : items.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">
          لا توجد مساهمات بعد — كن أول من يشارك 🕊️
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={it.id} className="animate-fade-in">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                      it.type === "ayah"
                        ? "bg-gold/15 text-gold"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {it.type === "ayah" ? "📖 آية" : "🤲 دعاء"}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-2">
                    {it.is_pinned && <span className="text-gold">📌 مثبّت</span>}
                    {it.name?.trim() || DEFAULT_NAME} ·{" "}
                    {formatDistanceToNow(new Date(it.created_at), { addSuffix: true, locale: ar })}
                  </span>
                </div>
                <p
                  className={`whitespace-pre-wrap break-words ${
                    it.type === "ayah" ? "font-amiri text-lg leading-[2.2] text-right" : ""
                  }`}
                >
                  {it.content}
                </p>
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => void handleCopy(it.content)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" /> نسخ
                  </button>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border flex-wrap">
                    <Button
                      size="sm"
                      variant={it.is_pinned ? "default" : "outline"}
                      className="h-7 gap-1"
                      disabled={adminBusy}
                      onClick={() => handlePin(it)}
                    >
                      <Pin className="h-3.5 w-3.5" />
                      {it.is_pinned ? "إلغاء التثبيت" : "تثبيت"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-destructive hover:text-destructive border-destructive/40"
                      disabled={adminBusy}
                      onClick={() => handleDelete(it)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1"
                      disabled={adminBusy}
                      onClick={() => handleBanAuthor(it)}
                    >
                      <Ban className="h-3.5 w-3.5 text-destructive" /> حظر الجهاز
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1"
                      disabled={adminBusy}
                      onClick={() => handleBanName(it)}
                    >
                      <UserX className="h-3.5 w-3.5 text-destructive" /> حظر الاسم
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showLogin} onOpenChange={setShowLogin}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">🔐 دخول الأدمن</DialogTitle>
            <DialogDescription>
              أدخل بريد وكلمة سر حساب الإدارة للموقع.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="البريد الإلكتروني"
              dir="ltr"
            />
            <Input
              type="password"
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
              placeholder="كلمة السر"
              dir="ltr"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleLogin();
              }}
            />
            <Button
              onClick={() => void handleLogin()}
              disabled={loggingIn || !adminEmail.trim() || !adminPass}
              className="w-full gap-1"
            >
              {loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              دخول
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default ContributionsSection;