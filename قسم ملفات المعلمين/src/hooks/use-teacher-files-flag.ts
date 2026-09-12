import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTeacherFilesEnabled } from "@/lib/teacher-files";

export function useTeacherFilesFlag() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const v = await getTeacherFilesEnabled();
        if (active) setEnabled(v);
      } catch {
        if (active) setEnabled(false);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const ch = supabase
      .channel("tf-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teacher_files_settings" },
        load,
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, []);

  return { enabled: enabled === true, loading, reload: () => setEnabled(null) };
}
