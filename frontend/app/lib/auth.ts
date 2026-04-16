import { AUTH_MODE, API_BASE_URL } from "./config";
import type { AuthFormPayload, AuthSession, AuthTokens, AuthUser, UserRole } from "./types";

const authSessionStorageKey = "swp1-auth-session";
const authUsersStorageKey = "swp1-auth-users";

type StoredUserRecord = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt: string;
};

type BackendAuthResponse = {
  user: AuthUser;
  access_token: string;
  refresh_token: string;
  access_expires_in: number;
  refresh_expires_in: number;
};

const demoSeedUser: StoredUserRecord = {
  id: "user-demo-owner",
  name: "Demo Owner",
  email: "owner@local.test",
  password: "demo12345",
  role: "owner",
  createdAt: new Date("2026-04-01T10:00:00Z").toISOString(),
};

function isBrowser() {
  return typeof window !== "undefined";
}

function buildLocalTokens() {
  const now = Date.now();
  return {
    accessToken: `local-access-${Math.random().toString(36).slice(2, 12)}`,
    refreshToken: `local-refresh-${Math.random().toString(36).slice(2, 12)}`,
    accessExpiresAt: now + 1000 * 60 * 30,
    refreshExpiresAt: now + 1000 * 60 * 60 * 24 * 7,
  } satisfies AuthTokens;
}

function mapStoredUserToSession(user: StoredUserRecord): AuthSession {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    tokens: buildLocalTokens(),
    source: "local",
  };
}

function readUsersFromStorage() {
  if (!isBrowser()) {
    return [demoSeedUser];
  }

  const raw = window.localStorage.getItem(authUsersStorageKey);
  if (!raw) {
    window.localStorage.setItem(authUsersStorageKey, JSON.stringify([demoSeedUser]));
    return [demoSeedUser];
  }

  try {
    const parsed = JSON.parse(raw) as StoredUserRecord[];
    return parsed.length > 0 ? parsed : [demoSeedUser];
  } catch {
    window.localStorage.setItem(authUsersStorageKey, JSON.stringify([demoSeedUser]));
    return [demoSeedUser];
  }
}

function writeUsersToStorage(users: StoredUserRecord[]) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(authUsersStorageKey, JSON.stringify(users));
}

function persistSession(session: AuthSession | null) {
  if (!isBrowser()) {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(authSessionStorageKey);
    return;
  }

  window.localStorage.setItem(authSessionStorageKey, JSON.stringify(session));
}

async function backendAuthRequest(path: string, payload: AuthFormPayload | { refresh_token: string }) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as { detail?: string } | BackendAuthResponse) : null;

  if (!response.ok) {
    const detail =
      typeof (data as { detail?: string } | null)?.detail === "string"
        ? (data as { detail: string }).detail
        : "Authentication request failed.";
    throw new Error(detail);
  }

  return data as BackendAuthResponse;
}

function mapBackendSession(data: BackendAuthResponse): AuthSession {
  const now = Date.now();

  return {
    user: data.user,
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessExpiresAt: now + data.access_expires_in * 1000,
      refreshExpiresAt: now + data.refresh_expires_in * 1000,
    },
    source: "backend",
  };
}

export function readStoredSession() {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(authSessionStorageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem(authSessionStorageKey);
    return null;
  }
}

export function getStoredAccessToken() {
  return readStoredSession()?.tokens.accessToken ?? null;
}

export function getSeedCredentials() {
  return {
    email: demoSeedUser.email,
    password: demoSeedUser.password,
  };
}

export async function registerWithAuth(payload: AuthFormPayload) {
  if (AUTH_MODE === "backend") {
    const session = mapBackendSession(await backendAuthRequest("/auth/register", payload));
    persistSession(session);
    return session;
  }

  const users = readUsersFromStorage();
  const email = payload.email.trim().toLowerCase();

  if (users.some((user) => user.email === email)) {
    throw new Error("An account with this email already exists.");
  }

  const user: StoredUserRecord = {
    id: `user-${Math.random().toString(36).slice(2, 10)}`,
    name: payload.name?.trim() || email.split("@")[0],
    email,
    password: payload.password,
    role: "owner",
    createdAt: new Date().toISOString(),
  };

  const nextUsers = [user, ...users];
  writeUsersToStorage(nextUsers);

  const session = mapStoredUserToSession(user);
  persistSession(session);
  return session;
}

export async function loginWithAuth(payload: AuthFormPayload) {
  if (AUTH_MODE === "backend") {
    const session = mapBackendSession(await backendAuthRequest("/auth/login", payload));
    persistSession(session);
    return session;
  }

  const users = readUsersFromStorage();
  const email = payload.email.trim().toLowerCase();
  const user = users.find((candidate) => candidate.email === email);

  if (!user || user.password !== payload.password) {
    throw new Error("Email or password is incorrect.");
  }

  const session = mapStoredUserToSession(user);
  persistSession(session);
  return session;
}

export async function refreshStoredSession() {
  const session = readStoredSession();
  if (!session) {
    return null;
  }

  if (session.tokens.refreshExpiresAt <= Date.now()) {
    persistSession(null);
    return null;
  }

  if (session.source === "backend") {
    const refreshed = mapBackendSession(
      await backendAuthRequest("/auth/refresh", {
        refresh_token: session.tokens.refreshToken,
      }),
    );
    persistSession(refreshed);
    return refreshed;
  }

  const refreshed = {
    ...session,
    tokens: buildLocalTokens(),
  } satisfies AuthSession;

  persistSession(refreshed);
  return refreshed;
}

export async function logoutFromAuth() {
  persistSession(null);
}

export function clearStoredSession() {
  persistSession(null);
}
