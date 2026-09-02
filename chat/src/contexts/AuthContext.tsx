import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User, createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { checkDeviceBanned, registerDeviceForUser } from "@/lib/deviceId";
import {
  SSO_AUTH_BASE_URL,
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
  gender?: string | null;
  theme?: string | null;
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

interface SiblingAccount {
  user: User;
  sourceSection: "achievement";
}

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
  siblingSync: SiblingAccount | null;
  dismissSiblingSync: () => void;
  syncWithAchievement: () => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const REQUEST_TIMEOUT_MS = 3000;
const INITIAL_AUTH_TIMEOUT_MS = 30000;
const LOCK_RETRY_ATTEMPTS = 3;
const LOCK_RETRY_DELAY_MS = 3000;

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

/**
 * Attempts getSession() with retries to handle orphaned locks.
 *
 * Supabase gotrue-js uses an internal lock to prevent concurrent auth
 * operations. If a previous lock was not released (e.g., tab crash,
 * interrupted refresh, React Strict Mode double-mount), getSession()
 * will hang for 5+ seconds then fail. We retry with backoff to allow
 * the orphaned lock to be forcefully acquired by gotrue-js itself.
 */
async function getSessionWithRetry(
  attempts = LOCK_RETRY_ATTEMPTS,
  delayMs = LOCK_RETRY_DELAY_MS
): Promise<{ data: { session: any }; error: any }> {
  let lastError: any = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const result = await supabase.auth.getSession();
      if (result.data?.session) {
        console.log(`[AuthContext] getSession succeeded on attempt ${i + 1}`);
        return result;
      }
      if (result.error) {
        console.warn(`[AuthContext] getSession attempt ${i + 1} error:`, result.error.message);
        lastError = result.error;
      } else {
        return result;
      }
    } catch (err) {
      console.warn(`[AuthContext] getSession attempt ${i + 1} threw:`, err);
      lastError = err;
    }

    if (i < attempts - 1) {
      const waitMs = delayMs * (i + 1);
      console.log(`[AuthContext] retrying getSession in ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  return { data: { session: null }, error: lastError };
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
  const [siblingSync, setSiblingSync] =
    useState<SiblingAccount | null>(null);

  const dismissSiblingSync = () => setSiblingSync(null);

  /**
   * مزامنة صامتة: حساب موجود في الإنجاز يُستعاد/يُتواصل في الدردشة
   * بنفس البريد دون طلب تسجيل دخول Google جديد. تستخدم Edge Function
   * sync-chat-user التي تتحقق من جلسة الإنجاز وتُنشئ/تستعيد مستخدم
   * الدردشة ثم تعيد كلمة مرور مؤقتة للدخول الصامت.
   *
   * عند النجاح يطلق signInWithPassword حدث SIGNED_IN فيحرّك onAuthStateChange
   * تلقائياً فيُطبَّق البروفايل والجلسة ويُمسح siblingSync.
   */
  const syncWithAchievement = async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    try {
      const achievementClient = createClient(
        SIBLING_SUPABASE_URL,
        SIBLING_SUPABASE_ANON_KEY
      );

      const {
        data: { session: achSession },
      } = await achievementClient.auth.getSession();

      const achUser = achSession?.user;

      if (!achUser?.email) {
        return { ok: false, error: "لا توجد جلسة إنجاز صالحة للمزامنة" };
      }

      const { data, error } = await supabase.functions.invoke(
        "sync-chat-user",
        {
          body: {
            email: achUser.email,
            achievement_access_token: achSession.access_token,
            achievement_user_id: achUser.id,
            name:
              achUser.user_metadata?.full_name ??
              achUser.user_metadata?.name ??
              "",
            avatar_url: achUser.user_metadata?.avatar_url ?? "",
          },
        }
      );

      if (error) {
        return {
          ok: false,
          error: `تعذرت مزامنة حساب الدردشة: ${error.message ?? "خطأ غير معروف"}`,
        };
      }

      if (data?.password) {
        const { error: pErr } = await supabase.auth.signInWithPassword({
          email: data.email ?? achUser.email,
          password: data.password,
        });
        if (pErr) {
          return {
            ok: false,
            error: `تعذر فتح جلسة الدردشة: ${pErr.message}`,
          };
        }
      }

      const {
        data: { session: checkSession },
      } = await supabase.auth.getSession();

      if (!checkSession) {
        return {
          ok: false,
          error: "تعذر تأكيد جلسة الدردشة بعد المزامنة",
        };
      }

      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "خطأ غير معروف",
      };
    }
  };

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
            { data: null, error: null } as any,
            5000
          ),

          withTimeout(
            supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", userId),
            { data: [], error: null } as any,
            5000
          ),

          withTimeout(
            (supabase as any)
              .from("role_permissions")
              .select("*"),
            { data: [], error: null } as any,
            5000
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

      if (!nextSession?.user && source.includes("SIGNED_OUT")) {
        console.log("[AuthContext] SIGNED_OUT received, attempting recovery...");
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise(r => setTimeout(r, 2000));
          if (cancelled) return;
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (retrySession?.user) {
            console.log("[AuthContext] session recovered after retry", { attempt });
            return;
          }
          console.log(`[AuthContext] recovery attempt ${attempt + 1} failed, retrying...`);
        }
        console.log("[AuthContext] recovery failed after 3 attempts, signing out");
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setProfile(null);
        setRoles([]);
        setPermMatrix({});
        return;
      }

      // عند وجود جلسة صحيحة لا نحتاج لمزامنة من القسم الشقيق.
      setSiblingSync(null);

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

        await fetchProfile(nextSession.user.id);
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
     * Receive the postMessage login flow from the OAuth popup.
     *
     * Secure (ticket-only) flow:
     * - The popup sends only a short-lived SSO ticket.
     * - We consume the ticket once via /session, exactly like
     *   the existing AuthCallback flow, and we never touch
     *   access/refresh tokens coming over postMessage.
     */
    const handleMessage = async (event: MessageEvent) => {
      const allowedOrigins = [
        window.location.origin,
        "https://madrekjo.github.io",
      ];
      if (!allowedOrigins.includes(event.origin)) return;

      if (event.data?.type !== "GOOGLE_LOGIN_SUCCESS") return;

      console.log("[AuthContext] received GOOGLE_LOGIN_SUCCESS", {
        hasTicket: typeof event.data?.ticket === "string",
      });

      const ackPopup = (success: boolean) => {
        try {
          const source = event.source as Window | null;
          if (source && typeof source.postMessage === "function") {
            source.postMessage(
              { type: "GOOGLE_LOGIN_POPUP_CLOSE", success },
              event.origin
            );
          }
        } catch {
          /* ignore */
        }
      };

      const ticket = event.data?.ticket;

      /**
       * SSO ticket flow — لا ننقل أي توكن عبر postMessage.
       */
      if (typeof ticket === "string" && ticket.trim().length > 0) {
        try {
          const res = await fetch(
            `${SSO_AUTH_BASE_URL}/session?ticket=${encodeURIComponent(
              ticket
            )}`
          );

          if (!res.ok) {
            throw new Error(
              `ticket غير صالح (${res.status})`
            );
          }

          const data = await res.json();

          const chatSession = data?.chat;
          const achievementSession = data?.achievement;

          if (
            !chatSession?.access_token ||
            !chatSession?.refresh_token
          ) {
            throw new Error(
              "بيانات جلسة الدردشة ناقصة"
            );
          }

          if (
            !achievementSession?.access_token ||
            !achievementSession?.refresh_token
          ) {
            throw new Error(
              "بيانات جلسة الإنجاز ناقصة"
            );
          }

          const {
            data: chatSessionData,
            error: chatSessionError,
          } = await supabase.auth.setSession({
            access_token: chatSession.access_token,
            refresh_token: chatSession.refresh_token,
          });

          if (chatSessionError) {
            throw chatSessionError;
          }

          if (!chatSessionData.session) {
            throw new Error(
              "لم يتم إنشاء جلسة الدردشة"
            );
          }

          const achievementSupabase = createClient(
            SIBLING_SUPABASE_URL,
            SIBLING_SUPABASE_ANON_KEY
          );

          const {
            data: achievementSessionData,
            error: achievementSessionError,
          } = await achievementSupabase.auth.setSession({
            access_token: achievementSession.access_token,
            refresh_token: achievementSession.refresh_token,
          });

          if (achievementSessionError) {
            throw achievementSessionError;
          }

          if (!achievementSessionData.session) {
            throw new Error(
              "لم يتم إنشاء جلسة الإنجاز"
            );
          }

          await applySession(
            chatSessionData.session,
            "sso:ticket"
          );

          finishInitialLoading();
          ackPopup(true);
        } catch (error) {
          console.error(
            "[AuthContext] SSO ticket processing failed",
            error
          );
          ackPopup(false);
        }

        return;
      }
    };

    window.addEventListener("message", handleMessage);

    /**
     * تحقق من وجود جلسة صحيحة في قسم الإنجاز (المشروع الشقيق) عبر
     * localStorage المشترك بين القسمين، لنعرض Dialog المزامنة بدلاً من
     * شاشة تسجيل الدخول مباشرة.
     */
    const detectSiblingSync = async () => {
      if (cancelled) return;

      try {
        const achievementClient = createClient(
          SIBLING_SUPABASE_URL,
          SIBLING_SUPABASE_ANON_KEY
        );

        const {
          data: { session: siblingSession },
        } = await achievementClient.auth.getSession();

        if (!siblingSession?.user) return;

        const { data: siblingUser } =
          await achievementClient.auth.getUser();

        if (cancelled) return;

        if (siblingUser?.user) {
          console.log(
            "[AuthContext] achievement session detected for sync",
            {
              email: siblingUser.user.email,
            }
          );

          setSiblingSync({
            user: siblingUser.user,
            sourceSection: "achievement",
          });
        }
      } catch (error) {
        console.error(
          "[AuthContext] sibling session detection failed",
          error
        );
      }
    };

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
        const { data: { session: initialSession }, error } =
          await getSessionWithRetry();

        if (cancelled) return;

        console.log("[AuthContext] initial getSession", {
          hasSession: !!initialSession,
          userId: initialSession?.user?.id ?? null,
          error: error?.message ?? null,
        });

        if (error && !initialSession) {
          console.error(
            "[AuthContext] initial getSession error after retries",
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

        if (!initialSession?.user) {
          await detectSiblingSync();
        }
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
      localStorage.removeItem(
        "sb-itflhfhsfzrdfpxvlzrv-auth-token"
      );
    } catch {
      /* ignore */
    }

    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setPermMatrix({});
    setSiblingSync(null);
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
        siblingSync,
        dismissSiblingSync,
        syncWithAchievement,
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