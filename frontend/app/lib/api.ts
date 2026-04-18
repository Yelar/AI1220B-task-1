import { API_BASE_URL } from "./config";
import { clearStoredSession, getStoredAccessToken, refreshStoredSession } from "./auth";
import type {
  AIInteraction,
  AIInvokeResponse,
  AuthUser,
  DocumentPermission,
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
    if (response.status === 401) {
      clearStoredSession();
    }
    const detail =
      typeof (data as ErrorShape | null)?.detail === "string"
        ? (data as ErrorShape).detail!
        : response.status === 401
          ? "Your session expired. Sign in again."
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

export function deleteDocument(documentId: number) {
  return apiRequest<void>(`/documents/${documentId}`, {
    method: "DELETE",
  });
}

export function listUsers() {
  return apiRequest<AuthUser[]>("/users");
}

export function listPermissions(documentId: number) {
  return apiRequest<DocumentPermission[]>(`/documents/${documentId}/permissions`);
}

export function upsertPermission(documentId: number, payload: { user_id: number; role: "owner" | "editor" | "viewer" }) {
  return apiRequest<DocumentPermission>(`/documents/${documentId}/permissions`, {
    method: "POST",
    body: payload,
  });
}

export function removePermission(documentId: number, userId: number) {
  return apiRequest<void>(`/documents/${documentId}/permissions/${userId}`, {
    method: "DELETE",
  });
}

export function listAiHistory(documentId?: number) {
  const query = documentId ? `?document_id=${documentId}` : "";
  return apiRequest<AIInteraction[]>(`/ai/history${query}`);
}

type InvokeAiOptions = {
  signal?: AbortSignal;
};

type InvokeAiStreamOptions = InvokeAiOptions & {
  onChunk: (chunk: string) => void;
  onOpen?: () => void;
  onDone?: () => void;
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

async function authenticatedFetch(path: string, options: RequestOptions = {}) {
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

  return response;
}

function parseSseChunk(raw: string) {
  const lines = raw.split("\n");
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  if (dataLines.length === 0) {
    return null;
  }

  const payload = dataLines.join("\n");
  if (!payload || payload === "[DONE]") {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as { chunk?: string; output_text?: string; text?: string };
    return parsed.chunk ?? parsed.output_text ?? parsed.text ?? "";
  } catch {
    return payload;
  }
}

export async function invokeAiStream(
  payload: {
    feature: "rewrite" | "summarize" | "translate" | "restructure";
    selected_text: string;
    surrounding_context: string;
    target_language?: string;
    document_id?: number;
  },
  options: InvokeAiStreamOptions,
) {
  const response = await authenticatedFetch("/ai/invoke", {
    method: "POST",
    body: payload,
    signal: options.signal,
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredSession();
    }
    const rawBody = await response.text();
    const data = rawBody ? (JSON.parse(rawBody) as ErrorShape) : null;
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : response.status === 401
          ? "Your session expired. Sign in again."
          : `Request failed with status ${response.status}.`;
    throw new ApiError(detail, response.status);
  }

  options.onOpen?.();

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const raw = await response.text();
    const data = raw ? (JSON.parse(raw) as AIInvokeResponse) : { output_text: "" };
    options.onChunk(data.output_text ?? "");
    options.onDone?.();
    return data.output_text ?? "";
  }

  const reader = response.body?.getReader();

  if (!reader) {
    options.onDone?.();
    return "";
  }

  const decoder = new TextDecoder();
  let finalOutput = "";
  let buffered = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const next = decoder.decode(value, { stream: true });

    if (contentType.includes("text/event-stream")) {
      buffered += next;
      const events = buffered.split("\n\n");
      buffered = events.pop() ?? "";

      for (const eventBlock of events) {
        const chunk = parseSseChunk(eventBlock);
        if (chunk) {
          finalOutput += chunk;
          options.onChunk(chunk);
        }
      }
      continue;
    }

    finalOutput += next;
    options.onChunk(next);
  }

  if (contentType.includes("text/event-stream") && buffered.trim()) {
    const chunk = parseSseChunk(buffered);
    if (chunk) {
      finalOutput += chunk;
      options.onChunk(chunk);
    }
  }

  options.onDone?.();
  return finalOutput;
}
