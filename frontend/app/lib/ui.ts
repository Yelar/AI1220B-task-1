import type { UserRole } from "./types";

export const roleStorageKey = "atlas-role";

const demoUserIds: Record<UserRole, number> = {
  owner: 1,
  editor: 2,
  commenter: 3,
  viewer: 4,
};

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

export function getStoredRoleOrDefault(): UserRole {
  return readStoredRole() ?? "owner";
}

export function getDemoUserIdForRole(role: UserRole) {
  return demoUserIds[role];
}

export function getDemoIdentityForRole(role: UserRole) {
  return {
    role,
    userId: getDemoUserIdForRole(role),
    userName: `${role.charAt(0).toUpperCase() + role.slice(1)} Demo`,
  };
}

export function getDemoIdentityFromStoredRole() {
  return getDemoIdentityForRole(getStoredRoleOrDefault());
}

export function getRoleForDemoUserId(userId: number | string): UserRole {
  const numericId = Number(userId);
  if (numericId === 1) {
    return "owner";
  }
  if (numericId === 2) {
    return "editor";
  }
  if (numericId === 3) {
    return "commenter";
  }
  return "viewer";
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
