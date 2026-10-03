import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Fingerprint, Smartphone, Tablet, Monitor } from "lucide-react";
import {
  getDeviceIdentity,
  type DeviceIdentity,
  type DeviceKind,
} from "@/lib/device-identity";
import { useDeviceNames } from "@/lib/device-names";
import { getDeviceId } from "@/lib/device";

const ICON: Record<DeviceKind, typeof Smartphone> = {
  phone: Smartphone,
  tablet: Tablet,
  computer: Monitor,
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span dir="ltr" className="font-mono text-sm font-semibold">
        {value}
      </span>
    </div>
  );
}

export function IdentitySheet() {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const deviceId = getDeviceId();
  const { names } = useDeviceNames(true);
  const myName = names.get(deviceId) ?? "";
  const Icon = identity ? ICON[identity.kind] : Fingerprint;

  useEffect(() => {
    let alive = true;
    void getDeviceIdentity().then((v) => alive && setIdentity(v));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2" title="هويتي">
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">هويتي</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" dir="rtl" className="w-full max-w-sm">
        <SheetHeader>
          <SheetTitle>هويتي</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <Icon className="h-8 w-8 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{myName || "بلا اسم"}</p>
              <p className="text-xs text-muted-foreground">{identity?.kindLabel ?? "…"}</p>
            </div>
          </div>

          <Row label="نوع الجهاز" value={identity?.kindLabel ?? "…"} />
          <Row label="النظام" value={identity?.platform || "غير معروف"} />
          <Row label="رمز الجهاز" value={identity?.code ?? "--------"} />
          <Row label="المعرّف" value={`${deviceId.slice(0, 6)}…${deviceId.slice(-4)}`} />

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            رمز الجهاز محسوب من عتاد جهازك نفسه (شاشة، كرت شاشة، خطوط، معالج)، فبتضل
            نفسها حتى لو مسحت بيانات المتصفح. الإعدادات تصفّح خاصة أو المتصفح بحد ذاته
            بتغيّره.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
