import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useAdmin } from "@/hooks/useAdmin";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { LogOut, User, Trophy, LifeBuoy, Sparkles, LayoutDashboard } from "lucide-react";
import { UserNotifications } from "./UserNotifications";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface NavPillProps {
  to: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  "data-tour"?: string;
}

const NavPill = ({ to, active, icon: Icon, label, ...rest }: NavPillProps) => (
  <Link
    to={to}
    {...rest}
    className={cn(
      "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all",
      active
        ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
        : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
    )}
  >
    <Icon className="h-4 w-4" />
    {label}
  </Link>
);

export const Header = () => {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-card/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link to="/" className="group flex items-center gap-2.5">
          <span className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground shadow-glow transition-transform group-hover:scale-105">
            <Trophy className="h-5 w-5" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-bold text-foreground">الإنجاز</span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">
              تتبّع إنجازك الدراسي
            </span>
          </span>
        </Link>

        {user && (
          <nav className="hidden items-center gap-1 rounded-full border border-border/60 bg-background/50 p-1 md:flex">
            <NavPill
              to="/dashboard"
              active={pathname.startsWith("/dashboard")}
              icon={LayoutDashboard}
              label="لوحة المهام"
            />
            <NavPill
              to="/rounds"
              active={pathname.startsWith("/rounds")}
              icon={Sparkles}
              label="الجولات"
              data-tour="rounds"
            />
          </nav>
        )}

        <div className="flex items-center gap-1.5">
          {user && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => navigate("/rounds")}
              title="الجولات"
            >
              <Sparkles className="h-4 w-4 text-primary" />
            </Button>
          )}

          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full"
            data-tour="support"
            title="الدعم والمساعدة"
          >
            <a href="/support/" target="_blank" rel="noopener noreferrer">
              <LifeBuoy className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">الدعم</span>
            </a>
          </Button>

          <ThemeToggle />
          {user && <UserNotifications isAdmin={isAdmin} />}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0">
                  <Avatar className="h-9 w-9 ring-2 ring-primary/15">
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {(profile?.display_name || user.email || "؟")[0]}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2">
                  <User className="h-4 w-4" />
                  الملف الشخصي
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => signOut()} className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={() => navigate("/login")} size="sm" className="rounded-full px-4">
              تسجيل الدخول
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
