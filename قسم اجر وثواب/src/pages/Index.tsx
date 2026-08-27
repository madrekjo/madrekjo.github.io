import Header from "@/components/Header";
import QuranSection from "@/components/QuranSection";
import HadithSection from "@/components/HadithSection";
import { Calendar } from "lucide-react";

const START_DATE = new Date(2026, 3, 6); // April 6, 2026

const getDayIndex = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(START_DATE);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
};

const Index = () => {
  const dayIndex = getDayIndex();
  const today = new Date().toLocaleDateString("ar-SA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
          <Calendar className="h-4 w-4" />
          <span>{today} — اليوم رقم {dayIndex + 1}</span>
        </div>

        <QuranSection dayIndex={dayIndex} />
        <HadithSection dayIndex={dayIndex} />

        <footer className="text-center py-4 text-xs text-muted-foreground">
          أجر وثواب للجميع — اللهم اجعله في ميزان حسناتنا
        </footer>
      </main>
    </div>
  );
};

export default Index;
