function normalizeApiBaseUrl(value?: string) {
  const raw = value?.trim() || "http://127.0.0.1:8000/api";
  return raw.endsWith("/api") ? raw : `${raw.replace(/\/+$/, "")}/api`;
}

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL
);

export const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL ?? "ws://127.0.0.1:8000/ws";

export const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE ?? "local";
