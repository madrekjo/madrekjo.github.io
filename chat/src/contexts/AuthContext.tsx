import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User, createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { checkDeviceBanned, registerDeviceForUser } from "@/lib/deviceId";
import {
  SIBLING_SUPABASE_URL,
  SIBLING_SUPABASE_ANON_KEY,
} from "@/config/sso-config";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  name_changed_at: string | null;
  is_banned: boolean;
  chat_banned?: boolean;
  timeout_until?: string | null;
  generation?: string | null;
  field?: string | null;
}

type Permission =
  | "can_delete_posts"
  | "can_delete_comments"
  | "can_ban_users"
  | "can_timeout"
  | "can_warn"
  | "can_manage_reports"
  | "can_lock_sections"
  | "can_manage_words";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: string[];
  isAdmin: boolean;
  isModerator: boolean;
  isSupervisor: boolean;
  isRoundsManager: boolean;
  isStaff: boolean;
  hasPermission: (perm: Permission) => boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const REQUEST_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: PromiseLike<T>, fallback: T, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permMatrix, setPermMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const [{ data }, { data: roleData }, { data: permData }] = await Promise.all([
        withTimeout(
          supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
          { data: null, error: null } as any,
        ),
        withTimeout(
          supabase.from("user_roles").select("role").eq("user_id", userId),
          { data: [], error: null } as any,
        ),
        withTimeout(
          (supabase as any).from("role_permissions").select("*"),
          { data: [], error: null } as any,
        ),
      ]);
      setProfile(data || null);
      const roleList = (roleData || []).map((r: any) => r.role);
      setRoles(roleList);
      const map: Record<string, Record<string, boolean>> = {};
      (permData || []).forEach((row: any) => { map[row.role] = row; });
      setPermMatrix(map);
    } catch (error) {
      console.error("Failed to load auth profile", error);
      setProfile(null);
      setRoles([]);
      setPermMatrix({});
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    let cancelled = false;
    const finishLoading = () => { if (!cancelled) { console.log("[AuthContext] loading finished"); setLoading(false); } };
    const safetyTimer = setTimeout(() => {
      console.warn("[AuthContext] ⚠️ safety timer triggered");
      finishLoading();
    }, 4000);

    console.log("[AuthContext] initializing...");

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log("[AuthContext] onAuthStateChange", _event, { hasSession: !!session });
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          const banned = await checkDeviceBanned();
          if (banned) {
            await supabase.auth.signOut();
            setSession(null); setUser(null); setProfile(null);
            finishLoading();
            return;
          }
          void registerDeviceForUser(session.user.id);
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setRoles([]);
          setPermMatrix({});
        }
        finishLoading();
      }
    );

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "GOOGLE_LOGIN_SUCCESS") {
        console.log("[AuthContext] 📩 received GOOGLE_LOGIN_SUCCESS", {
          hasAccessToken: !!event.data.access_token,
        });

        if (event.data.access_token && event.data.refresh_token) {
          // Use setSession to persist to this context's localStorage
          supabase.auth.setSession({
            access_token: event.data.access_token,
            refresh_token: event.data.refresh_token,
          }).then(({ data: { session }, error }) => {
            console.log("[AuthContext] setSession result", {
              success: !!session,
              error: error?.message,
            });
            if (session && !cancelled) {
              setSession(session);
              setUser(session.user);
              void registerDeviceForUser(session.user.id);
              void fetchProfile(session.user.id);
            }
          });
        } else {
          // Fallback: try reading from localStorage directly
          supabase.auth.getSession().then(({ data: { session } }) => {
            console.log("[AuthContext] fallback getSession", {
              found: !!session,
            });
            if (session && !cancelled) {
              setSession(session);
              setUser(session.user);
              void registerDeviceForUser(session.user.id);
              void fetchProfile(session.user.id);
            }
          });
        }
      }
    };

    window.addEventListener("message", handleMessage);

    withTimeout(supabase.auth.getSession() as any, { data: { session: null } } as any, 3500)
      .then(async ({ data: { session } }: any) => {
        console.log("[AuthContext] initial getSession", { hasSession: !!session });
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          const banned = await checkDeviceBanned();
          if (banned) {
            await supabase.auth.signOut();
            setSession(null); setUser(null); setProfile(null);
          } else {
            void registerDeviceForUser(session.user.id);
            void fetchProfile(session.user.id);
          }
        }
        finishLoading();
      })
      .catch(finishLoading);

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const signOut = async () => {
    const achievementSupabase = createClient(
      SIBLING_SUPABASE_URL,
      SIBLING_SUPABASE_ANON_KEY
    );
    await Promise.allSettled([
      supabase.auth.signOut(),
      achievementSupabase.auth.signOut(),
    ]);
    try { localStorage.removeItem("sb-ofltanaffcxoobfvlkii-auth-token"); } catch { /* ignore */ }
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setPermMatrix({});
  };

  const isAdmin = roles.includes("admin");
  const isModerator = roles.includes("moderator");
  const isSupervisor = roles.includes("supervisor");
  const isRoundsManager = roles.includes("rounds_manager");
  const isStaff = isAdmin || isModerator || isSupervisor;

  const hasPermission = (perm: Permission): boolean => {
    if (isAdmin) return true;
    return roles.some(r => permMatrix[r]?.[perm] === true);
  };

  return (
    <AuthContext.Provider value={{
      session, user, profile, roles,
      isAdmin, isModerator, isSupervisor, isRoundsManager, isStaff,
      hasPermission,
      loading, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
