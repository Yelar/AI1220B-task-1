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
import { formatTimestamp, getExcerpt, readStoredRole, writeStoredRole } from "@/app/lib/ui";
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

function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-2xl border border-black/8 bg-white text-black shadow-[0_10px_18px_rgba(15,23,42,0.08)] ${
        compact ? "h-10 w-10" : "h-11 w-11"
      }`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={compact ? "h-5 w-5" : "h-6 w-6"}>
        <path d="M6 2h8l4 4v16H6V2Zm8 1.8V7h3.2L14 3.8ZM8.5 10h7v1.4h-7V10Zm0 3.3h7v1.4h-7v-1.4Zm0 3.3h5v1.4h-5v-1.4Z" fill="currentColor" />
      </svg>
    </div>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="m14.5 6.5-5 5 5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function outlineFromContent(content: string) {
  const headingLines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^#+\s/.test(line) || /^[A-Z][A-Za-z0-9 ,:&/-]{3,}$/.test(line))
    .map((line) => line.replace(/^#+\s*/, ""));

  if (headingLines.length > 0) {
    return headingLines.slice(0, 6);
  }

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((line, index) => (index === 0 ? "Introduction" : getExcerpt(line, 36)));
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
    const savedRole = readStoredRole();
    if (savedRole) {
      setRole(savedRole);
    }
  }, []);

  useEffect(() => {
    writeStoredRole(role);
  }, [role]);

  function pushActivity(message: string, tone: ActivityItem["tone"] = "neutral") {
    setActivity((current) => [buildActivity(message, tone), ...current].slice(0, 14));
  }

  async function refreshSupplementaryData() {
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
  }

  useEffect(() => {
    if (!Number.isFinite(documentId) || documentId <= 0) {
      setError("Invalid document id.");
      setLoading(false);
      return;
    }

    async function run() {
      setLoading(true);
      setError(null);
      setPresence([]);
      setActivity([]);
      setAiResult("");
      setAiError(null);

      try {
        const currentDocument = await getDocument(documentId);
        setDocument(currentDocument);
        setTitle(currentDocument.title);
        setContent(currentDocument.content);
        setDirty(false);

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
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : "Failed to load document.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void run();
  }, [documentId]);

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
    const clientId = clientIdRef.current;

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
          id: clientId,
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
              id: clientId,
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
  }, [documentId, role]);

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
      setContent((current) => current.slice(0, selectionStart) + aiResult + current.slice(selectionEnd));
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

  const outline = outlineFromContent(content);
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const pageEstimate = Math.max(1, Math.ceil(Math.max(wordCount, 1) / 420));
  const lastUpdated = document ? formatTimestamp(document.updated_at) : "Unavailable";
  const saveStateLabel = saving ? "Saving..." : dirty ? "Unsaved changes" : "All changes saved";
  const selectedTextPreview = selectedText.trim()
    ? getExcerpt(selectedText.trim(), 110)
    : "Highlight text in the page to send it to the AI panel.";

  if (loading) {
    return (
      <main className="app-shell min-h-screen flex-1 bg-[#f1f3f4] px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-5xl rounded-[2rem] bg-white px-6 py-12 text-center text-sm text-slate-600 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          Loading document workspace...
        </div>
      </main>
    );
  }

  if (error && !document) {
    return (
      <main className="app-shell min-h-screen flex-1 bg-[#f1f3f4] px-4 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-[2rem] bg-white p-8 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <p className="section-label text-red-500">Document error</p>
          <h1 className="text-3xl font-semibold text-slate-950">This document could not load.</h1>
          <p className="text-sm leading-7 text-red-700">{error}</p>
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-[#1a73e8] px-5 py-3 text-sm font-semibold text-white"
          >
            <ArrowLeftIcon />
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell min-h-screen flex-1 bg-[#f1f3f4]">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <Link
                href="/"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
              >
                <ArrowLeftIcon />
              </Link>
              <AppLogo />
              <div className="min-w-0">
                <input
                  value={title}
                  onChange={handleTitleChange}
                  disabled={!canEdit(role)}
                  className="w-full min-w-0 bg-transparent text-[1.7rem] font-semibold tracking-tight text-slate-900 outline-none disabled:text-slate-900"
                />
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span>{saveStateLabel}</span>
                  <span>•</span>
                  <span>{lastUpdated}</span>
                  <span>•</span>
                  <span>SQLite workspace</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="pill border-0 bg-[rgba(31,122,224,0.09)] text-[#1f4aa8]">Role {role}</span>
              <span className="pill border-0 bg-[rgba(107,92,255,0.1)] text-[#4b3dd1]">
                {connectionLabel(connectionStatus)}
              </span>
              <button
                type="button"
                onClick={() => void handleSaveDocument()}
                disabled={!canEdit(role) || saving || !dirty}
                className="button-primary h-11 rounded-full px-5"
              >
                {saving ? "Saving..." : dirty ? "Save" : "Saved"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-[1.6rem] bg-[linear-gradient(135deg,rgba(31,122,224,0.08),rgba(107,92,255,0.08),rgba(217,70,239,0.06))] px-4 py-3">
            <span className="pill border-0 bg-white text-slate-700">{wordCount} words</span>
            <span className="pill border-0 bg-white text-slate-700">{pageEstimate} page estimate</span>
            <span className="pill border-0 bg-white text-slate-700">{selectedText.length} selected</span>
            <span className="pill border-0 bg-white text-slate-700">Versions {versions.length}</span>
            <span className="pill border-0 bg-white text-slate-700">AI history {history.length}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1800px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[250px,minmax(0,1fr),360px] lg:px-8">
        <aside className="space-y-5">
          <section className="rounded-[1.8rem] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-slate-900">Document tabs</p>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-black hover:bg-slate-100"
              >
                +
              </button>
            </div>
            <div className="mt-4 rounded-[1.2rem] bg-[linear-gradient(135deg,rgba(31,122,224,0.12),rgba(107,92,255,0.1),rgba(217,70,239,0.08))] p-3">
              <div className="flex items-center gap-3">
                <AppLogo compact />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {title || "Untitled document"}
                  </div>
                  <div className="text-xs text-slate-600">Active tab</div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[1.8rem] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-slate-900">Outline</p>
              <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Live</span>
            </div>
            <div className="mt-4 space-y-2">
              {outline.length > 0 ? (
                outline.map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-2xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    {item}
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-500">
                  Add headings or paragraph text and the outline will appear here.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-[1.8rem] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
            <p className="text-lg font-semibold text-slate-900">Document stats</p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Words</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{wordCount}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Pages</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{pageEstimate}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Selection</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{selectedText.length}</div>
              </div>
            </div>
          </section>
        </aside>

        <section className="min-w-0">
          <div className="space-y-4">
            {!canEdit(role) ? (
              <div className="notice notice-warn">
                {role === "commenter"
                  ? "Commenter mode is read-only for now. You can review the document, version history, and AI output."
                  : "Viewer mode is read-only. Editing and AI actions are intentionally disabled."}
              </div>
            ) : null}

            {remoteDraftNotice ? <div className="notice notice-info">{remoteDraftNotice}</div> : null}
            {saveMessage ? <div className="notice notice-success">{saveMessage}</div> : null}
            {error ? <div className="notice notice-error">{error}</div> : null}
          </div>

          <form onSubmit={handleSaveDocument} className="mt-4 rounded-[2rem] bg-[linear-gradient(180deg,#eef3ff,#f4f0ff)] p-4 sm:p-6">
            <div className="mx-auto mb-3 flex w-full max-w-[880px] items-center justify-between px-3 text-xs uppercase tracking-[0.24em] text-slate-400">
              <span>Page 1</span>
              <span>{pageEstimate} page estimate</span>
            </div>

            <div className="mx-auto w-full max-w-[880px] rounded-[0.35rem] bg-white px-10 py-12 shadow-[0_20px_44px_rgba(15,23,42,0.12)] sm:px-14 sm:py-14">
              <textarea
                ref={editorRef}
                value={content}
                onChange={handleContentChange}
                onSelect={(event) => syncSelection(event.currentTarget)}
                disabled={!canEdit(role)}
                rows={26}
                className="min-h-[68vh] w-full resize-none border-0 bg-transparent text-[1.08rem] leading-[2.1rem] text-slate-800 outline-none disabled:text-slate-700"
                placeholder="Start writing here. Select text to rewrite, summarize, translate, or restructure it from the AI panel."
              />
            </div>
          </form>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[1.8rem] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-900">Collaboration</p>
                <p className="mt-1 text-sm text-slate-500">Role, presence, and connection state</p>
              </div>
              <span className="pill border-0 bg-[rgba(31,122,224,0.1)] text-[#1f4aa8]">
                {connectionLabel(connectionStatus)}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Presence</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{presence.length}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Updated</div>
                <div className="mt-1 text-sm font-medium text-slate-800">{lastUpdated}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Doc id</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">#{document?.id}</div>
              </div>
            </div>

            <div className="mt-4 rounded-[1.4rem] bg-[linear-gradient(135deg,rgba(31,122,224,0.05),rgba(107,92,255,0.05),rgba(217,70,239,0.04))] p-4">
              <RolePicker value={role} onChange={setRole} label="Demo role" />
            </div>

            <div className="mt-4 space-y-2">
              {presence.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{person.label}</div>
                    <div className="text-xs text-slate-500">Live in the room</div>
                  </div>
                  <span className="pill border-0 bg-slate-100 text-slate-700">{person.role}</span>
                </div>
              ))}
              {presence.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">
                  Waiting for presence updates from the collaboration room.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-[1.8rem] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-900">AI assistant</p>
                <p className="mt-1 text-sm text-slate-500">Run an action on the selected text</p>
              </div>
              <div className="rounded-full bg-[linear-gradient(135deg,rgba(31,122,224,0.12),rgba(107,92,255,0.12),rgba(217,70,239,0.08))] p-1.5">
                <AppLogo compact />
              </div>
            </div>

            <div className="mt-4 rounded-[1.4rem] bg-[linear-gradient(135deg,rgba(31,122,224,0.08),rgba(107,92,255,0.08),rgba(217,70,239,0.06))] p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Selected text</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{selectedTextPreview}</p>
            </div>

            <div className="mt-4 space-y-3">
              <select
                value={aiFeature}
                onChange={(event) => setAiFeature(event.target.value as AIFeature)}
                disabled={!canUseAi(role)}
                className="field-select"
              >
                {aiFeatures.map((feature) => (
                  <option key={feature.value} value={feature.value}>
                    {feature.label}
                  </option>
                ))}
              </select>

              {aiFeature === "translate" ? (
                <input
                  value={targetLanguage}
                  onChange={(event) => setTargetLanguage(event.target.value)}
                  disabled={!canUseAi(role)}
                  className="field"
                  placeholder="Target language"
                />
              ) : null}

              <button
                type="button"
                onClick={() => void handleInvokeAi()}
                disabled={!canUseAi(role) || aiBusy}
                className="button-primary h-12 w-full rounded-full"
              >
                {aiBusy ? "Running..." : `Run ${aiFeatures.find((item) => item.value === aiFeature)?.label}`}
              </button>

              {!canUseAi(role) ? (
                <div className="notice notice-warn">
                  AI actions are available only for owner and editor roles in the frontend demo.
                </div>
              ) : null}
              {aiError ? <div className="notice notice-error">{aiError}</div> : null}
            </div>

            <div className="mt-4 rounded-[1.4rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,246,255,0.98))] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Suggestion</p>
                <button
                  type="button"
                  onClick={handleApplySuggestion}
                  disabled={!aiResult || !canEdit(role)}
                  className="button-secondary rounded-full px-4 py-2"
                >
                  Apply
                </button>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {aiResult || "AI output will appear here after you run an action."}
              </p>
            </div>
          </section>

          <section className="rounded-[1.8rem] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-900">Versions</p>
                <p className="mt-1 text-sm text-slate-500">Save checkpoints before major changes</p>
              </div>
              <span className="pill border-0 bg-slate-100 text-slate-700">{versions.length}</span>
            </div>

            <div className="mt-4 space-y-3">
              <input
                value={versionLabel}
                onChange={(event) => setVersionLabel(event.target.value)}
                placeholder="Before AI rewrite"
                disabled={!canCreateVersions(role)}
                className="field"
              />
              <button
                type="button"
                disabled={!canCreateVersions(role) || saving}
                onClick={() => void handleCreateVersion()}
                className="button-secondary h-12 w-full rounded-full"
              >
                Save version snapshot
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {versions.slice(0, 4).map((version) => (
                <div key={version.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="text-sm font-medium text-slate-900">
                    {version.label || `Version ${version.id}`}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{formatTimestamp(version.created_at)}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {getExcerpt(version.content, 90)}
                  </p>
                </div>
              ))}
              {versions.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">
                  No snapshots yet. Create one before a big rewrite or AI pass.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-[1.8rem] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
            <p className="text-lg font-semibold text-slate-900">Recent suggestions</p>
            <div className="mt-4 space-y-3">
              {history.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="pill border-0 bg-[#e8f0fe] text-[#174ea6]">{item.feature}</span>
                    <span className="text-xs text-slate-500">{formatTimestamp(item.created_at)}</span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900">{item.status}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {getExcerpt(item.response_text, 100)}
                  </p>
                </div>
              ))}
              {history.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">
                  AI history for this document will appear after the first request.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-[1.8rem] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
            <p className="text-lg font-semibold text-slate-900">Activity</p>
            <div className="mt-4 space-y-3">
              {activity.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                    item.tone === "accent"
                      ? "bg-[#e8f0fe] text-[#174ea6]"
                      : item.tone === "warn"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-50 text-slate-600"
                  }`}
                >
                  <div className="font-medium">{item.message}</div>
                  <div className="mt-1 text-xs opacity-80">{formatTimestamp(item.createdAt)}</div>
                </div>
              ))}
              {activity.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">
                  Collaboration activity will show here as clients join, edit, or trigger AI.
                </p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
