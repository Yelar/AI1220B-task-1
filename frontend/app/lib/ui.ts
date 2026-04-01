import type { UserRole } from "./types";

export const roleStorageKey = "atlas-role";

export function readStoredRole(): UserRole | null {
  if (typeof window === "undefined") {
    return null;
  }

  const role = window.localStorage.getItem(roleStorageKey);
  if (
    role === "owner" ||
    role === "editor" ||
    role === "commenter" ||
    role === "viewer"
  ) {
    return role;
  }

  return null;
}

export function writeStoredRole(role: UserRole) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(roleStorageKey, role);
}

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getExcerpt(content: string, length = 140) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "No content yet. Open the document to start writing.";
  }

  return compact.length > length ? `${compact.slice(0, length)}...` : compact;
}
