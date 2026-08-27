import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { useVisitorGate } from "@/hooks/use-visitor-gate";
import { BanScreen } from "@/components/ban-screen";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">الصفحة غير موجودة</p>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          الرئيسية
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">صار خطأ</h1>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "أنا مجهول" },
      { name: "description", content: "انشر ما تريد بشكل مجهول تماماً" },
      { property: "og:title", content: "أنا مجهول" },
      { name: "twitter:title", content: "أنا مجهول" },
      { property: "og:description", content: "انشر ما تريد بشكل مجهول تماماً" },
      { name: "twitter:description", content: "انشر ما تريد بشكل مجهول تماماً" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <HeartbeatRunner />
      <VisitorGate>
        <Outlet />
      </VisitorGate>
      <Toaster />
    </QueryClientProvider>
  );
}

function HeartbeatRunner() {
  useHeartbeat();
  return null;
}

function VisitorGate({ children }: { children: ReactNode }) {
  const { loading, banned, reason, expires_at, evidence_url } = useVisitorGate();
  if (loading) return <>{children}</>;
  if (banned) return <BanScreen reason={reason} expiresAt={expires_at} evidenceUrl={evidence_url} />;
  return <>{children}</>;
}
