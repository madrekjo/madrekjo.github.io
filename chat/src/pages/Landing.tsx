import { Link } from "react-router-dom";
import { MessageCircle, Users, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";

const Landing = () => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="text-center max-w-2xl animate-fade-in">
          <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10">
            <MessageCircle className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-foreground">
            مدارك جو
          </h1>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            مرحباً بك في منصتنا المخصصة للدردشة الجماعية! إن كان عندك استفسار أو رأي أو فكرة تبغى تشاركها، هنا المكان المناسب. شاركنا أفكارك وناقش مع الآخرين في بيئة تعاونية تهدف للتفوق والنجاح.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link to="/auth">
              <Button size="lg" className="text-lg px-8">
                ابدأ الآن
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="bg-card py-16 px-4">
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
          <div className="text-center p-6 rounded-xl bg-background border">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
              <MessageCircle className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">دردشة جماعية</h3>
            <p className="text-muted-foreground text-sm">شارك أفكارك وآرائك مع الجميع في وقت واحد</p>
          </div>
          <div className="text-center p-6 rounded-xl bg-background border">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-accent/10 mb-4">
              <Users className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-semibold text-lg mb-2">مجتمع تعاوني</h3>
            <p className="text-muted-foreground text-sm">تواصل مع أشخاص يشاركونك نفس الأهداف</p>
          </div>
          <div className="text-center p-6 rounded-xl bg-background border">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-success/10 mb-4">
              <Lightbulb className="w-6 h-6 text-success" />
            </div>
            <h3 className="font-semibold text-lg mb-2">اقتراحات وأفكار</h3>
            <p className="text-muted-foreground text-sm">قدّم اقتراحاتك لتطوير المنصة والمجتمع</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-muted-foreground text-sm border-t">
        <p>© {new Date().getFullYear()} مدارك جو</p>
      </footer>
    </div>
  );
};

export default Landing;
