import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAuthorToken } from "@/lib/authorToken";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, HandHeart, Loader2, Send, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface Contribution {
  id: string;
  type: "dua" | "ayah";
  content: string;
  name: string | null;
  created_at: string;
}

const DEFAULT_NAME = "عابر سبيل";

const ContributionsSection = () => {
  const [type, setType] = useState<"dua" | "ayah">("dua");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [items, setItems] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from("ajr_contributions")
        .select("id, type, content, name, created_at")
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

  useEffect(() => {
    void fetchItems();
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
      const row = (data as { success: boolean; message: string }[])?.[0];
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

  return (
    <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-primary rounded-full p-2">
          <HandHeart className="h-5 w-5 text-gold" />
        </div>
        <h2 className="font-amiri text-2xl font-bold text-foreground">🤲 مساهماتكم</h2>
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
        <Sparkles className="h-4 w-4 text-gold" /> آخر المساهمات
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
                  <span className="text-xs text-muted-foreground">
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
};

export default ContributionsSection;