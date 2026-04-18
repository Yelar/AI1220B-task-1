"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  clearStoredSession,
  loginWithAuth,
  logoutFromAuth,
  readStoredSession,
  refreshStoredSession,
  registerWithAuth,
} from "@/app/lib/auth";
import type { AuthFormPayload, AuthSession, AuthStatus } from "@/app/lib/types";

type AuthContextValue = {
  status: AuthStatus;
  session: AuthSession | null;
  login: (payload: AuthFormPayload) => Promise<void>;
  register: (payload: AuthFormPayload) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const stored = readStoredSession();

      if (!stored) {
        if (active) {
          setStatus("guest");
        }
        return;
      }

      if (stored.tokens.accessExpiresAt > Date.now()) {
        if (active) {
          setSession(stored);
          setStatus("authenticated");
        }
        return;
      }

      try {
        const refreshed = await refreshStoredSession();
        if (active && refreshed) {
          setSession(refreshed);
          setStatus("authenticated");
          return;
        }
      } catch {
        clearStoredSession();
      }

      if (active) {
        setSession(null);
        setStatus("guest");
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      async login(payload) {
        setStatus("loading");
        const nextSession = await loginWithAuth(payload);
        setSession(nextSession);
        setStatus("authenticated");
      },
      async register(payload) {
        setStatus("loading");
        const nextSession = await registerWithAuth(payload);
        setSession(nextSession);
        setStatus("authenticated");
      },
      async logout() {
        await logoutFromAuth();
        setSession(null);
        setStatus("guest");
      },
      async refresh() {
        const refreshed = await refreshStoredSession().catch(() => null);
        if (!refreshed) {
          setSession(null);
          setStatus("guest");
          return false;
        }

        setSession(refreshed);
        setStatus("authenticated");
        return true;
      },
    }),
    [session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
