import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { X, Clock, UserX } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ActiveUser {
  user_id: string;
  name: string;
  avatar_url: string | null;
  gender: string | null;
  joined_at: number;
  is_admin: boolean;
}

const ActivityPanel = ({ onClose }: { onClose: () => void }) => {
  const { user } = useAuth();
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ActiveUser | null>(null);
  const [timeoutMinutes, setTimeoutMinutes] = useState(30);
  const [timeoutReason, setTimeoutReason] = useState(" قضيت وقت كثير في الدردشة");
  const [givingTimeout, setGivingTimeout] = useState(false);

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("chat-presence");

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users: ActiveUser[] = [];
      Object.values(state).forEach((presences: any) => {
        presences.forEach((p: any) => {
          if (p.user_id) users.push(p);
        });
      });
      setActiveUsers(users);
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const formatDuration = (joinedAt: number) => {
    const diff = Date.now() - joinedAt;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}س ${minutes % 60}د`;
    return `${minutes}د`;
  };

  const handleTimeout = async () => {
    if (!selectedUser) return;
    setGivingTimeout(true);
    const timeoutUntil = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({ timeout_until: timeoutUntil } as any)
      .eq("user_id", selectedUser.user_id);
    if (error) {
      toast.error("فشل تطبيق التايم اوت");
    } else {
      toast.success(`تم تطبيق تايم اوت على ${selectedUser.name} لمدة ${timeoutMinutes} دقيقة`);
      setSelectedUser(null);
    }
    setGivingTimeout(false);
  };

  const nonAdminUsers = activeUsers.filter(u => !u.is_admin);

  return (
    <div className="bg-card border rounded-xl p-4 mb-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">المتصلون الآن ({nonAdminUsers.length} طالب)</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {activeUsers.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">لا يوجد متصلون حالياً</p>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {activeUsers.map(u => (
            <div
              key={u.user_id}
              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${selectedUser?.user_id === u.user_id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"}`}
              onClick={() => setSelectedUser(selectedUser?.user_id === u.user_id ? null : u)}
            >
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarImage src={u.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {u.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              {u.gender === "male" && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />}
              {u.gender === "female" && <span className="w-2.5 h-2.5 rounded-full bg-pink-500 shrink-0" />}
              {u.is_admin && <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />}
              <span className="text-sm font-medium flex-1 truncate">{u.name}</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(u.joined_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      {selectedUser && !selectedUser.is_admin && (
        <div className="mt-3 p-3 bg-muted/50 rounded-lg border space-y-2">
          <p className="text-xs font-medium">تطبيق تايم اوت على {selectedUser.name}</p>
          <Input
            type="number"
            value={timeoutMinutes}
            onChange={e => setTimeoutMinutes(Number(e.target.value))}
            min={1}
            max={1440}
            className="h-8 text-xs"
            placeholder="المدة بالدقائق"
          />
          <Input
            value={timeoutReason}
            onChange={e => setTimeoutReason(e.target.value)}
            className="h-8 text-xs"
            placeholder="رسالة السبب"
          />
          <Button size="sm" variant="destructive" onClick={handleTimeout} disabled={givingTimeout} className="gap-1 w-full">
            <UserX className="w-3 h-3" />
            {givingTimeout ? "جاري التطبيق..." : `تايم اوت ${timeoutMinutes} دقيقة`}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ActivityPanel;
