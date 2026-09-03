import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageCircle, Sun, Moon, LogOut, User, Shield, Lightbulb, MessageSquare, Users, CalendarDays, Lock, EyeOff, Eye } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import PointsBadge from "@/components/PointsBadge";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const Navbar = () => {
  const { user, profile, isAdmin, isModerator, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const isStaff = isAdmin || isModerator;

  const cycleTheme = () => {
    const order: Theme[] = profile?.gender === "female"
      ? ["light", "dark", "pink"]
      : ["light", "dark", "blue"];
    const idx = order.indexOf(theme);
    const next = order[(idx + 1) % order.length];
    setTheme(next);
  };

  const themeIcon = theme === "dark" ? <Sun className="w-5 h-5" />
    : theme === "blue" ? <Moon className="w-5 h-5 text-blue-400" />
    : theme === "pink" ? <Moon className="w-5 h-5 text-pink-400" />
    : <Moon className="w-5 h-5" />;

  const [unreadSuggestions, setUnreadSuggestions] = useState(0);
  const [unreadSupport, setUnreadSupport] = useState(0);
  const [userUnreadSupport, setUserUnreadSupport] = useState(0);
  const [chatHidden, setChatHidden] = useState<boolean>(() => localStorage.getItem("chat_hidden") === "1");

  const isActive = (path: string) => location.pathname === path;

  const toggleChatHidden = () => {
    const next = !chatHidden;
    setChatHidden(next);
    localStorage.setItem("chat_hidden", next ? "1" : "0");
  };

  // Reset badge when visiting the page
  useEffect(() => {
    if (!isStaff) return;
    if (location.pathname === "/suggestions") setUnreadSuggestions(0);
    if (location.pathname === "/support") setUnreadSupport(0);
  }, [location.pathname, isStaff]);

  // Regular user: reset their own reply badge when visiting support
  useEffect(() => {
    if (isStaff) return;
    if (location.pathname === "/support") setUserUnreadSupport(0);
  }, [location.pathname, isStaff]);

  const fetchSupportCounts = async () => {
    if (isStaff) {
      if (location.pathname !== "/support") {
        const { count: supCount } = await supabase
          .from("support_messages")
          .select("*", { count: "exact", head: true })
          .eq("is_read", false);
        setUnreadSupport(supCount || 0);
      }
    } else if (user && location.pathname !== "/support") {
      // Admin replies to this user that they haven't read
      const { count } = await supabase
        .from("support_messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .neq("sender_id", user.id)
        .eq("is_read", false);
      setUserUnreadSupport(count || 0);
    }
  };

  const fetchCounts = async () => {
    // Only fetch if not currently on that page
    if (isStaff && location.pathname !== "/suggestions") {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: sugCount } = await supabase
        .from("suggestions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", oneDayAgo);
      setUnreadSuggestions(sugCount || 0);
    }
    await fetchSupportCounts();
  };

  useEffect(() => {
    fetchCounts();
    // لا Realtime هنا — العدادات تُجلب عند فتح الصفحة/تغيير المسار فقط لتقليل الاستنزاف
  }, [location.pathname, isStaff, user?.id]);

  const Badge = ({ count }: { count: number }) => {
    if (count <= 0) return null;
    return (
      <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
        {count > 99 ? "99+" : count}
      </span>
    );
  };

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to={chatHidden ? "/rounds" : "/"} className="flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg hidden sm:inline">دردشة جو</span>
          </Link>
          {user && (
            <div className="flex items-center gap-1">
              {!profile?.is_banned && !chatHidden && (
                <Link to="/" data-tour="chat">
                  <Button variant={isActive("/") ? "secondary" : "ghost"} size="sm">
                    الدردشة
                  </Button>
                </Link>
              )}
              {!profile?.is_banned && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={toggleChatHidden}
                  title={chatHidden ? "إظهار الدردشة" : "إخفاء الدردشة"}
                >
                  {chatHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </Button>
              )}
              {!profile?.is_banned && (
                <>
                  <Link to="/rounds" data-tour="rounds">
                    <Button variant={isActive("/rounds") ? "secondary" : "ghost"} size="sm" className="gap-1">
                      <Users className="w-4 h-4" />
                      <span className="hidden sm:inline">الجولات</span>
                    </Button>
                  </Link>
                  <Link to="/schedules" data-tour="schedules">
                    <Button variant={isActive("/schedules") ? "secondary" : "ghost"} size="sm" className="gap-1">
                      <CalendarDays className="w-4 h-4" />
                      <span className="hidden sm:inline">الجداول</span>
                    </Button>
                  </Link>
                  <Link to="/changes" data-tour="changes">
                    <Button variant={isActive("/changes") ? "secondary" : "ghost"} size="sm" className="gap-1">
                      <Lightbulb className="w-4 h-4" />
                      <span className="hidden sm:inline">التغيير</span>
                    </Button>
                  </Link>
                  <Link to="/suggestions" data-tour="suggestions">
                    <Button variant={isActive("/suggestions") ? "secondary" : "ghost"} size="sm" className="gap-1 relative">
                      <Lightbulb className="w-4 h-4" />
                      <span className="hidden sm:inline">الاقتراحات</span>
                      {isStaff && <Badge count={unreadSuggestions} />}
                    </Button>
                  </Link>
                </>
              )}
              <Link to="/support" data-tour="support">
                <Button variant={isActive("/support") ? "secondary" : "ghost"} size="sm" className="gap-1 relative">
                  <MessageSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">الدعم</span>
                  {isStaff ? <Badge count={unreadSupport} /> : <Badge count={userUnreadSupport} />}
                </Button>
              </Link>
              {(isAdmin || isModerator) && (
                <Link to="/admin">
                  <Button variant={isActive("/admin") ? "secondary" : "ghost"} size="sm" className="gap-1">
                    <Shield className="w-4 h-4" />
                    <span className="hidden sm:inline">{isAdmin ? "الإدارة" : "لوحة المشرف"}</span>
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={cycleTheme} title="تغيير الثيم">
            {themeIcon}
          </Button>
          {user && <PointsBadge />}
          {user && <span data-tour="notifications"><NotificationBell /></span>}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full" data-tour="profile">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {profile?.full_name?.charAt(0) || "م"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{profile?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <Link to="/profile">
                  <DropdownMenuItem className="cursor-pointer gap-2">
                    <User className="w-4 h-4" />
                    الملف الشخصي
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer gap-2 text-destructive" onClick={signOut}>
                  <LogOut className="w-4 h-4" />
                  تسجيل خروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth">
              <Button size="sm">تسجيل دخول</Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
