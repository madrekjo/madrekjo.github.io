import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ActiveUser {
  user_id: string;
  name: string;
  avatar_url: string | null;
  gender: string | null;
  joined_at: number;
  is_admin: boolean;
}

interface PresenceContextType {
  activeUsers: ActiveUser[];
  onlineCount: number;
}

const PresenceContext = createContext<PresenceContextType>({ activeUsers: [], onlineCount: 0 });

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("chat-presence", {
      config: { key: user.id },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users: ActiveUser[] = [];
      Object.values(state).forEach((presences: any) => {
        presences.forEach((p: any) => {
          if (p.user_id) users.push(p);
        });
      });
      setActiveUsers(users);
    }).on("presence", { event: "join" }, ({ key, newPresences }: any) => {
      setActiveUsers(prev => {
        const existing = new Set(prev.map(u => u.user_id));
        const newUsers = newPresences.filter((p: any) => p.user_id && !existing.has(p.user_id));
        return [...prev, ...newUsers];
      });
    }).on("presence", { event: "leave" }, ({ key, leftPresences }: any) => {
      setActiveUsers(prev => {
        const leftIds = new Set(leftPresences.map((p: any) => p.user_id));
        return prev.filter(u => !leftIds.has(u.user_id));
      });
    });

    const track = async () => {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, gender")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const isAdmin = (roleData || []).some((r: any) => r.role === "admin");

      await channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            name: profileData?.full_name || "مستخدم",
            avatar_url: profileData?.avatar_url || null,
            gender: profileData?.gender || null,
            joined_at: Date.now(),
            is_admin: isAdmin,
          });
        }
      });
    };

    track();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const nonAdminUsers = activeUsers.filter(u => !u.is_admin);

  return (
    <PresenceContext.Provider value={{ activeUsers, onlineCount: nonAdminUsers.length }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}
