import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const useSectionManager = () => {
  const { user } = useAuth();

  const { data: sectionManagerInfo, isLoading } = useQuery({
    queryKey: ["section-manager", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("role, managed_section_id")
        .eq("id", user.id)
        .maybeSingle();
      if (error) return null;
      if (data?.role === "section_manager" && data?.managed_section_id) {
        const { data: section } = await supabase
          .from("sections")
          .select("id, name, icon")
          .eq("id", data.managed_section_id)
          .single();
        return { managedSectionId: data.managed_section_id, section: section || null };
      }
      return null;
    },
    enabled: !!user,
  });

  const isSectionManager = !!sectionManagerInfo;

  return {
    isSectionManager,
    isLoading,
    managedSectionId: sectionManagerInfo?.managedSectionId || null,
    managedSection: sectionManagerInfo?.section || null,
  };
};
