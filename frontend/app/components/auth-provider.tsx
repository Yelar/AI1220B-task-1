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

const authBootstrapTimeoutMs = 2500;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return await Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("Authentication timed out.")), timeoutMs);
    }),
  ]);
}

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
      let resolvedSession: AuthSession | null = null;

      try {
        const stored = readStoredSession();

        if (!stored) {
          if (active) {
            setStatus("guest");
          }
          return;
        }

        if (stored.tokens.accessExpiresAt > Date.now()) {
          if (active) {
            resolvedSession = stored;
            setSession(stored);
            setStatus("authenticated");
          }
          return;
        }

        const refreshed = await withTimeout(refreshStoredSession(), authBootstrapTimeoutMs);
        if (active && refreshed) {
          resolvedSession = refreshed;
          setSession(refreshed);
          setStatus("authenticated");
          return;
        }
      } catch {
        clearStoredSession();
      } finally {
        if (active) {
          if (resolvedSession) {
            setSession(resolvedSession);
            setStatus("authenticated");
          } else {
            setSession(null);
            setStatus("guest");
          }
        }
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
