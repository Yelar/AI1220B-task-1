"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { ApiError, createDocument, deleteDocument, listDocuments } from "@/app/lib/api";
import type { DocumentRecord } from "@/app/lib/types";
import { formatTimestamp, getExcerpt } from "@/app/lib/ui";
import { useAuth } from "./auth-provider";
import AccountMenu from "./account-menu";

function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-[#111111] shadow-[0_10px_20px_rgba(15,23,42,0.16)] ${
        compact ? "h-10 w-10" : "h-11 w-11"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`${compact ? "h-5 w-5" : "h-6 w-6"} fill-white`}
      >
        <path d="M12 5.5 18.2 16H5.8L12 5.5Z" />
      </svg>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="m16.5 16.5 4 4M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M9 4.5h6m-8 3h10m-8.8 0 .55 9.1a1 1 0 0 0 1 .94h4.5a1 1 0 0 0 1-.94l.55-9.1M10 10.5v4.5m4-4.5v4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function previewLines(content: string) {
  return getExcerpt(content, 135)
    .split(" ")
    .reduce<string[]>((lines, word) => {
      const current = lines.at(-1) ?? "";
      if (!current || current.length + word.length + 1 <= 24) {
        if (lines.length === 0) {
          return [word];
        }
        return [...lines.slice(0, -1), `${current} ${word}`.trim()];
      }

      if (lines.length >= 4) {
        return lines;
      }

      return [...lines, word];
    }, [])
    .slice(0, 4);
}

export default function DocumentDashboard() {
  const router = useRouter();
  const { logout, session } = useAuth();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      setDocuments(await listDocuments());
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to load documents.";
      setError(message);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const filteredDocuments = documents.filter((document) => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return (
      document.title.toLowerCase().includes(query) ||
      document.content.toLowerCase().includes(query)
    );
  });

  async function handleCreateDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Add a document title before creating it.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const document = await createDocument({
        title: title.trim(),
        content,
        save_initial_version: false,
      });

      setDocuments((current) => [document, ...current]);
      setTitle("");
      setContent("");
      startTransition(() => {
        router.push(`/documents/${document.id}`);
      });
    } catch (requestError) {
      const message =
        requestError instanceof ApiError
          ? requestError.message
          : "Failed to create the document.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteDocument(document: DocumentRecord) {
    const confirmed = window.confirm(`Delete "${document.title}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeletingId(document.id);
    setError(null);

    try {
      await deleteDocument(document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to delete the document.";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="app-shell min-h-screen flex-1">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <header className="surface-card flex flex-col gap-4 rounded-[1.75rem] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4">
                <AppLogo />
                <div>
                  <div className="text-[2rem] font-semibold tracking-tight text-slate-900">
                    Document workspace
                  </div>
                  <div className="text-sm text-slate-500">Create, open, and manage your documents.</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:min-w-[48rem] lg:flex-row lg:items-center lg:justify-end">
              <label className="field flex h-14 flex-1 items-center rounded-full border-0 bg-[#f2efe8] px-5 shadow-none focus-within:bg-white">
                <span className="pointer-events-none shrink-0 text-slate-500">
                  <SearchIcon />
                </span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search recent documents"
                  className="h-full flex-1 bg-transparent pl-4 pr-1 text-base text-slate-700 outline-none placeholder:text-slate-400"
                />
              </label>
              {session?.user ? <AccountMenu user={session.user} onLogout={() => logout()} /> : null}
            </div>
          </div>
        </header>

        <section className="surface-card rounded-[2rem] p-6">
          <div className="space-y-2">
            <p className="section-label">Create document</p>
            <h1 className="text-[2rem] font-semibold tracking-tight text-slate-900">
              Start a new draft
            </h1>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleCreateDocument}>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled document"
              className="field"
            />

            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Start with a note, paragraph, or meeting summary."
              rows={10}
              className="field-area min-h-[16rem]"
            />

            <button
              type="submit"
              disabled={submitting}
              className="button-primary h-12 w-full rounded-full"
            >
              {submitting ? "Creating..." : "Create and open"}
            </button>
          </form>

          {error ? <div className="notice notice-error mt-5">{error}</div> : null}
        </section>

        <section className="surface-card rounded-[2rem] px-5 py-6 sm:px-7">
          <div className="flex flex-col gap-4 border-b border-[rgba(27,36,48,0.08)] pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[2rem] font-semibold tracking-tight text-slate-900">
                Recent documents
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {loading
                  ? "Loading documents."
                  : `${filteredDocuments.length} document${filteredDocuments.length === 1 ? "" : "s"} visible`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="button-secondary inline-flex h-11 items-center gap-2 rounded-full px-4 text-slate-700"
            >
              <GridIcon />
              Refresh
            </button>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {loading ? (
              <div className="notice notice-info col-span-full">
                Loading documents...
              </div>
            ) : null}

            {!loading && filteredDocuments.length === 0 ? (
              <div className="notice notice-info col-span-full">
                {documents.length === 0
                  ? "No documents exist yet. Create the first one from the draft panel."
                  : "No documents match the current search."}
              </div>
            ) : null}

            {filteredDocuments.map((document) => {
              const lines = previewLines(document.content);

              return (
                <article
                  key={document.id}
                  className="group overflow-hidden rounded-[1.5rem] border border-[rgba(27,36,48,0.08)] bg-[rgba(255,253,249,0.92)] transition hover:-translate-y-1 hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)]"
                >
                  <Link href={`/documents/${document.id}`} className="block">
                    <div className="bg-[rgba(244,241,234,0.72)] px-5 py-5">
                      <div className="mx-auto flex h-[18.4rem] w-full max-w-[14rem] flex-col rounded-lg border border-[rgba(27,36,48,0.08)] bg-white px-4 py-4 shadow-[0_12px_22px_rgba(15,23,42,0.05)]">
                        <div className="h-2.5 w-3/4 rounded-full bg-[#22384d]" />
                        <div className="mt-4 space-y-2">
                          {(lines.length === 0 ? ["No content yet."] : lines).map((line, index) => (
                            <div
                              key={`${document.id}-${index}`}
                              className="h-1.5 rounded-full bg-slate-200"
                              style={{ width: `${Math.min(94, Math.max(32, line.length * 2.4))}%` }}
                            />
                          ))}
                          <div className="h-1.5 w-4/6 rounded-full bg-slate-200" />
                        </div>
                      </div>
                    </div>
                  </Link>

                  <div className="px-5 py-4">
                    <Link href={`/documents/${document.id}`} className="block">
                      <div className="flex items-start justify-between gap-4">
                        <div className="line-clamp-1 text-[1.3rem] font-semibold tracking-tight text-slate-900">
                          {document.title}
                        </div>
                        <span className="shrink-0 pt-1 text-[0.76rem] font-medium text-slate-400">
                          {formatTimestamp(document.updated_at)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[0.94rem] leading-6 text-slate-600">
                        {getExcerpt(document.content, 100)}
                      </p>
                    </Link>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-500">
                      <div className="flex items-center gap-2">
                        <AppLogo compact />
                        <span>#{document.id}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void handleDeleteDocument(document)}
                          disabled={deletingId === document.id}
                          className="button-secondary h-9 rounded-full px-3 text-[#9f3d2b] hover:bg-[rgba(159,61,43,0.06)]"
                        >
                          <TrashIcon />
                          <span className="ml-1">{deletingId === document.id ? "Deleting..." : "Delete"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
