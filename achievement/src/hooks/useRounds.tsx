import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { achievementSupabase } from "@/integrations/supabase/achievementClient";
import { useAuth } from "./useAuth";
import { useRestriction } from "./useRestriction";

// Tables are added in a pending migration; types regenerate after approval.
// Until then, use a loose client alias for the new tables.
const db = achievementSupabase as unknown as {
  from: (table: string) => ReturnType<typeof achievementSupabase.from>;
  storage: typeof achievementSupabase.storage;
  functions: typeof achievementSupabase.functions;
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
    // Rounds rarely change outside of create/finalize (both invalidate the cache
    // below). A 30s refresh keeps the list fresh without polling every 15s.
    refetchInterval: 30000,
    staleTime: 30_000,
  });

  const { data: participants = [] } = useQuery<Participant[]>({
    queryKey: ["round-participants"],
    queryFn: async () => {
      const { data, error } = await db.from("round_participants").select("*");
      if (error) throw error;
      return ((data ?? []) as unknown as Participant[]);
    },
    enabled: !!user,
    // joinRound invalidates this cache, so 30s polling is a freshness floor, not
    // the primary update path (10s -> 30s reduces requests while mounted).
    refetchInterval: 30000,
    staleTime: 30_000,
  });

  // ------- حدود الجولات -------
  // كل شخص: 3 جولات نشطة كحد أقصى + 3 جولات كل 24 ساعة (يُفرَض أيضًا في القاعدة).
  const DAILY_LIMIT = 3;
  const ACTIVE_LIMIT = 3;
  const { blocked, blockedUntil, reason } = useRestriction();

  const myRecentRounds = user
    ? rounds.filter(
        (r) =>
          r.creator_id === user.id &&
          Date.now() - new Date(r.created_at).getTime() < 24 * 60 * 60 * 1000,
      )
    : [];
  const myActiveRounds = user
    ? rounds.filter(
        (r) =>
          r.creator_id === user.id &&
          r.status === "active" &&
          new Date(r.ends_at).getTime() > Date.now(),
      )
    : [];

  const dailyRemaining = Math.max(0, DAILY_LIMIT - myRecentRounds.length);
  const activeRemaining = Math.max(0, ACTIVE_LIMIT - myActiveRounds.length);
  const nextSlotAt =
    myRecentRounds.length >= DAILY_LIMIT
      ? new Date(
          Math.min(...myRecentRounds.map((r) => new Date(r.created_at).getTime())) +
            24 * 60 * 60 * 1000,
        ).toISOString()
      : null;

  const canCreate = !!user && !blocked && dailyRemaining > 0 && activeRemaining > 0;

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
        const { error: upErr } = await achievementSupabase.storage
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
      const { error } = await achievementSupabase.functions.invoke("finalize-round", { body: { roundId } });
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
    limits: {
      dailyLimit: DAILY_LIMIT,
      activeLimit: ACTIVE_LIMIT,
      dailyRemaining,
      activeRemaining,
      myActive: myActiveRounds.length,
      myRecent: myRecentRounds.length,
      nextSlotAt,
    },
    blocked,
    blockedUntil,
    blockReason: reason,
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
  const { data, error } = await achievementSupabase.storage.from("round-images").createSignedUrl(path, 3600);
  if (error || !data) return null;
  signedUrlCache.set(path, { url: data.signedUrl, expires: Date.now() + 3000 * 1000 });
  return data.signedUrl;
}
