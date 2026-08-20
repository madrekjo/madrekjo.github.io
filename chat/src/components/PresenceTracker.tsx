import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const PresenceTracker = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const track = async () => {
      const channel = supabase.channel("chat-presence", {
        config: { key: user.id },
      });

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

      channel.on("presence", { event: "sync" }, () => {});

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

    return () => {};
  }, [user]);

  return null;
};

export default PresenceTracker;
