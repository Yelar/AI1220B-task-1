import { API_BASE_URL } from "./config";
import type { AuthFormPayload, AuthSession, AuthTokens, AuthUser } from "./types";

const authSessionStorageKey = "swp1-auth-session";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

function isBrowser() {
  return typeof window !== "undefined";
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

function buildTokens(data: TokenResponse): AuthTokens {
  const now = Date.now();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt: now + 1000 * 60 * 15,
    refreshExpiresAt: now + 1000 * 60 * 60 * 24 * 7,
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  const raw = await response.text();
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

async function backendRequest<T>(path: string, init: RequestOptions = {}) {
  const requestBody =
    init.body === undefined ? undefined : JSON.stringify(init.body);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    body: requestBody,
  });

  if (!response.ok) {
    const data = await parseJson<{ detail?: string }>(response).catch(() => null);
    throw new Error(data?.detail || "Authentication request failed.");
  }

  return parseJson<T>(response);
}

async function fetchCurrentUser(accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const data = await parseJson<{ detail?: string }>(response).catch(() => null);
    throw new Error(data?.detail || "Failed to load the current user.");
  }

  return parseJson<AuthUser>(response);
}

async function buildBackendSession(tokensResponse: TokenResponse): Promise<AuthSession> {
  const tokens = buildTokens(tokensResponse);
  const user = await fetchCurrentUser(tokens.accessToken);

  return {
    user,
    tokens,
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

export async function registerWithAuth(payload: AuthFormPayload) {
  await backendRequest<AuthUser>("/users/register", {
    method: "POST",
    body: {
      email: payload.email,
      name: payload.name,
      password: payload.password,
    },
  });

  return loginWithAuth(payload);
}

export async function loginWithAuth(payload: AuthFormPayload) {
  const tokens = await backendRequest<TokenResponse>("/users/login", {
    method: "POST",
    body: {
      email: payload.email,
      password: payload.password,
    },
  });

  const session = await buildBackendSession(tokens);
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

  const tokens = await backendRequest<TokenResponse>("/users/refresh", {
    method: "POST",
    body: {
      refresh_token: session.tokens.refreshToken,
    },
  });

  const refreshed = await buildBackendSession(tokens);
  persistSession(refreshed);
  return refreshed;
}

export async function logoutFromAuth() {
  persistSession(null);
}

export function clearStoredSession() {
  persistSession(null);
}
