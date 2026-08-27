import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SiteSettings = {
  site_enabled: boolean;
  maintenance_message: string | null;
  chat_mode_enabled: boolean;
  admin_post_bg: string | null;
  admin_post_text: string | null;
  admin_comment_bg: string | null;
  admin_comment_text: string | null;
  site_reopen_at: string | null;
};

const DEFAULT: SiteSettings = {
  site_enabled: true,
  maintenance_message: null,
  chat_mode_enabled: false,
  admin_post_bg: null,
  admin_post_text: null,
  admin_comment_bg: null,
  admin_comment_text: null,
  site_reopen_at: null,
};

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (data) {
      const d = data as any;
      setSettings({
        site_enabled: d.site_enabled,
        maintenance_message: d.maintenance_message,
        chat_mode_enabled: d.chat_mode_enabled,
        admin_post_bg: d.admin_post_bg ?? null,
        admin_post_text: d.admin_post_text ?? null,
        admin_comment_bg: d.admin_comment_bg ?? null,
        admin_comment_text: d.admin_comment_text ?? null,
        site_reopen_at: d.site_reopen_at ?? null,
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("site-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_settings" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return { settings, loading, reload: load };
}
