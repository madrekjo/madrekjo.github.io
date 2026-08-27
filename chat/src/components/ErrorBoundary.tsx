import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary] caught error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl p-6 max-w-lg w-full text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-bold text-destructive">حدث خطأ غير متوقع</h1>
            <p className="text-sm text-muted-foreground">
              الصفحة توقفت بسبب خطأ داخلي. نسخ رسالة الخطأ أدناه وإرسالها للإدارة يساعد في إصلاحه.
            </p>
            <pre
              dir="ltr"
              className="text-left text-xs bg-muted rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap break-words"
            >
              {this.state.error.message}
              {"\n"}
              {this.state.error.stack?.split("\n").slice(0, 5).join("\n")}
            </pre>
            <Button onClick={() => window.location.reload()}>إعادة تحميل الصفحة</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;