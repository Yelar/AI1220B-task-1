"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";

import {
  getDocument,
  invokeAi,
  listAiHistory,
  listVersions,
  updateDocument,
} from "@/app/lib/api";
import {
  ensureDocumentAccess,
  getDocumentRole,
  listDocumentShares,
  removeDocumentShare,
  setDocumentShare,
} from "@/app/lib/document-access";
import { listKnownAuthUsers } from "@/app/lib/auth";
import { formatTimestamp, stripHtml } from "@/app/lib/ui";
import {
  canCreateVersions,
  canEdit,
  canManageSharing,
  canRestoreVersions,
  canUseAi,
  type AIInteraction,
  type AIFeature,
  type DocumentRecord,
  type DocumentShare,
  type DocumentVersion,
  type UserRole,
} from "@/app/lib/types";
import { useAuth } from "./auth-provider";
import AccountMenu from "./account-menu";
import RichTextEditor, {
  toolbarCommands,
  type RichTextEditorHandle,
  type ToolbarCommand,
} from "./rich-text-editor";

type AiState = "idle" | "loading" | "revealing" | "ready" | "cancelled" | "error";

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

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <circle cx="6.2" cy="12.2" r="2.85" fill="currentColor" />
      <circle cx="17.35" cy="5.85" r="2.85" fill="currentColor" />
      <circle cx="17.35" cy="18.15" r="2.85" fill="currentColor" />
      <path
        d="M8.55 10.9 14.85 7.3M8.55 13.5l6.3 3.55"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.8"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="m7 7 10 10M17 7 7 17"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function VersionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M8 3.6h6.9l4 4V19a1.9 1.9 0 0 1-1.9 1.9H8A1.9 1.9 0 0 1 6.1 19V5.5A1.9 1.9 0 0 1 8 3.6Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M14.9 3.9v3.5a1 1 0 0 0 1 1h3.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <circle
        cx="8.25"
        cy="15.55"
        r="3.35"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8.25 13.95v1.95l1.45.88"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M12.9 11.9h2.9M12.9 14.8h2.9M12.9 17.7h2.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function roleLabel(role: UserRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function createVersionLabel() {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
}

export default function DocumentEditor({ documentId }: { documentId: number }) {
  const { session, logout } = useAuth();
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [plainTextSnapshot, setPlainTextSnapshot] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>("Autosave ready.");
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dirty, setDirty] = useState(false);
  const [documentRole, setDocumentRole] = useState<UserRole>("owner");
  const [shares, setShares] = useState<DocumentShare[]>([]);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<Exclude<UserRole, "owner">>("viewer");
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionLabel, setVersionLabel] = useState("");
  const [versionActionId, setVersionActionId] = useState<number | "create" | null>(null);
  const [versionFeedback, setVersionFeedback] = useState<string | null>(null);
  const [showVersionsPanel, setShowVersionsPanel] = useState(false);
  const [aiFeature, setAiFeature] = useState<AIFeature>("rewrite");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [aiState, setAiState] = useState<AiState>("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSourceText, setAiSourceText] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [aiHistory, setAiHistory] = useState<AIInteraction[]>([]);
  const [aiHistoryLoading, setAiHistoryLoading] = useState(false);
  const [lastAppliedSnapshot, setLastAppliedSnapshot] = useState<string | null>(null);
  const [showSharingPanel, setShowSharingPanel] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const revealRunRef = useRef(0);

  const currentUserEmail = session?.user.email ?? "";
  const knownUsers = listKnownAuthUsers();

  function clearRevealTimer() {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }

  function startReveal(text: string) {
    revealRunRef.current += 1;
    const runId = revealRunRef.current;
    clearRevealTimer();
    setAiDraft("");
    setAiState("revealing");

    let index = 0;
    const chunkSize = Math.max(4, Math.ceil(text.length / 36));

    const step = () => {
      if (runId !== revealRunRef.current) {
        return;
      }

      index = Math.min(text.length, index + chunkSize);
      setAiDraft(text.slice(0, index));

      if (index >= text.length) {
        setAiState("ready");
        return;
      }

      revealTimerRef.current = window.setTimeout(step, 28);
    };

    step();
  }

  async function loadVersionsForDocument(currentDocumentId: number) {
    setVersionsLoading(true);
    try {
      setVersions(await listVersions(currentDocumentId));
    } finally {
      setVersionsLoading(false);
    }
  }

  async function loadAiHistoryForDocument(currentDocumentId: number) {
    setAiHistoryLoading(true);
    try {
      const history = await listAiHistory();
      setAiHistory(history.filter((entry) => entry.document_id === currentDocumentId));
    } finally {
      setAiHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(documentId) || documentId <= 0 || !currentUserEmail) {
      setError("Invalid document id.");
      setLoading(false);
      return;
    }

    let active = true;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const currentDocument = await getDocument(documentId);
        ensureDocumentAccess(currentDocument.id, currentUserEmail);
        const nextRole = getDocumentRole(currentDocument.id, currentUserEmail, currentUserEmail);

        if (!nextRole) {
          throw new Error("You do not have access to this document.");
        }

        if (!active) {
          return;
        }

        setDocument(currentDocument);
        setDocumentRole(nextRole);
        setShares(listDocumentShares(currentDocument.id, currentUserEmail));
        setTitle(currentDocument.title);
        setContent(currentDocument.content);
        setPlainTextSnapshot(stripHtml(currentDocument.content));
        setDirty(false);
        setSavingState("saved");

        await Promise.all([
          loadVersionsForDocument(currentDocument.id),
          loadAiHistoryForDocument(currentDocument.id),
        ]);
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : "Failed to load document.";
        if (active) {
          setError(message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
      abortControllerRef.current?.abort();
      clearRevealTimer();
    };
  }, [currentUserEmail, documentId]);

  useEffect(() => {
    setPlainTextSnapshot(stripHtml(content));
  }, [content]);

  function handleTitleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setTitle(event.target.value);
    setDirty(true);
    setSaveMessage(null);
    setSavingState("idle");
  }

  function handleContentChange(nextValue: string) {
    setContent(nextValue);
    setDirty(true);
    setSaveMessage(null);
    setSavingState("idle");
  }

  async function persistDocument(
    payload: {
      title?: string;
      content?: string;
      create_version?: boolean;
      version_label?: string;
    } = {},
  ) {
    if (!document || !canEdit(documentRole)) {
      return null;
    }

    const savedDocument = await updateDocument(document.id, {
      title,
      content,
      ...payload,
    });

    setDocument(savedDocument);
    setTitle(savedDocument.title);
    setContent(savedDocument.content);
    setDirty(false);
    setSaveMessage(`Saved at ${formatTimestamp(savedDocument.updated_at)}.`);
    setSavingState("saved");
    return savedDocument;
  }

  async function handleSaveDocument(event?: FormEvent) {
    event?.preventDefault();
    if (!document || !canEdit(documentRole)) {
      return;
    }

    setSavingState("saving");
    setError(null);

    try {
      await persistDocument();
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to save document.";
      setError(message);
      setSavingState("error");
    }
  }

  const triggerAutoSave = useEffectEvent(() => {
    void handleSaveDocument();
  });

  useEffect(() => {
    if (!dirty || !document || !canEdit(documentRole)) {
      return;
    }

    const timer = setTimeout(() => {
      triggerAutoSave();
    }, 1400);

    return () => clearTimeout(timer);
  }, [content, dirty, document, documentRole, title]);

  async function handleSaveVersion() {
    if (!document || !canCreateVersions(documentRole)) {
      return;
    }

    setVersionActionId("create");
    setVersionFeedback(null);
    setError(null);

    try {
      await persistDocument({
        create_version: true,
        version_label: versionLabel.trim() || `Snapshot ${createVersionLabel()}`,
      });
      await loadVersionsForDocument(document.id);
      setVersionLabel("");
      setVersionFeedback("Version saved.");
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to save version.";
      setError(message);
    } finally {
      setVersionActionId(null);
    }
  }

  async function handleRestoreVersion(version: DocumentVersion) {
    if (!document || !canRestoreVersions(documentRole)) {
      return;
    }

    setVersionActionId(version.id);
    setVersionFeedback(null);
    setError(null);

    try {
      const savedDocument = await updateDocument(document.id, {
        title,
        content: version.content,
        create_version: true,
        version_label: `Restored from ${version.label ?? formatTimestamp(version.created_at)}`,
      });
      setDocument(savedDocument);
      setContent(savedDocument.content);
      setPlainTextSnapshot(stripHtml(savedDocument.content));
      setDirty(false);
      setSavingState("saved");
      setSaveMessage(`Restored ${version.label ?? formatTimestamp(version.created_at)}.`);
      await loadVersionsForDocument(document.id);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to restore version.";
      setError(message);
    } finally {
      setVersionActionId(null);
    }
  }

  function handleShareDocument(event: FormEvent) {
    event.preventDefault();
    if (!document || !canManageSharing(documentRole)) {
      return;
    }

    const nextEmail = shareEmail.trim().toLowerCase();
    if (!nextEmail) {
      setShareError("Enter an email address.");
      return;
    }

    if (nextEmail === currentUserEmail) {
      setShareError("The owner already has access.");
      return;
    }

    const nextShares = setDocumentShare(document.id, currentUserEmail, nextEmail, shareRole);
    setShares(nextShares);
    setShareEmail("");
    setShareFeedback(`Shared with ${nextEmail} as ${shareRole}.`);
    setShareError(null);
  }

  function handleRemoveShare(email: string) {
    if (!document || !canManageSharing(documentRole)) {
      return;
    }

    const nextShares = removeDocumentShare(document.id, currentUserEmail, email);
    setShares(nextShares);
  }

  async function handleGenerateAi() {
    if (!document || !canUseAi(documentRole)) {
      return;
    }

    const source = selectedText.trim();
    if (!source) {
      setAiError("Select text in the editor before using AI.");
      return;
    }

    clearRevealTimer();
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAiError(null);
    setAiSourceText(source);
    setAiDraft("");
    setAiState("loading");

    try {
      const response = await invokeAi(
        {
          feature: aiFeature,
          selected_text: source,
          surrounding_context: plainTextSnapshot.slice(0, 1200),
          target_language: aiFeature === "translate" ? targetLanguage.trim() || undefined : undefined,
          document_id: document.id,
        },
        { signal: controller.signal },
      );

      startReveal(response.output_text);
      await loadAiHistoryForDocument(document.id);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        setAiState("cancelled");
        return;
      }

      const message =
        requestError instanceof Error ? requestError.message : "Failed to generate suggestion.";
      setAiError(message);
      setAiState("error");
    } finally {
      abortControllerRef.current = null;
    }
  }

  function handleCancelAi() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    revealRunRef.current += 1;
    clearRevealTimer();
    setAiState("cancelled");
  }

  function handleRejectAi() {
    revealRunRef.current += 1;
    clearRevealTimer();
    setAiDraft("");
    setAiSourceText("");
    setAiState("idle");
    setAiError(null);
  }

  function handleApplyAi() {
    if (!aiDraft.trim()) {
      return;
    }

    setLastAppliedSnapshot(content);
    editorRef.current?.replaceSelection(aiDraft);
    setDirty(true);
    setSaveMessage(null);
    setAiState("ready");
  }

  function handleUndoAiApply() {
    if (!lastAppliedSnapshot) {
      return;
    }

    setContent(lastAppliedSnapshot);
    setDirty(true);
    setSaveMessage("Last AI apply reverted.");
    setLastAppliedSnapshot(null);
  }

  function handleToolbarCommand(action: ToolbarCommand) {
    editorRef.current?.runCommand(action);
  }

  const wordCount = plainTextSnapshot.trim() ? plainTextSnapshot.trim().split(/\s+/).length : 0;
  const lastUpdated = document ? formatTimestamp(document.updated_at) : "Unavailable";
  const saveStateLabel =
    savingState === "saving"
      ? "Saving..."
      : dirty
        ? "Unsaved changes"
        : savingState === "saved"
          ? "All changes saved"
          : "Ready";

  if (loading) {
    return (
      <main className="app-shell min-h-screen flex-1 px-4 py-8 sm:px-6">
        <div className="surface-card mx-auto w-full max-w-5xl rounded-[2rem] px-6 py-12 text-center text-sm text-slate-600">
          Loading document...
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
                  disabled={!canEdit(documentRole)}
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
              <button
                type="button"
                onClick={() => setShowVersionsPanel((current) => !current)}
                aria-label="Open versions"
                className={`icon-action h-11 w-11 ${showVersionsPanel ? "is-open" : ""}`}
              >
                <VersionIcon />
              </button>
              <span className="pill border-0 bg-[rgba(49,94,138,0.09)] text-[#315e8a]">{roleLabel(documentRole)}</span>
              <button
                type="button"
                onClick={() => void handleSaveDocument()}
                disabled={!canEdit(documentRole) || savingState === "saving" || !dirty}
                className="button-primary h-11 rounded-full px-5"
              >
                {savingState === "saving" ? "Saving..." : dirty ? "Save" : "Saved"}
              </button>
              {session?.user ? <AccountMenu user={session.user} onLogout={() => logout()} /> : null}
            </div>
          </div>

          <div className="soft-panel flex flex-wrap items-center gap-2 rounded-[1.25rem] px-3 py-2">
            <span className="pill border-0 bg-white px-3 py-1.5 text-[0.76rem] text-slate-700">{wordCount} words</span>
            <span className="pill border-0 bg-white px-3 py-1.5 text-[0.76rem] text-slate-700">{selectedText ? "Text selected" : "No selection"}</span>
            <span className="pill border-0 bg-white px-3 py-1.5 text-[0.76rem] text-slate-700">
              {canEdit(documentRole) ? "Editable" : "Read only"}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr),240px] lg:px-8">
        <section className="min-w-0">
          <div className="space-y-4">
            {!canEdit(documentRole) ? <div className="notice notice-warn">Viewer mode is read-only.</div> : null}
            {saveMessage ? <div className="notice notice-success">{saveMessage}</div> : null}
            {error ? <div className="notice notice-error">{error}</div> : null}
          </div>

          <form onSubmit={handleSaveDocument} className="canvas-panel mt-4 rounded-[2rem] p-4 sm:p-6">
            <div className="mx-auto mb-4 flex w-full max-w-[980px] items-center justify-between gap-4 rounded-[1.35rem] border border-[rgba(27,36,48,0.08)] bg-[rgba(255,253,249,0.9)] px-4 py-3 shadow-[0_10px_28px_rgba(24,38,52,0.06)]">
              <div className="editor-toolbar editor-toolbar-shell">
                {toolbarCommands.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={!canEdit(documentRole)}
                    className="editor-tool"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleToolbarCommand(item.action)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSharingPanel((current) => !current)}
                  aria-label="Open sharing"
                  className={`icon-action h-10 w-10 ${showSharingPanel ? "is-open" : ""}`}
                >
                  <ShareIcon />
                </button>
                <button
                  type="button"
                  onClick={() => setShowAiPanel((current) => !current)}
                  aria-label="Open AI assistant"
                  className={`ai-trigger ${showAiPanel ? "is-open" : ""}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                    <path d="M12 5.5 18.2 16H5.8L12 5.5Z" fill="currentColor" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mx-auto mb-3 flex w-full max-w-[880px] items-center justify-between px-3 text-xs uppercase tracking-[0.24em] text-slate-400">
              <span>Document editor</span>
              <span>{wordCount} words</span>
            </div>

            <div className="mx-auto w-full max-w-[860px] rounded-[0.35rem] bg-white px-10 py-12 shadow-[0_22px_48px_rgba(24,38,52,0.12)] sm:px-14 sm:py-16">
              <RichTextEditor
                ref={editorRef}
                value={content}
                onChange={handleContentChange}
                disabled={!canEdit(documentRole)}
                showToolbar={false}
                onSelectionChange={({ plainText, selectedText: nextSelectedText }) => {
                  setPlainTextSnapshot(plainText);
                  setSelectedText(nextSelectedText);
                }}
                placeholder="Start writing here."
              />
            </div>
          </form>
        </section>

        <aside className="space-y-5">
          <section className="surface-card rounded-[1.8rem] p-4">
            <div className="grid grid-cols-1 gap-2">
              <div className="rounded-[1.1rem] border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-3 py-2.5">
                <div className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-400">Autosave</div>
                <div className="mt-1 text-sm font-medium text-slate-800">{saveStateLabel}</div>
              </div>
              <div className="rounded-[1.1rem] border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-3 py-2.5">
                <div className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-400">Role</div>
                <div className="mt-1 text-sm font-medium text-slate-800">{roleLabel(documentRole)}</div>
              </div>
              <div className="rounded-[1.1rem] border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-3 py-2.5">
                <div className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-400">Updated</div>
                <div className="mt-1 text-sm font-medium text-slate-800">{lastUpdated}</div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {(showSharingPanel || showVersionsPanel || showAiPanel) ? (
        <div className="pointer-events-none fixed inset-0 z-30">
          <div
            className="pointer-events-auto absolute inset-0 bg-[rgba(17,17,17,0.14)]"
            onClick={() => {
              setShowSharingPanel(false);
              setShowVersionsPanel(false);
              setShowAiPanel(false);
            }}
          />
          <div className="pointer-events-auto absolute right-4 top-24 h-[calc(100vh-7rem)] w-[min(420px,calc(100vw-2rem))] overflow-y-auto rounded-[1.8rem] bg-[rgba(255,253,249,0.98)] p-5 shadow-[0_20px_48px_rgba(15,23,42,0.18)]">
            {showSharingPanel ? (
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">Sharing</p>
                    <p className="mt-1 text-sm text-slate-500">Manage document access.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSharingPanel(false)}
                    className="button-secondary h-10 w-10 rounded-full px-0"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Owner</div>
                    <div className="mt-1 text-sm font-medium text-slate-800">{currentUserEmail}</div>
                  </div>

                  {shares.map((share) => (
                    <div
                      key={share.email}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-800">{share.email}</div>
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{share.role}</div>
                      </div>
                      {canManageSharing(documentRole) ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveShare(share.email)}
                          className="button-secondary h-9 rounded-full px-3 text-sm"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                {canManageSharing(documentRole) ? (
                  <form onSubmit={handleShareDocument} className="space-y-3">
                    <input
                      list="known-users"
                      value={shareEmail}
                      onChange={(event) => setShareEmail(event.target.value)}
                      placeholder="Share by email"
                      className="field"
                    />
                    <datalist id="known-users">
                      {knownUsers.map((user) => (
                        <option key={user.id} value={user.email}>
                          {user.name}
                        </option>
                      ))}
                    </datalist>
                    <select
                      value={shareRole}
                      onChange={(event) => setShareRole(event.target.value as Exclude<UserRole, "owner">)}
                      className="field-select"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button type="submit" className="button-secondary h-11 w-full rounded-full">
                      Share document
                    </button>
                  </form>
                ) : null}

                {shareFeedback ? <div className="notice notice-success">{shareFeedback}</div> : null}
                {shareError ? <div className="notice notice-error">{shareError}</div> : null}
              </section>
            ) : null}

            {showVersionsPanel ? (
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">Version history</p>
                    <p className="mt-1 text-sm text-slate-500">Save and restore snapshots.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowVersionsPanel(false)}
                    className="button-secondary h-10 w-10 rounded-full px-0"
                  >
                    <CloseIcon />
                  </button>
                </div>

                {canCreateVersions(documentRole) ? (
                  <div className="space-y-3">
                    <input
                      value={versionLabel}
                      onChange={(event) => setVersionLabel(event.target.value)}
                      placeholder="Optional version label"
                      className="field"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveVersion()}
                      disabled={versionActionId !== null}
                      className="button-secondary h-11 w-full rounded-full"
                    >
                      {versionActionId === "create" ? "Saving..." : "Save version"}
                    </button>
                  </div>
                ) : null}

                {versionFeedback ? <div className="notice notice-success">{versionFeedback}</div> : null}

                <div className="space-y-3">
                  {versionsLoading ? (
                    <div className="notice notice-info">Loading version history...</div>
                  ) : versions.length === 0 ? (
                    <div className="notice notice-info">No saved versions yet.</div>
                  ) : (
                    versions.map((version) => (
                      <div
                        key={version.id}
                        className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-slate-800">
                              {version.label ?? `Snapshot ${version.id}`}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{formatTimestamp(version.created_at)}</div>
                          </div>
                          {canRestoreVersions(documentRole) ? (
                            <button
                              type="button"
                              onClick={() => void handleRestoreVersion(version)}
                              disabled={versionActionId === version.id}
                              className="button-secondary h-9 rounded-full px-3 text-sm"
                            >
                              {versionActionId === version.id ? "Restoring..." : "Restore"}
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          {stripHtml(version.content).trim().slice(0, 120) || "Empty version."}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            {showAiPanel ? (
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">AI assistant</p>
                    <p className="mt-1 text-sm text-slate-500">Generate and review suggestions.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(aiState === "loading" || aiState === "revealing") ? (
                      <button
                        type="button"
                        onClick={handleCancelAi}
                        className="button-secondary h-10 rounded-full px-4 text-sm"
                      >
                        Cancel
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setShowAiPanel(false)}
                      className="button-secondary h-10 w-10 rounded-full px-0"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {aiFeatures.map((feature) => (
                    <button
                      key={feature.value}
                      type="button"
                      onClick={() => setAiFeature(feature.value)}
                      className={`button-secondary h-10 rounded-full px-3 text-sm ${
                        aiFeature === feature.value ? "border-[rgba(49,94,138,0.26)] bg-[rgba(49,94,138,0.08)] text-[#315e8a]" : ""
                      }`}
                    >
                      {feature.label}
                    </button>
                  ))}
                </div>

                {aiFeature === "translate" ? (
                  <input
                    value={targetLanguage}
                    onChange={(event) => setTargetLanguage(event.target.value)}
                    placeholder="Target language"
                    className="field"
                  />
                ) : null}

                <button
                  type="button"
                  onClick={() => void handleGenerateAi()}
                  disabled={!canUseAi(documentRole) || aiState === "loading" || aiState === "revealing"}
                  className="button-primary h-11 w-full rounded-full"
                >
                  {aiState === "loading" || aiState === "revealing" ? "Generating..." : "Generate suggestion"}
                </button>

                <div className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Selected text</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {selectedText.trim() || "Select text in the editor to use AI."}
                  </p>
                </div>

                {aiError ? <div className="notice notice-error">{aiError}</div> : null}

                <div className="space-y-3">
                  <div className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Original</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {aiSourceText || "No source text selected yet."}
                    </p>
                  </div>

                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-400">Suggestion</div>
                    <textarea
                      value={aiDraft}
                      onChange={(event) => setAiDraft(event.target.value)}
                      placeholder="AI suggestions will appear here."
                      rows={8}
                      className="field-area min-h-[12rem]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleApplyAi}
                    disabled={!aiDraft.trim()}
                    className="button-primary h-10 rounded-full px-4"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectAi}
                    disabled={!aiDraft.trim() && !aiSourceText}
                    className="button-secondary h-10 rounded-full px-4"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={handleUndoAiApply}
                    disabled={!lastAppliedSnapshot}
                    className="button-secondary h-10 rounded-full px-4"
                  >
                    Undo apply
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">Recent suggestions</p>
                    {aiHistoryLoading ? <span className="text-xs text-slate-500">Loading...</span> : null}
                  </div>
                  {aiHistory.length === 0 ? (
                    <div className="notice notice-info">No AI history for this document yet.</div>
                  ) : (
                    aiHistory.slice(0, 4).map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-800">{entry.feature}</div>
                          <div className="text-xs text-slate-500">{formatTimestamp(entry.created_at)}</div>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {entry.response_text.slice(0, 120)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
