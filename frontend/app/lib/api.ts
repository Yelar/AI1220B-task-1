import { API_BASE_URL } from "./config";
import { getStoredAccessToken, refreshStoredSession } from "./auth";
import type {
  AIInteraction,
  AIInvokeResponse,
  DocumentRecord,
  DocumentVersion,
  HealthResponse,
} from "./types";

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
  async function runRequest() {
    const accessToken = getStoredAccessToken();

    return fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });
  }

  let response = await runRequest();

  if (response.status === 401) {
    const refreshedSession = await refreshStoredSession().catch(() => null);
    if (refreshedSession) {
      response = await runRequest();
    }
  }

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

export function deleteDocument(documentId: number) {
  return apiRequest<void>(`/documents/${documentId}`, {
    method: "DELETE",
  });
}

export function listAiHistory() {
  return apiRequest<AIInteraction[]>("/ai/history");
}

type InvokeAiOptions = {
  signal?: AbortSignal;
};

export function invokeAi(payload: {
  feature: "rewrite" | "summarize" | "translate" | "restructure";
  selected_text: string;
  surrounding_context: string;
  target_language?: string;
  document_id?: number;
}, options: InvokeAiOptions = {}) {
  return apiRequest<AIInvokeResponse>("/ai/invoke", {
    method: "POST",
    body: payload,
    signal: options.signal,
  });
}
