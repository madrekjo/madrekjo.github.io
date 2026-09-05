import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { siblingSupabase } from "@/integrations/supabase/siblingClient";
import { checkDeviceBanned, registerDeviceForUser } from "@/lib/deviceId";
import { cachedRead, invalidateCache, clearAllCache } from "@/lib/dataLayer";
import {
  SSO_AUTH_BASE_URL,
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
  last_seen_at?: string | null;
  via_invite?: boolean;
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

// جدول الصلاحيات (role_permissions) إعداد عام ثابت لا يتبدل إلا نادراً.
// نُخزّنه مرّة واحدة في الجلسة بدل جلبه كاملاً عند كل تسجيل دخول/تحديث رمز.
let cachedRolePermissions: any[] | null = null;

/** إبطال كاش الصلاحيات (role_permissions) — يُستدعى بعد أي تعديل من لوحة الإدارة. */
export function invalidatePermissions() {
  cachedRolePermissions = null;
}

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

// يمنع تشغيل detectSiblingSync بشكل متزامن مزدوج (التطبيق يُشغِّل التهيئة
// أكثر من مرة أحياناً)، فلا يحدث تنازع على أقفال gotrue بين استدعاءين.
let siblingSyncCheckStarted = false;

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
      const {
        data: { session: achSession },
      } = await siblingSupabase.auth.getSession();

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
        // signInWithPassword نجح -> onAuthStateChange سيطلق SIGNED_IN
        // ويطبّق الجلسة تلقائياً. لا نستدعي getSession() يدوياً هنا
        // لأنه قد يتنازع على قفل gotrue مع معالجة الحدث.
      }

      // المزامنة نجحت بالكامل: نمسح حالة siblingSync صراحةً حتى لا يبقى
      // Dialog عرضاً بعد فتح الجلسة، أياً كان ترتيب وصول الأحداث.
      dismissSiblingSync();

      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "خطأ غير معروف",
      };
    }
  };

  const fetchProfile = async (userId: string, force = false) => {
    try {
      const [{ data }, { data: roleData }, { data: permData }] =
        await Promise.all([
          cachedRead({
            key: `auth:profile:${userId}`,
            ttlMs: 60_000,
            force,
            fetcher: () =>
              withTimeout(
                supabase
                  .from("profiles")
                  .select("id, user_id, full_name, avatar_url, name_changed_at, is_banned, chat_banned, timeout_until, generation, field, gender, theme, last_seen_at, via_invite")
                  .eq("user_id", userId)
                  .maybeSingle(),
                { data: null, error: null } as any,
                5000
              ),
          }),

          cachedRead({
            key: `auth:roles:${userId}`,
            ttlMs: 60_000,
            force,
            fetcher: () =>
              withTimeout(
                supabase
                  .from("user_roles")
                  .select("role")
                  .eq("user_id", userId),
                { data: [], error: null } as any,
                5000
              ),
          }),

          // جلب جدول الصلاحيات مرة واحدة فقط (إعداد عام ثابت) بدل كل @دخول
          Promise.resolve(
            cachedRolePermissions
              ? ({ data: cachedRolePermissions } as any)
              : withTimeout(
                  (supabase as any)
                    .from("role_permissions")
                    .select("*"),
                  { data: [], error: null } as any,
                  5000
                )
          ),
        ]);

      if (permData && !cachedRolePermissions) {
        cachedRolePermissions = permData;
      }

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
      // التحديث الصريح (بعد تغيير الاسم/الجنس/الثيم... إلخ) يتجاوز الكاش
      // ويجلب من الشبكة فوراً ثم يعيد تلقائياً ملء الكاش بالقيمة الجديدة.
      invalidateCache(`auth:profile:${user.id}`);
      invalidateCache(`auth:roles:${user.id}`);
      await fetchProfile(user.id, true);
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
        console.log("[AuthContext] SIGNED_OUT received");
        // لا نستدعي getSession() هنا — كان يسبب تنازعاً على قفل gotrue
        // وهدم الجلسة النشطة. علىAuthContext الاعتماد على الجلسة الفعلية
        // المخزنة عبر onAuthStateChange بدل محاولة استرجاع يدوي.
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

          const {
            data: achievementSessionData,
            error: achievementSessionError,
          } = await siblingSupabase.auth.setSession({
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
     *
     * مهم: لا نستدعي supabase.auth.getUser()/getSession() على العميل
     * الرئيسي هنا إطلاقاً — لأنها تشغّل قفل gotrue ("lock:sb-...-auth-token")
     * الذي يستخدمه كذلك onAuthStateChange/INITIAL_SESSION، فيتنازعان على
     * القفل ويسرق أحدهما الآخر ("another request stole it") فيعلق التطبيق.
     * بدلاً منه نقرأ جلسة الدردشة مباشرةً من localStorage (نفس المفتاح).
     */
    const detectSiblingSync = async () => {
      if (cancelled) return;

      try {
        // قراءة جلسة الدردشة مباشرة من localStorage دون لمس قفل gotrue.
        let currentChatToken: string | null = null;
        try {
          const raw = localStorage.getItem(
            "sb-biabdoatwfteqwgjdxzc-auth-token"
          );
          if (raw) {
            const parsed = JSON.parse(raw);
            currentChatToken = parsed?.access_token ?? null;
          }
        } catch (e) {
          /* ignore */
        }

        if (cancelled) return;

        // إذا كان هناك توكين دخول دردشة مخزَن، فالمستخدم مسجّل بالفعل
        // في الدردشة -> لا نعرض Dialog المزامنة أبداً ونتوقف هنا.
        if (currentChatToken) {
          console.log(
            "[AuthContext] chat token found in storage, skipping sync dialog"
          );
          return;
        }

        const {
          data: { session: siblingSession },
        } = await siblingSupabase.auth.getSession();

        if (!siblingSession?.user) return;

        const { data: siblingUser } =
          await siblingSupabase.auth.getUser();

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
    /**
     * تهيئة أولية تعتمد كلياً على onAuthStateChange.
     *
     * المهم: لا نستدعي supabase.auth.getSession() يدوياً هنا إطلاقاً.
     * استدعاء getSession/setSession يدوياً بالتزامن مع onAuthStateChange
     * كان يسبب تنازعاً على قفل gotrue
     * ("Lock ... was released because another request stole it") —
     * كل استدعاء getSession مع INITIAL_SESSION كان يسرق قفل الآخر
     * فتفشل كل عمليات auth (تسجيل الدخول، التحميل) وتعلق الصفحة.
     *
     * بدلاً منه: onAuthStateChange يطلق INITIAL_SESSION تلقائياً عند الاشتراك
     * ويطبّق الجلسة عبر applySession (سطر 450+). هنا فقط إنهاء شاشة التحميل
     * عند جاهزية التطبيق، وتفقد المزامنة الشقيقة بعدها بلا أي getSession.
     */
    const initializeAuth = async () => {
      try {
        // لا نقرأ الجلسة يدوياً — INITIAL_SESSION من onAuthStateChange
        // سيطبّق الجلسة المخزنة تلقائياً. ننهي التحميل بعد مهلة قصيرة
        // حتى لا تعلق شاشة التحميل لو لم يصل INITIAL_SESSION.
        setTimeout(() => {
          if (!cancelled) finishInitialLoading();
        }, 1500);

        // نؤجّل فحص المزامنة الشقيقة قليلاً حتى يكتمل INITIAL_SESSION
        // وتُطبَّق جلسة الدردشة (إن وُجدت). هكذا لو كان المستخدم مسجلاً
        // في الدردشة أصلاً، لا يظهر Dialog المزامنة بتاتاً.
        // نتأكد أيضاً من عدم تشغيل الفحص مرتين (حماية من التهيئة المزدوجة).
        setTimeout(async () => {
          if (cancelled) return;
          if (siblingSyncCheckStarted) return;
          siblingSyncCheckStarted = true;
          await detectSiblingSync();
        }, 1200);
      } catch (error) {
        if (cancelled) return;

        console.error(
          "[AuthContext] initial auth initialization failed",
          error
        );

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
    await Promise.allSettled([
      supabase.auth.signOut(),
      siblingSupabase.auth.signOut(),
    ]);

    try {
      localStorage.removeItem(
        "sb-biabdoatwfteqwgjdxzc-auth-token"
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
    clearAllCache();
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