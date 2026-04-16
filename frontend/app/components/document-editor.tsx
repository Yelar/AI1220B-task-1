"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";

import { getDocument, updateDocument } from "@/app/lib/api";
import { formatTimestamp, stripHtml } from "@/app/lib/ui";
import { canEdit, type DocumentRecord, type UserRole } from "@/app/lib/types";
import { useAuth } from "./auth-provider";
import RichTextEditor, { type RichTextEditorHandle } from "./rich-text-editor";

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

function roleLabel(role: UserRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function DocumentEditor({ documentId }: { documentId: number }) {
  const { session, logout } = useAuth();
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [plainTextSnapshot, setPlainTextSnapshot] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>("Autosave ready.");
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dirty, setDirty] = useState(false);

  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const role: UserRole = session?.user.role ?? "owner";

  useEffect(() => {
    if (!Number.isFinite(documentId) || documentId <= 0) {
      setError("Invalid document id.");
      setLoading(false);
      return;
    }

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const currentDocument = await getDocument(documentId);
        setDocument(currentDocument);
        setTitle(currentDocument.title);
        setContent(currentDocument.content);
        setPlainTextSnapshot(stripHtml(currentDocument.content));
        setDirty(false);
        setSavingState("saved");
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

  async function handleSaveDocument(event?: FormEvent) {
    event?.preventDefault();
    if (!document || !canEdit(role)) {
      return;
    }

    setSavingState("saving");
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
      setSavingState("saved");
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
    if (!dirty || !document || !canEdit(role)) {
      return;
    }

    const timer = setTimeout(() => {
      triggerAutoSave();
    }, 1400);

    return () => clearTimeout(timer);
  }, [content, dirty, document, role, title]);

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
              <span className="pill border-0 bg-[rgba(27,36,48,0.06)] text-slate-700">{session?.user.email}</span>
              <span className="pill border-0 bg-[rgba(49,94,138,0.09)] text-[#315e8a]">{roleLabel(role)}</span>
              <button
                type="button"
                onClick={() => void handleSaveDocument()}
                disabled={!canEdit(role) || savingState === "saving" || !dirty}
                className="button-primary h-11 rounded-full px-5"
              >
                {savingState === "saving" ? "Saving..." : dirty ? "Save" : "Saved"}
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="button-secondary h-11 rounded-full px-5"
              >
                Log out
              </button>
            </div>
          </div>

          <div className="soft-panel flex flex-wrap items-center gap-3 rounded-[1.6rem] px-4 py-3">
            <span className="pill border-0 bg-white text-slate-700">{wordCount} words</span>
            <span className="pill border-0 bg-white text-slate-700">
              {canEdit(role) ? "Editable" : "Read only"}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr),320px] lg:px-8">
        <section className="min-w-0">
          <div className="space-y-4">
            {!canEdit(role) ? <div className="notice notice-warn">Viewer mode is read-only.</div> : null}
            {saveMessage ? <div className="notice notice-success">{saveMessage}</div> : null}
            {error ? <div className="notice notice-error">{error}</div> : null}
          </div>

          <form onSubmit={handleSaveDocument} className="canvas-panel mt-4 rounded-[2rem] p-4 sm:p-6">
            <div className="mx-auto mb-3 flex w-full max-w-[880px] items-center justify-between px-3 text-xs uppercase tracking-[0.24em] text-slate-400">
              <span>Document editor</span>
              <span>{wordCount} words</span>
            </div>

            <div className="mx-auto w-full max-w-[860px] rounded-[0.35rem] bg-white px-10 py-12 shadow-[0_22px_48px_rgba(24,38,52,0.12)] sm:px-14 sm:py-16">
              <RichTextEditor
                ref={editorRef}
                value={content}
                onChange={handleContentChange}
                disabled={!canEdit(role)}
                onSelectionChange={({ plainText }) => {
                  setPlainTextSnapshot(plainText);
                }}
                placeholder="Start writing here."
              />
            </div>
          </form>
        </section>

        <aside className="space-y-5">
          <section className="surface-card rounded-[1.8rem] p-5">
            <p className="text-lg font-semibold text-slate-900">Document details</p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Account</div>
                <div className="mt-1 text-sm font-medium text-slate-800">{session?.user.email}</div>
              </div>
              <div className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Role</div>
                <div className="mt-1 text-sm font-medium text-slate-800">{roleLabel(role)}</div>
              </div>
              <div className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Last updated</div>
                <div className="mt-1 text-sm font-medium text-slate-800">{lastUpdated}</div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
