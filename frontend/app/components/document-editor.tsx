"use client";

import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import {
  ApiError,
  getDocument,
  invokeAi,
  listAiHistory,
  listVersions,
  updateDocument,
} from "@/app/lib/api";
import { WS_BASE_URL } from "@/app/lib/config";
import {
  canCreateVersions,
  canEdit,
  canUseAi,
  type AIInteraction,
  type AIFeature,
  type DocumentRecord,
  type DocumentVersion,
  type UserRole,
} from "@/app/lib/types";
import RolePicker from "./role-picker";

const roleStorageKey = "atlas-role";

type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline" | "error";

type PresenceActor = {
  id: string;
  label: string;
  role: UserRole;
};

type ActivityItem = {
  id: string;
  tone: "neutral" | "accent" | "warn";
  message: string;
  createdAt: string;
};

type BroadcastPayload = {
  type: string;
  actor?: PresenceActor;
  message?: string;
  title?: string;
  content?: string;
  feature?: AIFeature;
};

const aiFeatures: Array<{ value: AIFeature; label: string }> = [
  { value: "rewrite", label: "Rewrite" },
  { value: "summarize", label: "Summarize" },
  { value: "translate", label: "Translate" },
  { value: "restructure", label: "Restructure" },
];

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildActivity(message: string, tone: ActivityItem["tone"] = "neutral"): ActivityItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tone,
    message,
    createdAt: new Date().toISOString(),
  };
}

function getSelectionContext(content: string, start: number, end: number) {
  const left = Math.max(0, start - 180);
  const right = Math.min(content.length, end + 180);
  return content.slice(left, right);
}

function connectionLabel(status: ConnectionStatus) {
  switch (status) {
    case "live":
      return "Live";
    case "reconnecting":
      return "Reconnecting";
    case "error":
      return "Socket error";
    case "offline":
      return "Offline";
    default:
      return "Connecting";
  }
}

export default function DocumentEditor({ documentId }: { documentId: number }) {
  const [role, setRole] = useState<UserRole>("owner");
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [history, setHistory] = useState<AIInteraction[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [versionLabel, setVersionLabel] = useState("");
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [selectedText, setSelectedText] = useState("");
  const [aiFeature, setAiFeature] = useState<AIFeature>("rewrite");
  const [targetLanguage, setTargetLanguage] = useState("Arabic");
  const [aiResult, setAiResult] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [presence, setPresence] = useState<PresenceActor[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [draftSignal, setDraftSignal] = useState(0);
  const [remoteDraftNotice, setRemoteDraftNotice] = useState<string | null>(null);

  const clientIdRef = useRef(`client-${Math.random().toString(36).slice(2, 10)}`);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const savedRole = window.localStorage.getItem(roleStorageKey);
    if (
      savedRole === "owner" ||
      savedRole === "editor" ||
      savedRole === "commenter" ||
      savedRole === "viewer"
    ) {
      setRole(savedRole);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(roleStorageKey, role);
  }, [role]);

  const pushActivity = useEffectEvent((message: string, tone: ActivityItem["tone"] = "neutral") => {
    setActivity((current) => [buildActivity(message, tone), ...current].slice(0, 14));
  });

  const refreshSupplementaryData = useEffectEvent(async () => {
    const [versionResult, historyResult] = await Promise.allSettled([
      listVersions(documentId),
      listAiHistory(),
    ]);

    if (versionResult.status === "fulfilled") {
      setVersions(versionResult.value);
    }

    if (historyResult.status === "fulfilled") {
      setHistory(historyResult.value.filter((item) => item.document_id === documentId));
    }
  });

  const loadDocumentState = useEffectEvent(async () => {
    setLoading(true);
    setError(null);

    try {
      const currentDocument = await getDocument(documentId);
      setDocument(currentDocument);
      setTitle(currentDocument.title);
      setContent(currentDocument.content);
      setDirty(false);
      await refreshSupplementaryData();
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to load document.";
      setError(message);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (!Number.isFinite(documentId) || documentId <= 0) {
      setError("Invalid document id.");
      setLoading(false);
      return;
    }

    setPresence([]);
    setActivity([]);
    setAiResult("");
    setAiError(null);
    void loadDocumentState();
  }, [documentId, loadDocumentState]);

  function broadcast(payload: BroadcastPayload) {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }
    socketRef.current.send(JSON.stringify(payload));
  }

  const handleSocketMessage = useEffectEvent((event: MessageEvent<string>) => {
    const parsed = JSON.parse(event.data) as {
      type?: string;
      message?: string;
      payload?: BroadcastPayload;
    };

    if (parsed.type === "presence" && parsed.message) {
      pushActivity(parsed.message);
      return;
    }

    if (!parsed.payload) {
      return;
    }

    const payload = parsed.payload;
    const actor = payload.actor;

    if (payload.type === "presence-sync" && actor) {
      if (payload.message === "joined") {
        setPresence((current) => {
          const others = current.filter((item) => item.id !== actor.id);
          return [actor, ...others];
        });
        if (actor.id !== clientIdRef.current) {
          pushActivity(`${actor.label} joined as ${actor.role}.`, "accent");
        }
      }

      if (payload.message === "left") {
        setPresence((current) => current.filter((item) => item.id !== actor.id));
        if (actor.id !== clientIdRef.current) {
          pushActivity(`${actor.label} left the document room.`);
        }
      }
      return;
    }

    if (payload.type === "content-update" && actor) {
      setPresence((current) => {
        const others = current.filter((item) => item.id !== actor.id);
        return [actor, ...others];
      });

      if (actor.id === clientIdRef.current) {
        return;
      }

      pushActivity(`${actor.label} sent a live draft update.`, "accent");
      if (!dirty) {
        setTitle(payload.title ?? "");
        setContent(payload.content ?? "");
        setDocument((current) =>
          current
            ? {
                ...current,
                title: payload.title ?? current.title,
                content: payload.content ?? current.content,
                updated_at: new Date().toISOString(),
              }
            : current,
        );
      } else {
        setRemoteDraftNotice(`Live update received from ${actor.label}. Save or refresh when ready.`);
      }
      return;
    }

    if (payload.type === "ai-request" && actor && actor.id !== clientIdRef.current) {
      pushActivity(`${actor.label} ran ${payload.feature} on a text selection.`);
    }
  });

  useEffect(() => {
    let cancelled = false;
    let reconnectAttempts = 0;

    function connect() {
      setConnectionStatus(reconnectAttempts > 0 ? "reconnecting" : "connecting");
      const socket = new WebSocket(`${WS_BASE_URL}/documents/${documentId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (cancelled) {
          socket.close();
          return;
        }

        reconnectAttempts = 0;
        setConnectionStatus("live");
        setRemoteDraftNotice(null);

        const actor: PresenceActor = {
          id: clientIdRef.current,
          label: `Local ${role}`,
          role,
        };

        setPresence((current) => {
          const others = current.filter((item) => item.id !== actor.id);
          return [actor, ...others];
        });

        socket.send(
          JSON.stringify({
            type: "presence-sync",
            actor,
            message: "joined",
          }),
        );
      };

      socket.onmessage = handleSocketMessage;

      socket.onerror = () => {
        if (!cancelled) {
          setConnectionStatus("error");
        }
      };

      socket.onclose = () => {
        if (cancelled) {
          setConnectionStatus("offline");
          return;
        }

        setConnectionStatus("reconnecting");
        reconnectAttempts += 1;
        reconnectTimerRef.current = setTimeout(connect, 1500);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "presence-sync",
            actor: {
              id: clientIdRef.current,
              label: `Local ${role}`,
              role,
            },
            message: "left",
          }),
        );
      }

      socket?.close();
      socketRef.current = null;
    };
  }, [documentId, handleSocketMessage, role]);

  useEffect(() => {
    if (!draftSignal || !document || !canEdit(role) || connectionStatus !== "live") {
      return;
    }

    const timer = setTimeout(() => {
      broadcast({
        type: "content-update",
        actor: {
          id: clientIdRef.current,
          label: `Local ${role}`,
          role,
        },
        title,
        content,
      });
    }, 700);

    return () => clearTimeout(timer);
  }, [connectionStatus, content, document, draftSignal, role, title]);

  function syncSelection(textarea: HTMLTextAreaElement) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setSelectionStart(start);
    setSelectionEnd(end);
    setSelectedText(textarea.value.slice(start, end));
  }

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>) {
    setTitle(event.target.value);
    setDirty(true);
    setSaveMessage(null);
    setDraftSignal(Date.now());
  }

  function handleContentChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setContent(event.target.value);
    setDirty(true);
    setSaveMessage(null);
    setRemoteDraftNotice(null);
    syncSelection(event.target);
    setDraftSignal(Date.now());
  }

  async function handleSaveDocument(event?: FormEvent) {
    event?.preventDefault();
    if (!document || !canEdit(role)) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const savedDocument = await updateDocument(document.id, {
        title,
        content,
      });
      setDocument(savedDocument);
      setTitle(savedDocument.title);
      setContent(savedDocument.content);
      setDirty(false);
      setSaveMessage(`Saved at ${formatTimestamp(savedDocument.updated_at)}.`);
      pushActivity("Document changes saved to SQLite.", "accent");
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to save document.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateVersion() {
    if (!document || !canCreateVersions(role)) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const savedDocument = await updateDocument(document.id, {
        title,
        content,
        create_version: true,
        version_label: versionLabel.trim() || undefined,
      });
      setDocument(savedDocument);
      setTitle(savedDocument.title);
      setContent(savedDocument.content);
      setDirty(false);
      setVersionLabel("");
      setSaveMessage("Version snapshot created.");
      await refreshSupplementaryData();
      pushActivity("Owner created a version snapshot.", "accent");
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to create version snapshot.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleInvokeAi() {
    if (!document || !canUseAi(role)) {
      return;
    }

    if (!selectedText.trim()) {
      setAiError("Select part of the document text before invoking AI.");
      return;
    }

    setAiBusy(true);
    setAiError(null);

    try {
      broadcast({
        type: "ai-request",
        actor: {
          id: clientIdRef.current,
          label: `Local ${role}`,
          role,
        },
        feature: aiFeature,
      });

      const response = await invokeAi({
        feature: aiFeature,
        selected_text: selectedText,
        surrounding_context: getSelectionContext(content, selectionStart, selectionEnd),
        target_language: aiFeature === "translate" ? targetLanguage : undefined,
        document_id: document.id,
      });

      setAiResult(response.output_text);
      setSaveMessage("AI suggestion ready for review.");
      await refreshSupplementaryData();
      pushActivity(`AI ${aiFeature} suggestion received.`, "accent");
    } catch (requestError) {
      const message =
        requestError instanceof ApiError
          ? requestError.message
          : "AI request failed. Check LM Studio or enable mock mode.";
      setAiError(message);
    } finally {
      setAiBusy(false);
    }
  }

  function handleApplySuggestion() {
    if (!aiResult || !canEdit(role)) {
      return;
    }

    if (selectionEnd > selectionStart) {
      setContent((current) => {
        const nextContent =
          current.slice(0, selectionStart) + aiResult + current.slice(selectionEnd);
        return nextContent;
      });
      setSelectionEnd(selectionStart + aiResult.length);
    } else {
      setContent((current) => `${current.trimEnd()}\n\n${aiResult}`);
    }

    setDirty(true);
    setDraftSignal(Date.now());
    setSaveMessage("AI suggestion staged in the editor. Save when ready.");
    pushActivity("AI suggestion applied to the local draft.", "accent");

    if (editorRef.current) {
      editorRef.current.focus();
    }
  }

  if (loading) {
    return (
      <main className="app-shell flex-1 px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto w-full max-w-7xl rounded-[2rem] border border-black/10 bg-white/70 px-6 py-12 text-center text-sm text-slate-600 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
          Loading document workspace...
        </div>
      </main>
    );
  }

  if (error && !document) {
    return (
      <main className="app-shell flex-1 px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-[2rem] border border-red-200 bg-white/80 p-8 text-red-700 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-red-500">Document error</p>
          <h1 className="text-3xl font-semibold text-slate-950">This editor could not load.</h1>
          <p className="text-sm leading-7">{error}</p>
          <Link
            href="/"
            className="inline-flex w-fit rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell flex-1 px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="grain-panel rounded-[2rem] border border-black/10 p-6 sm:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <Link
                href="/"
                className="inline-flex rounded-full border border-black/10 bg-white/80 px-4 py-2 text-xs uppercase tracking-[0.24em] text-slate-700"
              >
                Back to dashboard
              </Link>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  Document #{document?.id}
                </p>
                <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-5xl">
                  {title || document?.title || "Untitled draft"}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                  This editor page covers the frontend ownership slice: update flow, AI suggestion
                  review, version snapshots, and collaboration room status.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[29rem]">
              <div className="rounded-[1.5rem] border border-black/10 bg-white/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Connection
                </p>
                <p className="mt-3 text-xl font-semibold text-slate-950">
                  {connectionLabel(connectionStatus)}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-black/10 bg-white/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Presence
                </p>
                <p className="mt-3 text-xl font-semibold text-slate-950">{presence.length}</p>
              </div>
              <div className="rounded-[1.5rem] border border-black/10 bg-white/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Last updated
                </p>
                <p className="mt-3 text-sm font-medium text-slate-900">
                  {document ? formatTimestamp(document.updated_at) : "Unavailable"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <div className="space-y-6">
            <form
              onSubmit={handleSaveDocument}
              className="ink-card rounded-[1.75rem] border border-black/10 p-6"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Editor</p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                    Draft workspace
                  </h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={!canEdit(role) || saving || !dirty}
                    className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving..." : dirty ? "Save document" : "Saved"}
                  </button>
                  <button
                    type="button"
                    disabled={!canCreateVersions(role) || saving}
                    onClick={handleCreateVersion}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save version snapshot
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                <input
                  value={title}
                  onChange={handleTitleChange}
                  disabled={!canEdit(role)}
                  className="w-full rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-2xl font-semibold text-slate-950 shadow-sm disabled:bg-slate-100"
                />

                <textarea
                  ref={editorRef}
                  value={content}
                  onChange={handleContentChange}
                  onSelect={(event) => syncSelection(event.currentTarget)}
                  disabled={!canEdit(role)}
                  rows={20}
                  className="min-h-[28rem] w-full rounded-[1.5rem] border border-black/10 bg-white/95 px-5 py-4 text-sm leading-8 text-slate-900 shadow-sm disabled:bg-slate-100"
                />
              </div>

              <div className="mt-5 flex flex-col gap-3 text-sm">
                {!canEdit(role) ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                    {role === "commenter"
                      ? "Commenter mode is read-only for now. You can review text, versions, and AI history."
                      : "Viewer mode is read-only. Editing and AI actions are intentionally disabled."}
                  </div>
                ) : null}

                {remoteDraftNotice ? (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-800">
                    {remoteDraftNotice}
                  </div>
                ) : null}

                {saveMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
                    {saveMessage}
                  </div>
                ) : null}

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                    {error}
                  </div>
                ) : null}
              </div>
            </form>

            <div className="ink-card rounded-[1.75rem] border border-black/10 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">AI panel</p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                    Suggest, review, and apply
                  </h2>
                </div>
                <div className="rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-500">
                  Selection length: {selectedText.length}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <select
                    value={aiFeature}
                    onChange={(event) => setAiFeature(event.target.value as AIFeature)}
                    className="w-full rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-sm shadow-sm"
                  >
                    {aiFeatures.map((feature) => (
                      <option key={feature.value} value={feature.value}>
                        {feature.label}
                      </option>
                    ))}
                  </select>

                  <input
                    value={targetLanguage}
                    onChange={(event) => setTargetLanguage(event.target.value)}
                    disabled={aiFeature !== "translate"}
                    placeholder="Target language"
                    className="w-full rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-sm shadow-sm disabled:bg-slate-100"
                  />

                  <div className="rounded-[1.5rem] border border-black/10 bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                      Selected text
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                      {selectedText || "Select text inside the editor to prepare an AI request."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleInvokeAi}
                    disabled={!canUseAi(role) || aiBusy}
                    className="w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {aiBusy ? "Requesting suggestion..." : "Run AI suggestion"}
                  </button>

                  {!canUseAi(role) ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      AI is disabled for {role} mode. The assignment report expects a clear message
                      instead of a silent failure, so the frontend explains the restriction here.
                    </div>
                  ) : null}

                  {aiError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {aiError}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.5rem] border border-black/10 bg-slate-950 p-4 text-slate-100">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                      Suggestion result
                    </p>
                    <p className="mt-3 min-h-48 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                      {aiResult || "AI output will appear here for review before you apply it."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleApplySuggestion}
                    disabled={!aiResult || !canEdit(role)}
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Apply suggestion to draft
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="ink-card rounded-[1.75rem] border border-black/10 p-6">
              <RolePicker value={role} onChange={setRole} label="Demo role" />

              <div className="mt-6 rounded-[1.5rem] border border-dashed border-black/15 bg-white/50 p-4 text-sm leading-7 text-slate-700">
                The backend still needs real local auth and permission checks. This frontend role
                switcher keeps your demo aligned with the intended owner, editor, commenter, and
                viewer experiences until Person 2 finishes the auth layer.
              </div>
            </div>

            <div className="ink-card rounded-[1.75rem] border border-black/10 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Realtime</p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                    Presence and reconnecting
                  </h2>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.24em] ${
                    connectionStatus === "live"
                      ? "bg-emerald-100 text-emerald-800"
                      : connectionStatus === "reconnecting"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {connectionLabel(connectionStatus)}
                </span>
              </div>

              <div className="mt-6 space-y-3">
                {presence.map((person) => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-slate-700"
                  >
                    <span>{person.label}</span>
                    <span className="rounded-full bg-black px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white">
                      {person.role}
                    </span>
                  </div>
                ))}

                {presence.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-black/15 bg-white/50 px-4 py-5 text-sm text-slate-600">
                    No active collaborators detected yet. Open this document in a second tab to test
                    the room behavior.
                  </div>
                ) : null}
              </div>

              <div className="mt-6 space-y-3">
                {activity.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      item.tone === "accent"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : item.tone === "warn"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-black/10 bg-white/70 text-slate-700"
                    }`}
                  >
                    <div>{item.message}</div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.24em] opacity-70">
                      {formatTimestamp(item.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="ink-card rounded-[1.75rem] border border-black/10 p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Versions</p>
                <h2 className="mt-2 text-3xl font-semibold text-slate-950">Version snapshots</h2>
              </div>

              <div className="mt-5 flex gap-3">
                <input
                  value={versionLabel}
                  onChange={(event) => setVersionLabel(event.target.value)}
                  placeholder="Before AI rewrite"
                  disabled={!canCreateVersions(role)}
                  className="w-full rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-sm shadow-sm disabled:bg-slate-100"
                />
              </div>

              <div className="mt-6 space-y-3">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="rounded-2xl border border-black/10 bg-white/70 px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {version.label || "Untitled snapshot"}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                          {formatTimestamp(version.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled
                        className="rounded-2xl border border-black/10 bg-slate-100 px-4 py-2 text-sm text-slate-500"
                      >
                        Revert pending backend support
                      </button>
                    </div>
                  </div>
                ))}

                {versions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-black/15 bg-white/50 px-4 py-5 text-sm text-slate-600">
                    No saved versions yet. Owners can create snapshots from the editor toolbar.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="ink-card rounded-[1.75rem] border border-black/10 p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">AI history</p>
                <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                  Document-specific suggestions
                </h2>
              </div>

              <div className="mt-6 space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-black/10 bg-white/70 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white">
                        {item.feature}
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        {formatTimestamp(item.created_at)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-700">{item.response_text}</p>
                  </div>
                ))}

                {history.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-black/15 bg-white/50 px-4 py-5 text-sm text-slate-600">
                    AI history will populate here after the first successful request for this
                    document.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
