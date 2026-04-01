"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
  type FormEvent,
} from "react";

import { ApiError, createDocument, getHealth, listDocuments } from "@/app/lib/api";
import {
  canEdit,
  canUseAi,
  type DocumentRecord,
  type HealthResponse,
  type UserRole,
} from "@/app/lib/types";
import RolePicker from "./role-picker";

const roleStorageKey = "atlas-role";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getExcerpt(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "No content yet. Open the document to start writing.";
  }
  return compact.length > 140 ? `${compact.slice(0, 140)}...` : compact;
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
  const [createVersion, setCreateVersion] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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

  const loadDashboard = useEffectEvent(async () => {
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
  });

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

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
        save_initial_version: createVersion,
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
    <main className="app-shell flex-1 px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="grain-panel overflow-hidden rounded-[2rem] border border-black/10 p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.25fr,0.75fr]">
            <div className="space-y-5">
              <p className="inline-flex rounded-full border border-black/10 bg-black px-4 py-1 text-xs uppercase tracking-[0.28em] text-white">
                AI1220B Frontend Workspace
              </p>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
                  Build, open, and steer documents from one local dashboard.
                </h1>
                <p className="max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
                  This frontend now targets the real FastAPI starter routes and the collaboration
                  WebSocket room. Pick a local role, create a document, then move into the editor
                  shell for AI suggestions and realtime session feedback.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-slate-700">
                <span className="rounded-full bg-amber-100 px-4 py-2">Next.js 16 dashboard</span>
                <span className="rounded-full bg-emerald-100 px-4 py-2">
                  {canEdit(role) ? "Editable session" : "Read-only session"}
                </span>
                <span className="rounded-full bg-sky-100 px-4 py-2">
                  {canUseAi(role) ? "AI enabled" : "AI review only"}
                </span>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-black/10 bg-slate-950 p-6 text-slate-100 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Local system
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Backend readiness</h2>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.24em] ${
                    health
                      ? "bg-emerald-400/20 text-emerald-200"
                      : "bg-amber-400/20 text-amber-200"
                  }`}
                >
                  {health ? health.status : "checking"}
                </span>
              </div>

              <div className="mt-6 space-y-4 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-medium text-white">Expected services</p>
                  <ul className="mt-3 space-y-2">
                    <li>Frontend: `http://localhost:3000`</li>
                    <li>Backend: `http://127.0.0.1:8000`</li>
                    <li>API docs: `http://127.0.0.1:8000/docs`</li>
                    <li>Realtime room: `ws://127.0.0.1:8000/ws/documents/:id`</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-medium text-white">Current dataset</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/5 p-3">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                        Documents
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {documents.length}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-3">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                        Active mode
                      </p>
                      <p className="mt-2 text-lg font-semibold capitalize text-white">{role}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.72fr,1.28fr]">
          <div className="ink-card rounded-[1.75rem] border border-black/10 p-6">
            <div className="space-y-6">
              <RolePicker value={role} onChange={setRole} />

              <div className="rounded-[1.5rem] border border-dashed border-black/15 bg-white/50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  Role impact
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-700">
                  The backend does not yet enforce identity or permissions. This selector gives you
                  the correct frontend states now, so the demo can show owner, editor, commenter,
                  and viewer experiences before backend auth lands.
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleCreateDocument}>
                <div>
                  <label className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                    Create document
                  </label>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                    Start a new working draft
                  </h2>
                </div>

                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Quarterly strategy memo"
                  className="w-full rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-base text-slate-900 shadow-sm"
                />

                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Paste the opening brief, rough outline, or assignment notes."
                  rows={7}
                  className="w-full rounded-[1.5rem] border border-black/10 bg-white/90 px-4 py-3 text-sm leading-7 text-slate-900 shadow-sm"
                />

                <label className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-slate-700">
                  <input
                    checked={createVersion}
                    onChange={(event) => setCreateVersion(event.target.checked)}
                    type="checkbox"
                    className="h-4 w-4 rounded border-black/20"
                  />
                  Save an initial version snapshot immediately
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-2xl bg-[var(--accent-strong)] px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Creating..." : "Create and open document"}
                </button>
              </form>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <div className="ink-card rounded-[1.75rem] border border-black/10 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Document hub</p>
                <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                  Recent documents from SQLite
                </h2>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by title or content"
                className="w-full rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-sm shadow-sm sm:max-w-xs"
              />
            </div>

            <div className="mt-6 space-y-4">
              {loading ? (
                <div className="rounded-[1.5rem] border border-dashed border-black/15 bg-white/50 px-5 py-8 text-center text-sm text-slate-600">
                  Loading documents from the local backend...
                </div>
              ) : null}

              {!loading && filteredDocuments.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-black/15 bg-white/50 px-5 py-8 text-center text-sm text-slate-600">
                  {documents.length === 0
                    ? "No documents exist yet. Create the first one from the panel on the left."
                    : "No documents match the current search."}
                </div>
              ) : null}

              {filteredDocuments.map((document) => (
                <Link
                  key={document.id}
                  href={`/documents/${document.id}`}
                  className="group block rounded-[1.5rem] border border-black/10 bg-white/80 p-5 hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-black px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white">
                          #{document.id}
                        </span>
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-amber-900">
                          {document.content.trim() ? "Working draft" : "Empty draft"}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-2xl font-semibold text-slate-950 group-hover:text-[var(--accent)]">
                          {document.title}
                        </h3>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                          {getExcerpt(document.content)}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-black/10 bg-[var(--surface-strong)] px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-500">
                      Updated {formatTimestamp(document.updated_at)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
