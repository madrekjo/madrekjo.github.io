import { useState } from "react";
import { usePoints } from "@/contexts/PointsContext";
import { useAuth } from "@/contexts/AuthContext";
import { MAX_BALANCE } from "@/lib/points";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const COSTS: { label: string; cost: string }[] = [
  { label: "منشور في الدردشة", cost: "5 نقاط" },
  { label: "تعليق / رد", cost: "2 نقاط" },
  { label: "رسالة في الجولة", cost: "1 نقطة" },
  { label: "منشن @كل شخص (mention)", cost: "2 نقاط" },
  { label: "@everyone / @الجميع", cost: "10 نقاط" },
  { label: "إضافة صورة/ملف", cost: "2 نقاط" },
  { label: "إعجاب (لايك)", cost: "مجاني" },
];

const EARN: string[] = [
  "شارك في الجولة (كل ساعتين مكتملتين): تحصل على +5 نقاط",
  "رصيدك يتجدد تلقائياً كل يوم عند منتصف الليل إلى 30 نقطة",
  "الأدمن / المشرفين لا يخصم من رصيدهم — بلا حد",
];

const PointsBadge = () => {
  const { balance, loading } = usePoints();
  const { isAdmin, isStaff } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) return null;

  // الحالة: فل (كامل) أو ناقص
  const isFull = isAdmin || isStaff ? true : balance >= 30;
  const pct = Math.min((balance / MAX_BALANCE) * 100, 100);
  const color = isAdmin || isStaff
    ? "text-green-500"
    : isFull
    ? "text-emerald-600 dark:text-emerald-400"
    : balance <= 5
    ? "text-red-500"
    : "text-amber-500";

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 gap-1.5 border rounded-full px-3"
        title="رصيد النقاط — اضغط للتفاصيل"
      >
        <Coins className="w-4 h-4 text-yellow-500" />
        <span className={`text-sm font-bold ${color}`}>
          {isAdmin || isStaff ? "∞" : `${balance}/${MAX_BALANCE}`}
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: isFull ? "#22c55e" : "#f59e0b" }}
        />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-yellow-500" />
              رصيد نقاطك
            </DialogTitle>
            <DialogDescription>
              {isAdmin || isStaff
                ? "أنت أدمن/مشرف — لا يخصم من رصيدك (بلا حد)" 
                : `رصيدك الحالي: ${balance} من ${MAX_BALANCE}`}
            </DialogDescription>
          </DialogHeader>

          {/* شريط التقدم */}
          <div className="w-full bg-muted rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: isFull ? "#22c55e" : pct <= 10 ? "#ef4444" : "#f59e0b",
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isFull
              ? "رصيدك ممتلئ ✓"
              : `ناقص منك ${(MAX_BALANCE - balance) >= 0 ? MAX_BALANCE - balance : 0} نقطة للحد الأقصى`}
          </p>

          {/* التكاليف */}
          <div className="mt-2">
            <p className="text-sm font-semibold mb-1">بانبساط كم يخصم منك:</p>
            <ul className="text-[13px] text-muted-foreground space-y-1">
              {COSTS.map((c) => (
                <li key={c.label} className="flex justify-between border-b border-muted pb-1">
                  <span>{c.label}</span>
                  <span className="font-medium text-foreground">{c.cost}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* كيف تزيد */}
          <div className="mt-2">
            <p className="text-sm font-semibold mb-1">كيف تزيد رصيدك؟</p>
            <ul className="text-[13px] text-muted-foreground space-y-1 list-disc pr-4">
              {EARN.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PointsBadge;