import { useCallback, useEffect, useState } from "react";
import { PASSWORD_HASH, SESSION_KEY, SESSION_TTL } from "@/config/auth";
import { loginToWorker } from "@/lib/ops-client";
import { sha256 } from "@/lib/utils";

interface AuthState {
  authed: boolean;
  token: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ authed: false, token: null });
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed?.token &&
          parsed?.issuedAt &&
          Date.now() - parsed.issuedAt < SESSION_TTL
        ) {
          setState({ authed: true, token: parsed.token });
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const login = useCallback(async (password: string) => {
    const localHash = await sha256(password);
    if (localHash !== PASSWORD_HASH) {
      setFailed((f) => f + 1);
      throw new Error("كلمة المرور غير صحيحة");
    }
    const token = await loginToWorker(password);
    setState({ authed: true, token });
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ token, issuedAt: Date.now() })
    );
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setState({ authed: false, token: null });
  }, []);

  return { authed: state.authed, token: state.token, login, logout, failed };
}
