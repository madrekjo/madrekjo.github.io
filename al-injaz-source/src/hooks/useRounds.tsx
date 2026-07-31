import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// Tables are added in a pending migration; types regenerate after approval.
// Until then, use a loose client alias for the new tables.
const db = supabase as unknown as {
  from: (table: string) => ReturnType<typeof supabase.from>;
  storage: typeof supabase.storage;
  functions: typeof supabase.functions;
};

export interface Round {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  image_path: string | null;
  total_minutes: number;
  work_minutes: number;
  break_minutes: number;
  starts_at: string;
  ends_at: string;
  status: "active" | "ended";
  credited: boolean;
  created_at: string;
}

export interface Participant {
  id: string;
  round_id: string;
  user_id: string;
  joined_at: string;
}

export const useRounds = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: rounds = [], isLoading } = useQuery<Round[]>({
    queryKey: ["rounds"],
    queryFn: async () => {
      const { data, error } = await db
        .from("rounds")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as Round[]);
    },
    enabled: !!user,
    refetchInterval: 15000,
  });

  const { data: participants = [] } = useQuery<Participant[]>({
    queryKey: ["round-participants"],
    queryFn: async () => {
      const { data, error } = await db.from("round_participants").select("*");
      if (error) throw error;
      return ((data ?? []) as unknown as Participant[]);
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: canCreate = false } = useQuery({
    queryKey: ["can-create-round", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const [roleRes, creatorRes] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).eq("role", "admin").maybeSingle(),
        db.from("round_creators").select("user_id" as never).eq("user_id" as never, user.id).maybeSingle(),
      ]);
      return !!roleRes.data || !!creatorRes.data;
    },
    enabled: !!user,
  });

  const joinRound = useMutation({
    mutationFn: async (roundId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await db
        .from("round_participants")
        .insert({ round_id: roundId, user_id: user.id } as never);
      if (error && !`${error.message}`.includes("duplicate")) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["round-participants"] }),
  });

  const createRound = useMutation({
    mutationFn: async (payload: {
      title: string;
      description: string;
      totalMinutes: number;
      workMinutes: number;
      breakMinutes: number;
      imageFile: File | null;
    }) => {
      if (!user) throw new Error("Not authenticated");

      let imagePath: string | null = null;
      if (payload.imageFile) {
        const allowed: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/gif": "gif",
          "image/webp": "webp",
        };
        const ext = allowed[payload.imageFile.type];
        if (!ext) throw new Error("صيغة الصورة غير مدعومة");
        if (payload.imageFile.size > 5 * 1024 * 1024) throw new Error("حجم الصورة يتجاوز 5 ميغابايت");
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("round-images")
          .upload(path, payload.imageFile, { contentType: payload.imageFile.type, upsert: false });
        if (upErr) throw upErr;
        imagePath = path;
      }

      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + payload.totalMinutes * 60_000);

      const { data, error } = await db
        .from("rounds")
        .insert({
          creator_id: user.id,
          title: payload.title,
          description: payload.description,
          image_path: imagePath,
          total_minutes: payload.totalMinutes,
          work_minutes: payload.workMinutes,
          break_minutes: payload.breakMinutes,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        } as never)
        .select()
        .single();
      if (error) throw error;
      const round = data as unknown as Round;
      await db.from("round_participants").insert({ round_id: round.id, user_id: user.id } as never);
      return round;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      qc.invalidateQueries({ queryKey: ["round-participants"] });
    },
  });

  const deleteRound = useMutation({
    mutationFn: async (roundId: string) => {
      const { error } = await db.from("rounds").delete().eq("id", roundId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      qc.invalidateQueries({ queryKey: ["round-participants"] });
    },
  });

  const finalizeRound = useMutation({
    mutationFn: async (roundId: string) => {
      const { error } = await supabase.functions.invoke("finalize-round", { body: { roundId } });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["all-successful-tasks"] });
    },
  });

  return {
    rounds,
    participants,
    isLoading,
    canCreate,
    joinRound,
    createRound,
    deleteRound,
    finalizeRound,
  };
};

/** Resolve a signed URL for a private round-image path. Cached briefly per path. */
const signedUrlCache = new Map<string, { url: string; expires: number }>();
export async function getRoundImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const cached = signedUrlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from("round-images").createSignedUrl(path, 3600);
  if (error || !data) return null;
  signedUrlCache.set(path, { url: data.signedUrl, expires: Date.now() + 3000 * 1000 });
  return data.signedUrl;
}
