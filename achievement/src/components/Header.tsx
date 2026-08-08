import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useAdmin } from "@/hooks/useAdmin";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { LogOut, User, Trophy, LifeBuoy, Sparkles } from "lucide-react";
import { UserNotifications } from "./UserNotifications";
import { SupportDialog } from "./SupportDialog";
import { Link, useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export const Header = () => {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Trophy className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-foreground">الإنجاز</span>
        </Link>

        <div className="flex items-center gap-2">
          {user && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate("/rounds")}
              data-tour="rounds"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">الجولات</span>
            </Button>
          )}

          {user && !isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setSupportOpen(true)}
              data-tour="support"
            >
              <LifeBuoy className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">الدعم</span>
            </Button>
          )}
          <ThemeToggle />
          {user && <UserNotifications isAdmin={isAdmin} />}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {(profile?.display_name || user.email || "؟")[0]}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="ml-2 h-4 w-4" />
                  الملف الشخصي
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="ml-2 h-4 w-4" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={() => navigate("/login")} size="sm">
              تسجيل الدخول
            </Button>
          )}
        </div>
      </div>
      <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </header>
  );
};
