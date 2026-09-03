import { useState } from "react";
import { Coins, RefreshCw, Clock, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "madrekjo_notice_points_v1";

const UpdateNotice = () => {
  const [show, setShow] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) !== "1";
    } catch {
      return true;
    }
  });

  if (!show) return null;

  const handleUpdate = async () => {
    // إجبار على التحديث: مسح كل كاش المتصفح القديم ثم إعادة تحميل الصفحة
    try {
      localStorage.setItem(KEY, "1");
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch {}
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex flex-col items-center text-center mb-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Coins className="w-7 h-7 text-yellow-500" />
          </div>
          <h1 className="text-xl font-bold mb-1">نظام النقاط الجديد 🪙</h1>
          <p className="text-sm text-muted-foreground">تم تحديث التطبيق — اضغط تحديث للاستمرار</p>
        </div>

        <div className="space-y-3 mb-5">
          <div className="flex items-start gap-2 bg-muted/50 rounded-lg p-3">
            <Coins className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
            <p className="text-[13px] text-muted-foreground">
              يبدأ رصيدك بـ <b className="text-foreground">30 نقطة</b> يومياً، وينزل حسب استخدامك للأزرار.
            </p>
          </div>
          <div className="flex items-start gap-2 bg-muted/50 rounded-lg p-3">
            <RefreshCw className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-[13px] text-muted-foreground">
              <b className="text-foreground">مصاريف الإجراءات:</b> منشور = 5 · تعليق/رد = 2 · رسالة جولة = 1 · @الجميع = 10
            </p>
          </div>
          <div className="flex items-start gap-2 bg-muted/50 rounded-lg p-3">
            <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[13px] text-muted-foreground">
              ما ينقصك اليوم يرجع <b className="text-foreground">تلقائياً إلى 30</b> عند منتصف الليل.
            </p>
          </div>
          <div className="flex items-start gap-2 bg-muted/50 rounded-lg p-3">
            <Trophy className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            <p className="text-[13px] text-muted-foreground">
              اجلس في الجولة أو أنهيها: كل <b className="text-foreground">ساعتين = +5 نقاط</b> مكافأة!
            </p>
          </div>
        </div>

        <Button className="w-full h-11 gap-2" onClick={handleUpdate}>
          <RefreshCw className="w-4 h-4" />
          تحديث الآن
        </Button>
        <p className="text-center text-[11px] text-muted-foreground mt-2">
          اضغط التحديث حتى يظهر لك الموقع بأحدث إصدار ونظام النقاط
        </p>
      </div>
    </div>
  );
};

export default UpdateNotice;