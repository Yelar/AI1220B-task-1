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
  canEdit,
  canUseAi,
  type DocumentRecord,
  type HealthResponse,
  type UserRole,
} from "@/app/lib/types";
import RolePicker from "./role-picker";

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
          <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
            <div className="space-y-4">
              <span className="pill">Frontend workspace</span>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                  Calm, local-first document control.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600">
                  Create a draft, choose a demo role, and jump into the editor. The dashboard now
                  talks to the real FastAPI starter and keeps the flow focused on the assignment.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="pill">Next.js 16</span>
                <span className="pill">
                  {canEdit(role) ? "Editable session" : "Read-only session"}
                </span>
                <span className="pill">
                  {canUseAi(role) ? "AI enabled" : "AI review only"}
                </span>
              </div>
            </div>

            <div className="panel p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="section-label">System</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Local status</h2>
                </div>
                <span className="pill">
                  {health ? health.status : "checking"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="metric">
                  <p className="section-label">Documents</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{documents.length}</p>
                </div>
                <div className="metric">
                  <p className="section-label">Role</p>
                  <p className="mt-2 text-lg font-semibold capitalize text-slate-950">{role}</p>
                </div>
              </div>

              <div className="panel-muted mt-4 p-4 text-sm leading-7 text-slate-600">
                API: `http://127.0.0.1:8000/api`
                <br />
                Realtime: `ws://127.0.0.1:8000/ws/documents/:id`
              </div>

              <button
                type="button"
                onClick={() => void loadDashboard()}
                className="button-secondary mt-4 w-full"
              >
                Refresh documents
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.78fr,1.22fr]">
          <div className="ink-card rounded-[1.75rem] border border-black/10 p-6">
            <div className="space-y-6">
              <RolePicker value={role} onChange={setRole} />

              <div className="panel-muted p-4">
                <p className="section-label">Role note</p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  Permissions are still demo-only on the frontend until the backend auth work lands.
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleCreateDocument}>
                <div>
                  <p className="section-label">Create document</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                    New draft
                  </h2>
                </div>

                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Quarterly strategy memo"
                  className="field"
                />

                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Paste the opening brief, rough outline, or assignment notes."
                  rows={7}
                  className="field-area"
                />

                <label className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-slate-700">
                  <input
                    checked={createVersion}
                    onChange={(event) => setCreateVersion(event.target.checked)}
                    type="checkbox"
                    className="h-4 w-4 rounded border-black/20"
                  />
                  Save an initial version snapshot
                </label>

                <button type="submit" disabled={submitting} className="button-primary w-full">
                  {submitting ? "Creating..." : "Create and open"}
                </button>
              </form>

              {error ? <div className="notice notice-error">{error}</div> : null}
            </div>
          </div>

          <div className="ink-card rounded-[1.75rem] border border-black/10 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-label">Document hub</p>
                <h2 className="mt-2 text-3xl font-semibold text-slate-950">
                  Recent documents
                </h2>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search documents"
                className="field sm:max-w-xs"
              />
            </div>

            <div className="mt-6 space-y-4">
              {loading ? (
                <div className="panel-muted px-5 py-8 text-center text-sm text-slate-600">
                  Loading documents from the local backend...
                </div>
              ) : null}

              {!loading && filteredDocuments.length === 0 ? (
                <div className="panel-muted px-5 py-8 text-center text-sm text-slate-600">
                  {documents.length === 0
                    ? "No documents exist yet. Create the first one from the left panel."
                    : "No documents match the current search."}
                </div>
              ) : null}

              {filteredDocuments.map((document) => (
                <Link
                  key={document.id}
                  href={`/documents/${document.id}`}
                  className="group block rounded-[1.35rem] border border-black/10 bg-white/80 p-5 hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_16px_30px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="pill">#{document.id}</span>
                        <span className="pill">
                          {document.content.trim() ? "Working draft" : "Empty draft"}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-slate-950 group-hover:text-[var(--accent)]">
                          {document.title}
                        </h3>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                          {getExcerpt(document.content)}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
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
