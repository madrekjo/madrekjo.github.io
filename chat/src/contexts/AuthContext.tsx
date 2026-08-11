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
const INITIAL_AUTH_TIMEOUT_MS = 10000;

/**
 * Executes a promise with a timeout.
 *
 * Important:
 * The timeout is used for profile/device requests only.
 * We do NOT use a fake "session: null" fallback for auth initialization.
 */
function withTimeout<T>(
  promise: PromiseLike<T>,
  fallback: T,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((resolve) =>
      setTimeout(() => resolve(fallback), timeoutMs)
    ),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permMatrix, setPermMatrix] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const [{ data }, { data: roleData }, { data: permData }] =
        await Promise.all([
          withTimeout(
            supabase
              .from("profiles")
              .select("*")
              .eq("user_id", userId)
              .maybeSingle(),
            { data: null, error: null } as any
          ),

          withTimeout(
            supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", userId),
            { data: [], error: null } as any
          ),

          withTimeout(
            (supabase as any)
              .from("role_permissions")
              .select("*"),
            { data: [], error: null } as any
          ),
        ]);

      setProfile(data || null);

      const roleList = (roleData || []).map((r: any) => r.role);
      setRoles(roleList);

      const map: Record<string, Record<string, boolean>> = {};

      (permData || []).forEach((row: any) => {
        map[row.role] = row;
      });

      setPermMatrix(map);
    } catch (error) {
      console.error("[AuthContext] Failed to load auth profile", error);

      setProfile(null);
      setRoles([]);
      setPermMatrix({});
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let initialAuthResolved = false;

    console.log("[AuthContext] initializing...");

    /**
     * Marks the initial auth loading as finished exactly once.
     */
    const finishInitialLoading = () => {
      if (cancelled || initialAuthResolved) return;

      initialAuthResolved = true;

      console.log("[AuthContext] loading finished");
      setLoading(false);
    };

    /**
     * Applies a Supabase session consistently everywhere.
     */
    const applySession = async (
      nextSession: Session | null,
      source: string
    ) => {
      if (cancelled) return;

      console.log("[AuthContext] applying session", {
        source,
        hasSession: !!nextSession,
        userId: nextSession?.user?.id ?? null,
      });

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setProfile(null);
        setRoles([]);
        setPermMatrix({});
        return;
      }

      try {
        const banned = await checkDeviceBanned();

        if (cancelled) return;

        if (banned) {
          console.warn(
            "[AuthContext] Device is banned, signing out..."
          );

          await supabase.auth.signOut();

          if (!cancelled) {
            setSession(null);
            setUser(null);
            setProfile(null);
            setRoles([]);
            setPermMatrix({});
          }

          return;
        }

        void registerDeviceForUser(nextSession.user.id);

        void fetchProfile(nextSession.user.id);
      } catch (error) {
        console.error(
          "[AuthContext] Failed while validating session",
          error
        );
      }
    };

    /**
     * Listen for all Supabase auth changes.
     *
     * This is especially important for the SSO flow because
     * setSession() in AuthCallback triggers a SIGNED_IN event.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      console.log("[AuthContext] onAuthStateChange", _event, {
        hasSession: !!nextSession,
        userId: nextSession?.user?.id ?? null,
      });

      /**
       * Do not await Supabase auth callbacks here.
       *
       * Supabase recommends keeping the callback lightweight.
       * The actual session/profile processing happens asynchronously.
       */
      void applySession(nextSession, `auth:${_event}`);

      /**
       * If an auth event arrives before the initial getSession()
       * completes, we still allow it to resolve the loading state.
       */
      if (!initialAuthResolved) {
        finishInitialLoading();
      }
    });

    /**
     * Receive the legacy/postMessage login flow if it is still used
     * somewhere in the application.
     */
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type !== "GOOGLE_LOGIN_SUCCESS") return;

      console.log("[AuthContext] 📩 received GOOGLE_LOGIN_SUCCESS", {
        hasAccessToken: !!event.data.access_token,
        hasRefreshToken: !!event.data.refresh_token,
      });

      if (
        event.data.access_token &&
        event.data.refresh_token
      ) {
        try {
          const {
            data: sessionData,
            error,
          } = await supabase.auth.setSession({
            access_token: event.data.access_token,
            refresh_token: event.data.refresh_token,
          });

          console.log("[AuthContext] setSession result", {
            success: !!sessionData.session,
            error: error?.message ?? null,
          });

          if (error) {
            console.error(
              "[AuthContext] setSession failed",
              error
            );
            return;
          }

          if (!sessionData.session) {
            console.error(
              "[AuthContext] setSession returned no session"
            );
            return;
          }

          await applySession(
            sessionData.session,
            "postMessage:setSession"
          );

          finishInitialLoading();
        } catch (error) {
          console.error(
            "[AuthContext] Failed to process GOOGLE_LOGIN_SUCCESS",
            error
          );
        }

        return;
      }

      /**
       * Fallback when no tokens are supplied in the message.
       */
      try {
        const {
          data: { session: storedSession },
          error,
        } = await supabase.auth.getSession();

        console.log("[AuthContext] fallback getSession", {
          found: !!storedSession,
          error: error?.message ?? null,
        });

        if (error) {
          console.error(
            "[AuthContext] fallback getSession failed",
            error
          );
          return;
        }

        if (storedSession) {
          await applySession(
            storedSession,
            "postMessage:getSession"
          );
          finishInitialLoading();
        }
      } catch (error) {
        console.error(
          "[AuthContext] fallback session error",
          error
        );
      }
    };

    window.addEventListener("message", handleMessage);

    /**
     * Initial session lookup.
     *
     * IMPORTANT:
     * We intentionally do NOT use:
     *
     * withTimeout(getSession(), { data: { session: null } })
     *
     * because a timeout must not be interpreted as "the user is logged out".
     */
    const initializeAuth = async () => {
      try {
        const sessionPromise = supabase.auth.getSession();

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                "Initial auth session lookup timed out"
              )
            );
          }, INITIAL_AUTH_TIMEOUT_MS);
        });

        const {
          data: { session: initialSession },
          error,
        } = await Promise.race([
          sessionPromise,
          timeoutPromise,
        ]);

        if (cancelled) return;

        console.log("[AuthContext] initial getSession", {
          hasSession: !!initialSession,
          userId: initialSession?.user?.id ?? null,
          error: error?.message ?? null,
        });

        if (error) {
          console.error(
            "[AuthContext] initial getSession error",
            error
          );

          finishInitialLoading();
          return;
        }

        /**
         * Apply the actual session returned by Supabase.
         *
         * If AuthCallback already called setSession(), this should
         * return that persisted session instead of null.
         */
        await applySession(
          initialSession,
          "initial:getSession"
        );

        finishInitialLoading();
      } catch (error) {
        if (cancelled) return;

        console.error(
          "[AuthContext] initial auth initialization failed",
          error
        );

        /**
         * We only stop the loading screen after the real lookup
         * failed/timed out. We never manufacture a null session.
         */
        finishInitialLoading();
      }
    };

    void initializeAuth();

    return () => {
      cancelled = true;

      subscription.unsubscribe();

      window.removeEventListener(
        "message",
        handleMessage
      );
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

    try {
      localStorage.removeItem(
        "sb-ofltanaffcxoobfvlkii-auth-token"
      );
    } catch {
      /* ignore */
    }

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

  const isStaff =
    isAdmin ||
    isModerator ||
    isSupervisor;

  const hasPermission = (
    perm: Permission
  ): boolean => {
    if (isAdmin) return true;

    return roles.some(
      (role) => permMatrix[role]?.[perm] === true
    );
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        roles,
        isAdmin,
        isModerator,
        isSupervisor,
        isRoundsManager,
        isStaff,
        hasPermission,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within AuthProvider"
    );
  }

  return context;
}