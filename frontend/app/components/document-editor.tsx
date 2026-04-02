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
  createVersion,
  deletePermission,
  exportDocument,
  getDocument,
  invokeAi,
  listAiHistory,
  listPermissions,
  listUsers,
  listVersions,
  revertVersion,
  upsertPermission,
  updateDocument,
} from "@/app/lib/api";
import { WS_BASE_URL } from "@/app/lib/config";
import {
  formatTimestamp,
  getDemoIdentityForRole,
  getExcerpt,
  getRoleForDemoUserId,
  readStoredRole,
  writeStoredRole,
} from "@/app/lib/ui";
import {
  canCreateVersions,
  canEdit,
  canManagePermissions,
  canRevertVersions,
  canUseAi,
  type AIFeature,
  type AIInteraction,
  type DemoUser,
  type DocumentPermission,
  type DocumentRecord,
  type DocumentVersion,
  type UserRole,
} from "@/app/lib/types";
import RolePicker from "./role-picker";

type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline" | "error";
type ShareRoleDraft = UserRole | "none";

type PresenceActor = {
  id: string;
  label: string;
  role: UserRole;
  userId: number;
  cursorFrom: number | null;
  selectionFrom: number | null;
  selectionTo: number | null;
};

type PresenceWire = {
  userId: string | number;
  userName: string;
  clientId: string;
  cursor?: { from?: number; to?: number } | null;
  selection?: { from?: number; to?: number } | null;
};

type SocketMessage =
  | {
      type: "connection:ack";
      documentId: string;
      clientId: string;
      participants: PresenceWire[];
    }
  | {
      type: "presence:sync";
      documentId: string;
      participants: PresenceWire[];
    }
  | {
      type: "document:update";
      documentId: string;
      sender: {
        userId: string | number;
        userName: string;
        clientId: string;
      };
      payload: {
        title?: string;
        content?: string;
      };
    }
  | {
      type: "error";
      documentId: string;
      message: string;
    };

type DocumentUpdatePayload = {
  title: string;
  content: string;
};

const aiFeatures: Array<{ value: AIFeature; label: string }> = [
  { value: "rewrite", label: "Rewrite" },
  { value: "summarize", label: "Summarize" },
  { value: "translate", label: "Translate" },
  { value: "restructure", label: "Restructure" },
];

function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-[#111111] text-white shadow-[0_10px_18px_rgba(15,23,42,0.16)] ${
        compact ? "h-10 w-10" : "h-11 w-11"
      }`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={compact ? "h-5 w-5" : "h-6 w-6"}>
        <path d="M12 5.5 18.2 16H5.8L12 5.5Z" fill="currentColor" />
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
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

function mapParticipant(participant: PresenceWire): PresenceActor {
  const role = getRoleForDemoUserId(participant.userId);

  return {
    id: participant.clientId,
    label: participant.userName,
    role,
    userId: Number(participant.userId),
    cursorFrom: typeof participant.cursor?.from === "number" ? participant.cursor.from : null,
    selectionFrom:
      typeof participant.selection?.from === "number" ? participant.selection.from : null,
    selectionTo: typeof participant.selection?.to === "number" ? participant.selection.to : null,
  };
}

function buildDownloadFilename(title: string, format: "md" | "txt" | "json") {
  const stem = (title.trim() || "document")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/^-+|-+$/g, "");
  return `${stem || "document"}.${format}`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function defaultShareDrafts(users: DemoUser[], permissions: DocumentPermission[]) {
  const byUserId = new Map(permissions.map((permission) => [permission.user_id, permission.role]));

  return users.reduce<Record<number, ShareRoleDraft>>((accumulator, user) => {
    accumulator[user.id] = user.id === 1 ? "owner" : byUserId.get(user.id) ?? "none";
    return accumulator;
  }, {});
}

export default function DocumentEditor({ documentId }: { documentId: number }) {
  const [role, setRole] = useState<UserRole>("owner");
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [selectedText, setSelectedText] = useState("");
  const [aiFeature, setAiFeature] = useState<AIFeature>("rewrite");
  const [targetLanguage, setTargetLanguage] = useState("Arabic");
  const [aiResult, setAiResult] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [presence, setPresence] = useState<PresenceActor[]>([]);
  const [draftSignal, setDraftSignal] = useState(0);
  const [remoteDraftNotice, setRemoteDraftNotice] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [permissions, setPermissions] = useState<DocumentPermission[]>([]);
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [shareDrafts, setShareDrafts] = useState<Record<number, ShareRoleDraft>>({});
  const [aiHistory, setAiHistory] = useState<AIInteraction[]>([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [sidebarBusy, setSidebarBusy] = useState<string | null>(null);
  const [sidebarMessage, setSidebarMessage] = useState<string | null>(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<"md" | "txt" | "json" | null>(null);

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

  async function refreshWorkspaceData(currentDocumentId: number, nextRole: UserRole = role) {
    const requests: Array<Promise<unknown>> = [
      listVersions(currentDocumentId),
      listAiHistory({ document_id: currentDocumentId, limit: 12 }),
    ];

    if (canManagePermissions(nextRole)) {
      requests.push(listPermissions(currentDocumentId), listUsers());
    }

    const results = await Promise.allSettled(requests);

    const [versionsResult, historyResult, permissionsResult, usersResult] = results;

    if (versionsResult?.status === "fulfilled") {
      setVersions(versionsResult.value as DocumentVersion[]);
    }

    if (historyResult?.status === "fulfilled") {
      setAiHistory(historyResult.value as AIInteraction[]);
    }

    if (canManagePermissions(nextRole)) {
      if (permissionsResult?.status === "fulfilled") {
        const nextPermissions = permissionsResult.value as DocumentPermission[];
        setPermissions(nextPermissions);

        if (usersResult?.status === "fulfilled") {
          const nextUsers = usersResult.value as DemoUser[];
          setUsers(nextUsers);
          setShareDrafts(defaultShareDrafts(nextUsers, nextPermissions));
        }
      } else {
        setPermissions([]);
        setUsers([]);
        setShareDrafts({});
      }
    } else {
      setPermissions([]);
      setUsers([]);
      setShareDrafts({});
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
      setAiResult("");
      setAiError(null);
      setSidebarMessage(null);
      setSidebarError(null);

      try {
        const currentDocument = await getDocument(documentId);
        setDocument(currentDocument);
        setTitle(currentDocument.title);
        setContent(currentDocument.content);
        setDirty(false);

        const requests: Array<Promise<unknown>> = [
          listVersions(currentDocument.id),
          listAiHistory({ document_id: currentDocument.id, limit: 12 }),
        ];

        if (canManagePermissions(role)) {
          requests.push(listPermissions(currentDocument.id), listUsers());
        }

        const results = await Promise.allSettled(requests);
        const [versionsResult, historyResult, permissionsResult, usersResult] = results;

        if (versionsResult?.status === "fulfilled") {
          setVersions(versionsResult.value as DocumentVersion[]);
        }

        if (historyResult?.status === "fulfilled") {
          setAiHistory(historyResult.value as AIInteraction[]);
        }

        if (canManagePermissions(role)) {
          if (permissionsResult?.status === "fulfilled") {
            const nextPermissions = permissionsResult.value as DocumentPermission[];
            setPermissions(nextPermissions);

            if (usersResult?.status === "fulfilled") {
              const nextUsers = usersResult.value as DemoUser[];
              setUsers(nextUsers);
              setShareDrafts(defaultShareDrafts(nextUsers, nextPermissions));
            }
          } else {
            setPermissions([]);
            setUsers([]);
            setShareDrafts({});
          }
        } else {
          setPermissions([]);
          setUsers([]);
          setShareDrafts({});
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
  }, [documentId, role]);

  function broadcastDocumentUpdate(payload: DocumentUpdatePayload) {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: "document:update",
        payload,
      }),
    );
  }

  const handleSocketMessage = useEffectEvent((event: MessageEvent<string>) => {
    const parsed = JSON.parse(event.data) as SocketMessage;

    if (parsed.type === "connection:ack") {
      setConnectionStatus("live");
      setPresence(parsed.participants.map(mapParticipant));
      return;
    }

    if (parsed.type === "presence:sync") {
      setPresence(parsed.participants.map(mapParticipant));
      return;
    }

    if (parsed.type === "error") {
      setConnectionStatus("error");
      setRemoteDraftNotice(parsed.message);
      return;
    }

    if (parsed.type === "document:update") {
      if (parsed.sender.clientId === clientIdRef.current) {
        return;
      }

      if (!dirty) {
        setTitle(parsed.payload.title ?? "");
        setContent(parsed.payload.content ?? "");
        setDocument((current) =>
          current
            ? {
                ...current,
                title: parsed.payload.title ?? current.title,
                content: parsed.payload.content ?? current.content,
                updated_at: new Date().toISOString(),
              }
            : current,
        );
      } else {
        setRemoteDraftNotice(
          `Live update received from ${parsed.sender.userName}. Save or refresh when ready.`,
        );
      }
    }
  });

  useEffect(() => {
    let cancelled = false;
    let reconnectAttempts = 0;
    const clientId = clientIdRef.current;
    const identity = getDemoIdentityForRole(role);

    function connect() {
      setConnectionStatus(reconnectAttempts > 0 ? "reconnecting" : "connecting");
      const socket = new WebSocket(
        `${WS_BASE_URL}/documents/${documentId}?userId=${identity.userId}&userName=${encodeURIComponent(identity.userName)}&clientId=${clientId}`,
      );
      socketRef.current = socket;

      socket.onopen = () => {
        if (cancelled) {
          socket.close();
          return;
        }

        reconnectAttempts = 0;
        setConnectionStatus("connecting");
        setRemoteDraftNotice(null);
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

      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [documentId, role]);

  useEffect(() => {
    if (!draftSignal || !document || !canEdit(role) || connectionStatus !== "live") {
      return;
    }

    const timer = setTimeout(() => {
      broadcastDocumentUpdate({
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

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "presence:update",
          cursor: { from: end },
          selection: { from: start, to: end },
        }),
      );
    }
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
      await refreshWorkspaceData(savedDocument.id);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to save document.";
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
      const response = await invokeAi({
        feature: aiFeature,
        selected_text: selectedText,
        surrounding_context: getSelectionContext(content, selectionStart, selectionEnd),
        target_language: aiFeature === "translate" ? targetLanguage : undefined,
        document_id: document.id,
      });

      setAiResult(response.output_text);
      setSaveMessage("AI suggestion ready for review.");
      await refreshWorkspaceData(document.id);
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

    if (editorRef.current) {
      editorRef.current.focus();
    }
  }

  function openAiPanel() {
    setAiPanelOpen(true);
  }

  async function handleCreateVersion() {
    if (!document || !canCreateVersions(role)) {
      return;
    }

    setSidebarBusy("version:create");
    setSidebarError(null);
    setSidebarMessage(null);

    try {
      const createdVersion = await createVersion(document.id, {
        label: versionLabel.trim() || undefined,
      });
      setVersions((current) => [createdVersion, ...current]);
      setVersionLabel("");
      setSidebarMessage(`Saved version "${createdVersion.label ?? "Manual version"}".`);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to create a version.";
      setSidebarError(message);
    } finally {
      setSidebarBusy(null);
    }
  }

  async function handleRevertVersion(versionId: number) {
    if (!document || !canRevertVersions(role)) {
      return;
    }

    setSidebarBusy(`version:${versionId}`);
    setSidebarError(null);
    setSidebarMessage(null);

    try {
      const revertedDocument = await revertVersion(document.id, versionId);
      setDocument(revertedDocument);
      setTitle(revertedDocument.title);
      setContent(revertedDocument.content);
      setDirty(false);
      setSaveMessage(`Reverted to version ${versionId}.`);
      await refreshWorkspaceData(revertedDocument.id);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to revert the document.";
      setSidebarError(message);
    } finally {
      setSidebarBusy(null);
    }
  }

  async function handleExport(format: "md" | "txt" | "json") {
    if (!document) {
      return;
    }

    setExportingFormat(format);
    setSidebarError(null);
    setSidebarMessage(null);

    try {
      const blob = await exportDocument(document.id, format);
      saveBlob(blob, buildDownloadFilename(title || document.title, format));
      setSidebarMessage(`Downloaded ${format.toUpperCase()} export.`);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to export the document.";
      setSidebarError(message);
    } finally {
      setExportingFormat(null);
    }
  }

  async function handleSavePermission(userId: number) {
    if (!document || !canManagePermissions(role)) {
      return;
    }

    const draftRole = shareDrafts[userId];
    if (!draftRole || userId === 1) {
      return;
    }

    setSidebarBusy(`permission:${userId}`);
    setSidebarError(null);
    setSidebarMessage(null);

    try {
      if (draftRole === "none") {
        const existingPermission = permissions.find((permission) => permission.user_id === userId);
        if (existingPermission) {
          await deletePermission(document.id, userId);
        }
      } else {
        await upsertPermission(document.id, { user_id: userId, role: draftRole });
      }

      await refreshWorkspaceData(document.id);
      setSidebarMessage("Sharing settings updated.");
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to update sharing.";
      setSidebarError(message);
    } finally {
      setSidebarBusy(null);
    }
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const lastUpdated = document ? formatTimestamp(document.updated_at) : "Unavailable";
  const saveStateLabel = saving ? "Saving..." : dirty ? "Unsaved changes" : "All changes saved";
  const selectedTextPreview = selectedText.trim()
    ? getExcerpt(selectedText.trim(), 110)
    : "Highlight text in the page to send it to the AI panel.";
  const currentSelectionLength = Math.max(0, selectionEnd - selectionStart);

  if (loading) {
    return (
      <main className="app-shell min-h-screen flex-1 px-4 py-8 sm:px-6">
        <div className="surface-card mx-auto w-full max-w-5xl rounded-[2rem] px-6 py-12 text-center text-sm text-slate-600">
          Loading document workspace...
        </div>
      </main>
    );
  }

  if (error && !document) {
    return (
      <main className="app-shell min-h-screen flex-1 px-4 py-8 sm:px-6">
        <div className="surface-card mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-[2rem] p-8">
          <p className="section-label text-red-500">Document error</p>
          <h1 className="text-3xl font-semibold text-slate-950">This document could not load.</h1>
          <p className="text-sm leading-7 text-red-700">{error}</p>
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-[#111111] px-5 py-3 text-sm font-semibold text-white"
          >
            <ArrowLeftIcon />
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell min-h-screen flex-1">
      <div className="sticky top-0 z-20 border-b border-[rgba(27,36,48,0.08)] bg-[rgba(255,253,249,0.92)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
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
                  className="w-full min-w-0 bg-transparent text-[1.8rem] font-semibold tracking-tight text-slate-900 outline-none disabled:text-slate-900"
                />
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[0.92rem] text-slate-500">
                  <span>{saveStateLabel}</span>
                  <span>•</span>
                  <span>{lastUpdated}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="pill border-0 bg-[rgba(49,94,138,0.09)] text-[#315e8a]">
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </span>
              <span className="pill border-0 bg-[rgba(49,94,138,0.09)] text-[#315e8a]">
                {connectionLabel(connectionStatus)}
              </span>
              <button
                type="button"
                onClick={openAiPanel}
                className="button-secondary inline-flex h-11 items-center gap-3 rounded-full px-3 pr-5"
              >
                <AppLogo compact />
                <span>AI assistant</span>
              </button>
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

          <div className="soft-panel flex flex-wrap items-center gap-3 rounded-[1.6rem] px-4 py-3">
            <span className="pill border-0 bg-white text-slate-700">{wordCount} words</span>
            <span className="pill border-0 bg-white text-slate-700">{currentSelectionLength} selected</span>
            <span className="pill border-0 bg-white text-slate-700">
              {canUseAi(role) ? "AI available" : "AI disabled"}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr),340px] lg:px-8">
        <section className="min-w-0">
          <div className="space-y-4">
            {!canEdit(role) ? (
              <div className="notice notice-warn">
                {role === "commenter"
                  ? "Commenter mode is read-only for now. You can review the text and AI output."
                  : "Viewer mode is read-only. Editing and AI actions are intentionally disabled."}
              </div>
            ) : null}

            {remoteDraftNotice ? <div className="notice notice-info">{remoteDraftNotice}</div> : null}
            {saveMessage ? <div className="notice notice-success">{saveMessage}</div> : null}
            {sidebarMessage ? <div className="notice notice-success">{sidebarMessage}</div> : null}
            {sidebarError ? <div className="notice notice-error">{sidebarError}</div> : null}
            {error ? <div className="notice notice-error">{error}</div> : null}
          </div>

          <form onSubmit={handleSaveDocument} className="canvas-panel mt-4 rounded-[2rem] p-4 sm:p-6">
            <div className="mx-auto mb-3 flex w-full max-w-[880px] items-center justify-between px-3 text-xs uppercase tracking-[0.24em] text-slate-400">
              <span>Document editor</span>
              <span>{wordCount} words</span>
            </div>

            <div className="mx-auto w-full max-w-[860px] rounded-[0.35rem] bg-white px-10 py-12 shadow-[0_22px_48px_rgba(24,38,52,0.12)] sm:px-14 sm:py-16">
              <textarea
                ref={editorRef}
                value={content}
                onChange={handleContentChange}
                onSelect={(event) => syncSelection(event.currentTarget)}
                disabled={!canEdit(role)}
                rows={26}
                className="min-h-[68vh] w-full resize-none border-0 bg-transparent text-[1.06rem] leading-[2.08rem] text-slate-800 outline-none disabled:text-slate-700"
                placeholder="Start writing here. Select text to rewrite, summarize, translate, or restructure it from the AI panel."
              />
            </div>
          </form>
        </section>

        <aside className="space-y-5">
          <section className="surface-card rounded-[1.8rem] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-900">Session</p>
                <p className="mt-1 text-sm text-slate-500">Current role, connection state, and room presence</p>
              </div>
              <span className="pill border-0 bg-[rgba(49,94,138,0.08)] text-[#315e8a]">
                {connectionLabel(connectionStatus)}
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Connection</div>
                <div className="mt-1 text-sm font-medium text-slate-800">{connectionLabel(connectionStatus)}</div>
              </div>
              <div className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Presence</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{presence.length}</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Open the same document in another tab to see presence updates here.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[1.4rem] border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] p-4">
              <RolePicker value={role} onChange={setRole} label="Current role" />
            </div>

            <div className="mt-4 space-y-2">
              {presence.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center justify-between rounded-2xl border border-[rgba(27,36,48,0.08)] bg-white/78 px-3 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{person.label}</div>
                    <div className="text-xs text-slate-500">
                      {person.selectionFrom !== null && person.selectionTo !== null
                        ? `Selecting ${person.selectionFrom}-${person.selectionTo}`
                        : person.cursorFrom !== null
                          ? `Cursor at ${person.cursorFrom}`
                          : "Live in the room"}
                    </div>
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

          <section className="surface-card rounded-[1.8rem] p-5">
            <div>
              <p className="text-lg font-semibold text-slate-900">Versions</p>
              <p className="mt-1 text-sm text-slate-500">
                Save checkpoints and restore an earlier state when needed.
              </p>
            </div>

            {canCreateVersions(role) ? (
              <div className="mt-4 space-y-3">
                <input
                  value={versionLabel}
                  onChange={(event) => setVersionLabel(event.target.value)}
                  className="field"
                  placeholder="Checkpoint label"
                />
                <button
                  type="button"
                  onClick={() => void handleCreateVersion()}
                  disabled={sidebarBusy === "version:create"}
                  className="button-secondary h-11 w-full rounded-full"
                >
                  {sidebarBusy === "version:create" ? "Saving version..." : "Save version snapshot"}
                </button>
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="rounded-[1.4rem] border border-[rgba(27,36,48,0.08)] bg-[rgba(255,253,249,0.94)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {version.label || `Version ${version.id}`}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{formatTimestamp(version.created_at)}</p>
                    </div>
                    {canRevertVersions(role) ? (
                      <button
                        type="button"
                        onClick={() => void handleRevertVersion(version.id)}
                        disabled={sidebarBusy === `version:${version.id}`}
                        className="button-subtle rounded-full px-3 py-2 text-sm"
                      >
                        {sidebarBusy === `version:${version.id}` ? "Reverting..." : "Revert"}
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {getExcerpt(version.content, 120)}
                  </p>
                </div>
              ))}

              {versions.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">
                  No saved versions yet. Create one before large rewrites or reverts.
                </p>
              ) : null}
            </div>
          </section>

          <section className="surface-card rounded-[1.8rem] p-5">
            <div>
              <p className="text-lg font-semibold text-slate-900">AI history</p>
              <p className="mt-1 text-sm text-slate-500">
                Review the recent suggestions generated for this document.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {aiHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[1.4rem] border border-[rgba(27,36,48,0.08)] bg-[rgba(255,253,249,0.94)] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="pill border-0 bg-slate-100 text-slate-700">{entry.feature}</span>
                    <span className="text-xs text-slate-500">{formatTimestamp(entry.created_at)}</span>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-400">Prompt excerpt</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {getExcerpt(entry.prompt_excerpt, 110)}
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-400">Output</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    {getExcerpt(entry.response_text, 130)}
                  </p>
                </div>
              ))}

              {aiHistory.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">
                  No AI actions have been recorded for this document yet.
                </p>
              ) : null}
            </div>
          </section>

          {canManagePermissions(role) ? (
            <section className="surface-card rounded-[1.8rem] p-5">
              <div>
                <p className="text-lg font-semibold text-slate-900">Sharing</p>
                <p className="mt-1 text-sm text-slate-500">
                  Manage demo-user access levels for the local proof of concept.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="rounded-[1.4rem] border border-[rgba(27,36,48,0.08)] bg-[rgba(255,253,249,0.94)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{user.email}</p>
                      </div>
                      <span className="pill border-0 bg-slate-100 text-slate-700">
                        {user.id === 1
                          ? "owner"
                          : permissions.find((permission) => permission.user_id === user.id)?.role ?? "no access"}
                      </span>
                    </div>

                    {user.id === 1 ? (
                      <p className="mt-3 text-sm text-slate-500">The owner role is fixed for this document.</p>
                    ) : (
                      <div className="mt-3 flex items-center gap-3">
                        <select
                          value={shareDrafts[user.id] ?? "none"}
                          onChange={(event) =>
                            setShareDrafts((current) => ({
                              ...current,
                              [user.id]: event.target.value as ShareRoleDraft,
                            }))
                          }
                          className="field-select"
                        >
                          <option value="none">No access</option>
                          <option value="viewer">Viewer</option>
                          <option value="commenter">Commenter</option>
                          <option value="editor">Editor</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleSavePermission(user.id)}
                          disabled={sidebarBusy === `permission:${user.id}`}
                          className="button-secondary shrink-0 rounded-full px-4 py-2"
                        >
                          {sidebarBusy === `permission:${user.id}` ? "Saving..." : "Apply"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="surface-card rounded-[1.8rem] p-5">
            <div>
              <p className="text-lg font-semibold text-slate-900">Export</p>
              <p className="mt-1 text-sm text-slate-500">
                Download the current document in common local formats.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(["md", "txt", "json"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => void handleExport(format)}
                  disabled={exportingFormat === format}
                  className="button-secondary h-11 rounded-full px-4"
                >
                  {exportingFormat === format ? "Preparing..." : format.toUpperCase()}
                </button>
              ))}
            </div>
          </section>

        </aside>
      </div>

      {aiPanelOpen ? (
        <>
          <button
            type="button"
            aria-label="Close AI assistant"
            className="fixed inset-0 z-30 bg-[rgba(17,17,17,0.18)]"
            onClick={() => setAiPanelOpen(false)}
          />
          <section className="fixed inset-y-0 right-0 z-40 w-full max-w-[28rem] border-l border-[rgba(27,36,48,0.08)] bg-[rgba(255,253,249,0.98)] px-5 py-5 shadow-[-18px_0_42px_rgba(15,23,42,0.14)] backdrop-blur sm:px-6">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-[rgba(27,36,48,0.08)] pb-4">
                <div className="flex items-center gap-3">
                  <AppLogo compact />
                  <div>
                    <p className="text-lg font-semibold text-slate-900">AI assistant</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Select text, run a suggestion, then apply it if it fits.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAiPanelOpen(false)}
                  className="button-subtle h-10 w-10 rounded-full"
                  aria-label="Close AI assistant"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="rounded-[1.4rem] border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.62)] p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Selected text</div>
                  <p className="mt-2 text-[0.94rem] leading-6 text-slate-600">{selectedTextPreview}</p>
                </div>

                <div className="space-y-3">
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
                    {aiBusy
                      ? "Running..."
                      : `Run ${aiFeatures.find((item) => item.value === aiFeature)?.label}`}
                  </button>

                  {!canUseAi(role) ? (
                    <div className="notice notice-warn">
                      AI actions are available only for owner and editor roles in the frontend demo.
                    </div>
                  ) : null}

                  {aiError ? <div className="notice notice-error">{aiError}</div> : null}
                </div>

                <div className="rounded-[1.4rem] border border-[rgba(27,36,48,0.08)] bg-[rgba(255,253,249,0.94)] p-4">
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
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
