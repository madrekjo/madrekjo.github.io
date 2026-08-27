import { BookOpen } from "lucide-react";

const Header = () => {
  return (
    <header className="bg-primary py-6 px-4 shadow-lg relative">
      <div className="container mx-auto flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-gold" />
          <h1 className="font-amiri text-3xl md:text-4xl font-bold text-primary-foreground">
            أجر وثواب للجميع
          </h1>
          <BookOpen className="h-8 w-8 text-gold" />
        </div>
        <p className="text-gold-light text-sm">
          صفحة قرآن وحديث يومياً — ابتداءً من ٦ أبريل ٢٠٢٦
        </p>
      </div>
    </header>
  );
};

export default Header;
