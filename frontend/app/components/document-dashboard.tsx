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

import { ApiError, createDocument, getHealth, listDocuments } from "@/app/lib/api";
import { formatTimestamp, getExcerpt, readStoredRole, writeStoredRole } from "@/app/lib/ui";
import {
  canUseAi,
  type DocumentRecord,
  type HealthResponse,
  type UserRole,
} from "@/app/lib/types";
import RolePicker from "./role-picker";

function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-2xl border border-black/8 bg-white shadow-[0_10px_20px_rgba(15,23,42,0.08)] ${
        compact ? "h-10 w-10" : "h-11 w-11"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`${compact ? "h-5 w-5" : "h-6 w-6"} fill-black`}
      >
        <path d="M6 2h8l4 4v16H6V2Zm8 1.8V7h3.2L14 3.8ZM8.5 10h7v1.4h-7V10Zm0 3.3h7v1.4h-7v-1.4Zm0 3.3h5v1.4h-5v-1.4Z" />
      </svg>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
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
  const [role, setRole] = useState<UserRole>("owner");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const savedRole = readStoredRole();
    if (savedRole) {
      setRole(savedRole);
    }
  }, []);

  useEffect(() => {
    writeStoredRole(role);
  }, [role]);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    const [documentsResult, healthResult] = await Promise.allSettled([
      listDocuments(),
      getHealth(),
    ]);

    if (documentsResult.status === "fulfilled") {
      setDocuments(documentsResult.value);
    } else {
      const message =
        documentsResult.reason instanceof Error
          ? documentsResult.reason.message
          : "Failed to load documents.";
      setError(message);
    }

    if (healthResult.status === "fulfilled") {
      setHealth(healthResult.value);
    } else if (documentsResult.status !== "rejected") {
      setError("Backend health check failed. Confirm the FastAPI server is running.");
    }

    setLoading(false);
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

  return (
    <main className="app-shell min-h-screen flex-1 bg-[#f6f7fb]">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-[1.75rem] bg-white px-4 py-4 shadow-[0_8px_28px_rgba(15,23,42,0.06)] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                aria-label="Workspace menu"
              >
                <MenuIcon />
              </button>
              <div className="flex items-center gap-4">
                <AppLogo />
                <div>
                  <div className="text-[2rem] font-semibold tracking-tight text-slate-900">
                    Atlas Docs
                  </div>
                  <div className="text-sm text-slate-500">
                    Create, open, edit, and review collaborative drafts
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:min-w-[44rem] lg:flex-row lg:items-center lg:justify-end">
              <div className="relative flex-1">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search recent documents"
                  className="field h-14 rounded-full border-0 bg-[#eef2f7] pl-16 pr-5 text-base shadow-none focus:bg-white"
                />
                <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-500">
                  <SearchIcon />
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="pill border-0 bg-[rgba(31,122,224,0.08)] text-[#1f4aa8]">
                  {health ? "local workspace" : "connecting"}
                </span>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#111111] text-lg font-semibold text-white">
                  {role.slice(0, 1).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,420px),1fr]">
          <section className="rounded-[2rem] bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="space-y-2">
              <p className="section-label">Create document</p>
              <h1 className="text-[2rem] font-semibold tracking-tight text-slate-900">
                Start a new draft
              </h1>
              <p className="text-sm leading-7 text-slate-600">
                Create a blank document or paste a brief before opening the editor.
              </p>
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
                placeholder="Paste assignment notes, project context, or a starting paragraph."
                rows={10}
                className="field-area"
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

            <div className="mt-5 rounded-[1.4rem] bg-[linear-gradient(135deg,rgba(31,122,224,0.05),rgba(107,92,255,0.05),rgba(217,70,239,0.04))] p-4">
              <RolePicker value={role} onChange={setRole} label="Demo role" />
            </div>
          </section>

          <section className="rounded-[2rem] bg-[linear-gradient(135deg,rgba(31,122,224,0.12),rgba(107,92,255,0.11),rgba(217,70,239,0.09))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <div className="flex flex-col gap-4 border-b border-[#d5deeb] pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="section-label">Assignment flow</p>
                <h2 className="mt-2 text-[1.9rem] font-semibold tracking-tight text-slate-900">
                  Keep the dashboard simple
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                  This page focuses only on the required flow: create a document, open it,
                  continue editing, and use the AI and collaboration panels inside the editor.
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span className="pill border-0 bg-white/80">
                  {canUseAi(role) ? "AI ready" : "Viewer mode"}
                </span>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.5rem] bg-white/88 p-5 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                <div className="section-label">Documents</div>
                <div className="mt-3 text-3xl font-semibold text-slate-900">{documents.length}</div>
                <p className="mt-2 text-sm text-slate-600">Stored in the local backend.</p>
              </div>
              <div className="rounded-[1.5rem] bg-white/88 p-5 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                <div className="section-label">Mode</div>
                <div className="mt-3 text-3xl font-semibold text-slate-900">
                  {canUseAi(role) ? "Edit" : "Review"}
                </div>
                <p className="mt-2 text-sm text-slate-600">Role-aware UI stays visible in the editor.</p>
              </div>
              <div className="rounded-[1.5rem] bg-white/88 p-5 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                <div className="section-label">Backend</div>
                <div className="mt-3 text-3xl font-semibold text-slate-900">
                  {health?.status ?? "..." }
                </div>
                <p className="mt-2 text-sm text-slate-600">FastAPI + SQLite local setup.</p>
              </div>
            </div>
          </section>
        </section>

        <section className="rounded-[2rem] bg-white px-5 py-6 shadow-[0_10px_28px_rgba(15,23,42,0.05)] sm:px-7">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[2rem] font-semibold tracking-tight text-slate-900">
                Recent documents
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {loading
                  ? "Loading the local document library."
                  : `${filteredDocuments.length} document${filteredDocuments.length === 1 ? "" : "s"} visible`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 px-4 text-slate-700 hover:bg-slate-50"
            >
              <GridIcon />
              Refresh
            </button>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {loading ? (
              <div className="notice notice-info col-span-full">
                Loading documents from the local backend...
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
                <Link
                  key={document.id}
                  href={`/documents/${document.id}`}
                  className="group overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition hover:-translate-y-1 hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)]"
                >
                  <div className="bg-[#f8f9fa] px-5 py-5">
                    <div className="mx-auto flex h-[19rem] w-full max-w-[14rem] flex-col rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                      <div className="h-2.5 w-3/4 rounded-full bg-slate-800/90" />
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

                  <div className="px-5 py-4">
                    <div className="line-clamp-1 text-[1.35rem] font-semibold tracking-tight text-slate-900">
                      {document.title}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                      {getExcerpt(document.content, 100)}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                      <div className="flex items-center gap-2">
                        <AppLogo compact />
                        <span>#{document.id}</span>
                      </div>
                      <span>{formatTimestamp(document.updated_at)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
