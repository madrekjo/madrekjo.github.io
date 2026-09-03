import { Construction } from "lucide-react";

export function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-ops-violet/40 bg-ops-violet/10">
        <Construction className="h-8 w-8 text-ops-violet" />
      </div>
      <h2 className="text-xl font-bold text-ops-text">قسم {name}</h2>
      <p className="mt-2 max-w-md text-sm text-ops-dim">
        هذا القسم قيد التطوير. التحكم الكامل سيُضاف قريباً.
      </p>
    </div>
  );
}
