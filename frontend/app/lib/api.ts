import { API_BASE_URL } from "./config";
import { clearStoredSession, getStoredAccessToken, refreshStoredSession } from "./auth";
import type {
  AIInteractionStatus,
  AIInteraction,
  AIStreamChunkEvent,
  AIStreamDoneEvent,
  AIStreamErrorEvent,
  AIStreamStartEvent,
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

type StreamAiRequest = {
  feature: "rewrite" | "summarize" | "translate" | "restructure";
  selected_text: string;
  surrounding_context: string;
  target_language?: string;
  document_id?: number;
};

type StreamAiCallbacks = {
  onStart?: (event: AIStreamStartEvent) => void;
  onChunk?: (event: AIStreamChunkEvent) => void;
  onDone?: (event: AIStreamDoneEvent) => void;
  onError?: (event: AIStreamErrorEvent) => void;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readResponseError(response: Response) {
  const rawBody = await response.text();
  if (!rawBody) {
    return `Request failed with status ${response.status}.`;
  }

  try {
    const parsed = JSON.parse(rawBody) as ErrorShape;
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
  } catch {
    // Fall back to the raw body when the payload is not JSON.
  }

  return rawBody;
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

  const query = search.size ? `?${search.toString()}` : "";
  return apiRequest<AIInteraction[]>(`/ai/history${query}`);
}

export function invokeAi(payload: {
  feature: "rewrite" | "summarize" | "translate" | "restructure";
  selected_text: string;
  surrounding_context: string;
  target_language?: string;
  document_id?: number;
}, options: { signal?: AbortSignal } = {}) {
  return apiRequest<AIInvokeResponse>("/ai/invoke", {
    method: "POST",
    body: payload,
    signal: options.signal,
  });
}

export function updateAiHistoryStatus(
  interactionId: number,
  payload: { status: AIInteractionStatus },
) {
  return apiRequest<AIInteraction>(`/ai/history/${interactionId}`, {
    method: "PATCH",
    body: payload,
  });
}

function parseSseEventBlock(block: string) {
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  try {
    return {
      event: eventName,
      data: JSON.parse(dataLines.join("\n")) as
        | AIStreamStartEvent
        | AIStreamChunkEvent
        | AIStreamDoneEvent
        | AIStreamErrorEvent,
    };
  } catch {
    return null;
  }
}

function dispatchStreamEvent(
  parsed: ReturnType<typeof parseSseEventBlock>,
  callbacks: StreamAiCallbacks,
) {
  if (!parsed) {
    return;
  }

  switch (parsed.event) {
    case "start":
      callbacks.onStart?.(parsed.data as AIStreamStartEvent);
      break;
    case "chunk":
      callbacks.onChunk?.(parsed.data as AIStreamChunkEvent);
      break;
    case "done":
      callbacks.onDone?.(parsed.data as AIStreamDoneEvent);
      break;
    case "error":
      callbacks.onError?.(parsed.data as AIStreamErrorEvent);
      break;
    default:
      break;
  }
}

export async function streamAiSuggestion(
  payload: StreamAiRequest,
  callbacks: StreamAiCallbacks = {},
  signal?: AbortSignal,
) {
  async function runRequest() {
    const accessToken = getStoredAccessToken();
    return fetch(`${API_BASE_URL}/ai/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
      signal,
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

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredSession();
    }
    throw new ApiError(await readResponseError(response), response.status);
  }

  if (!response.body) {
    throw new ApiError("Streaming response body is unavailable.", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf("\n\n");

      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex).trim();
        buffer = buffer.slice(separatorIndex + 2);

        if (block) {
          dispatchStreamEvent(parseSseEventBlock(block), callbacks);
        }

        separatorIndex = buffer.indexOf("\n\n");
      }
    }

    const trailingBlock = buffer.trim();
    if (trailingBlock) {
      dispatchStreamEvent(parseSseEventBlock(trailingBlock), callbacks);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}
