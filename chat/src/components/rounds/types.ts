export interface Round {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  break_enabled: boolean;
  break_interval_minutes: number | null;
  break_duration_minutes: number | null;
  alarm_muted: boolean;
  started_at: string | null;
  ended_at: string | null;
  /** يُحسب مرة واحدة في الخادم عند start_round — لا يلمسه العميل */
  scheduled_end_at: string | null;
  settled: boolean;
  status: "pending" | "active" | "completed";
  created_at: string;
  /** أقصى عدد منضمين — null = بلا حد */
  capacity: number | null;
  /** صورة الغلاف المرفوعة على Cloudinary */
  cover_image_url: string | null;
  profile?: { full_name: string; avatar_url: string | null } | null;
  participants: { user_id: string; profile?: { full_name: string; avatar_url: string | null } | null }[];
}

export interface Meeting { id: string; owner_id: string; title: string; }
