import { API_BASE_URL } from "./config";
import type {
  AIInteraction,
  AIInvokeResponse,
  DemoUser,
  DocumentPermission,
  DocumentRecord,
  DocumentVersion,
  HealthResponse,
} from "./types";
import { getDemoIdentityFromStoredRole } from "./ui";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

type ErrorShape = {
  detail?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const identity = getDemoIdentityFromStoredRole();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": String(identity.userId),
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const rawBody = await response.text();
  const data = rawBody ? (JSON.parse(rawBody) as ErrorShape | T) : null;

  if (!response.ok) {
    const detail =
      typeof (data as ErrorShape | null)?.detail === "string"
        ? (data as ErrorShape).detail!
        : `Request failed with status ${response.status}.`;
    throw new ApiError(detail, response.status);
  }

  return data as T;
}

async function downloadRequest(path: string): Promise<Blob> {
  const identity = getDemoIdentityFromStoredRole();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "X-User-Id": String(identity.userId),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const rawBody = await response.text();
    let message = `Request failed with status ${response.status}.`;

    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as ErrorShape;
        if (typeof parsed.detail === "string") {
          message = parsed.detail;
        }
      } catch {
        message = rawBody;
      }
    }

    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export function getHealth() {
  return apiRequest<HealthResponse>("/health");
}

export function listDocuments() {
  return apiRequest<DocumentRecord[]>("/documents");
}

export function createDocument(payload: {
  title: string;
  content: string;
  save_initial_version: boolean;
}) {
  return apiRequest<DocumentRecord>("/documents", {
    method: "POST",
    body: payload,
  });
}

export function getDocument(documentId: number) {
  return apiRequest<DocumentRecord>(`/documents/${documentId}`);
}

export function updateDocument(
  documentId: number,
  payload: {
    title?: string;
    content?: string;
    create_version?: boolean;
    version_label?: string;
  },
) {
  return apiRequest<DocumentRecord>(`/documents/${documentId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function listVersions(documentId: number) {
  return apiRequest<DocumentVersion[]>(`/documents/${documentId}/versions`);
}

export function createVersion(documentId: number, payload: { label?: string }) {
  return apiRequest<DocumentVersion>(`/documents/${documentId}/versions`, {
    method: "POST",
    body: payload,
  });
}

export function revertVersion(documentId: number, versionId: number) {
  return apiRequest<DocumentRecord>(`/documents/${documentId}/versions/${versionId}/revert`, {
    method: "POST",
  });
}

export function listPermissions(documentId: number) {
  return apiRequest<DocumentPermission[]>(`/documents/${documentId}/permissions`);
}

export function upsertPermission(
  documentId: number,
  payload: { user_id: number; role: "owner" | "editor" | "commenter" | "viewer" },
) {
  return apiRequest<DocumentPermission>(`/documents/${documentId}/permissions`, {
    method: "POST",
    body: payload,
  });
}

export function deletePermission(documentId: number, userId: number) {
  return apiRequest<void>(`/documents/${documentId}/permissions/${userId}`, {
    method: "DELETE",
  });
}

export function exportDocument(documentId: number, format: "md" | "txt" | "json") {
  return downloadRequest(`/documents/${documentId}/export?format=${format}`);
}

export function listUsers() {
  return apiRequest<DemoUser[]>("/users");
}

export function getCurrentUser() {
  return apiRequest<DemoUser>("/users/me");
}

export function listAiHistory(params?: {
  document_id?: number;
  feature?: "rewrite" | "summarize" | "translate" | "restructure";
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params?.document_id !== undefined) {
    search.set("document_id", String(params.document_id));
  }
  if (params?.feature) {
    search.set("feature", params.feature);
  }
  if (params?.limit !== undefined) {
    search.set("limit", String(params.limit));
  }

  const suffix = search.size ? `?${search.toString()}` : "";
  return apiRequest<AIInteraction[]>(`/ai/history${suffix}`);
}

export function invokeAi(payload: {
  feature: "rewrite" | "summarize" | "translate" | "restructure";
  selected_text: string;
  surrounding_context: string;
  target_language?: string;
  document_id?: number;
}) {
  return apiRequest<AIInvokeResponse>("/ai/invoke", {
    method: "POST",
    body: payload,
  });
}
