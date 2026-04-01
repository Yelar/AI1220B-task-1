export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <section className="w-full max-w-5xl rounded-[2rem] border border-black/10 bg-white/90 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:p-12">
        <div className="grid gap-10 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-6">
            <p className="inline-flex rounded-full border border-black/10 bg-black px-4 py-1 text-sm font-medium text-white">
              AI1220B Assignment Starter
            </p>
            <div className="space-y-4">
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Collaborative document editor with a local FastAPI backend and LM Studio integration.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                The frontend is ready for editor and collaboration UI work. The backend starter in
                the submission root provides local SQLite persistence, starter CRUD routes, an LM
                Studio AI endpoint, and a WebSocket room for document sessions.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-700">
              <span className="rounded-full bg-amber-100 px-4 py-2">Next.js 16</span>
              <span className="rounded-full bg-emerald-100 px-4 py-2">FastAPI</span>
              <span className="rounded-full bg-sky-100 px-4 py-2">SQLite</span>
              <span className="rounded-full bg-rose-100 px-4 py-2">LM Studio</span>
            </div>
          </div>

          <div className="rounded-[1.5rem] bg-slate-950 p-6 text-sm text-slate-100">
            <h2 className="text-lg font-semibold">Quick start</h2>
            <ol className="mt-4 space-y-3 text-slate-300">
              <li>1. Start the FastAPI app from `../backend`.</li>
              <li>2. Run LM Studio locally and update `backend/.env`.</li>
              <li>3. Copy `frontend/.env.example` to `.env.local`.</li>
              <li>4. Build the editor, document pages, and AI panel here.</li>
            </ol>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-white">Expected local services</p>
              <ul className="mt-3 space-y-2 text-slate-300">
                <li>Frontend: `http://localhost:3000`</li>
                <li>Backend: `http://127.0.0.1:8000`</li>
                <li>API docs: `http://127.0.0.1:8000/docs`</li>
                <li>WebSocket: `ws://127.0.0.1:8000/ws/documents/:id`</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
