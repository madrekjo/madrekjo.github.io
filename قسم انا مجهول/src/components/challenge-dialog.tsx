import { useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Challenge } from "@/lib/visitor.functions";

/**
 * شاشة التحقق (CHALLENGE) — ليست حظراً.
 * تُعرض مرة واحدة لكل جهاز في كل جلسة، ولا تفتح ولا تغلق أي صلاحية:
 * القيد الفعلي (منع الإبلاغ) يفرضه الخادم، وهذا إشعار توضيحي فقط.
 */
export function ChallengeDialog({
  challenge,
  open,
  onOpenChange,
}: {
  challenge: Challenge | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  if (!challenge) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <ShieldQuestion className="h-5 w-5" /> تنبيه — رصد نشاط مشبوه
          </DialogTitle>
          <DialogDescription className="text-right text-xs leading-relaxed">
            رصد النظام تطابقاً جزئياً مع جهاز آخر مسجّل. هذا ليس حظراً، لكنه قيد مؤقت على
            الإبلاغ من هذا الجهاز كإجراء احتياطي.
          </DialogDescription>
        </DialogHeader>

        {challenge.reason && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
            {challenge.reason}
          </div>
        )}

        <ul className="space-y-1 rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">
          <li>لا يؤثر هذا على تصفحك أو مشاركتك بشكل طبيعي.</li>
          <li>الإبلاغ عن محتوى الآخرين معطل مؤقتاً من هذا الجهاز.</li>
          <li>إن كان الأمر بالخطأ تواصل مع الإدارة من قسم الإنجاز.</li>
        </ul>

        {challenge.open_count > 1 && (
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            تكرر التنبيه {challenge.open_count} مرات — وسيُراجع حسابك يدوياً.
          </p>
        )}

        <DialogFooter>
          <Button
            size="sm"
            onClick={() => {
              setConfirmed(true);
              onOpenChange(false);
            }}
          >
            {confirmed ? "فهمت" : "حسناً، أفهم"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
