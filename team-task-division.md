# Team Task Division

Use this file as the shared working checklist for both humans and coding agents.

## Current Context

- [x] Main submission root is `AI1220B-task-1/`
- [x] Frontend stack is `Next.js`
- [x] Backend stack is `FastAPI`
- [x] Database for local testing is `SQLite`
- [x] LLM integration target is `LM Studio`
- [x] `report.md` was updated to match the actual stack
- [x] Backend starter exists
- [x] Frontend starter exists

## Working Rules

- [ ] Pull latest `main` before starting work
- [x] Create a new branch for each task
- [ ] Stay inside your owned area unless the team agreed on a cross-cutting change
- [x] Run the relevant checks before opening a PR
- [ ] Open a PR with a short summary and test notes
- [ ] Merge only after review and after checks pass
- [ ] If architecture or API assumptions changed, update `report.md`

## PR Checklist

- [x] Branch name is short and descriptive
- [x] PR does one clear piece of work
- [x] No unrelated files were changed
- [x] Tests or manual checks were run
- [ ] Reviewer can understand what changed from the PR description alone
- [ ] Branch is up to date with `main`

## Coding Agent Rules

- [ ] Treat `AI1220B-task-1/` as the only code root
- [ ] Keep local-first setup intact: SQLite + `.env` + LM Studio
- [ ] Do not silently replace the stack or architecture
- [ ] If API contracts change, update both code and docs
- [ ] Prefer working in the assigned ownership area

## Person 1: Frontend

**Ownership:** `frontend/`

### Todo
- [x] Replace the starter page with a real document dashboard
- [x] Create a document editor page
- [x] Add document create/list/open/update flows
- [x] Build the AI suggestion panel UI
- [x] Add presence and reconnecting UI states
- [x] Add role-aware UI states for owner/editor/commenter/viewer

### Done
- [x] Starter landing page was cleaned up from the default template
- [x] Frontend env example exists

## Person 2: Backend / Data

**Ownership:** `backend/app/database.py`, `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/routers/documents.py`

### Todo
- [ ] Add local user model and seeded demo users
- [ ] Add auth or simple local identity flow for testing
- [ ] Add owner/editor/commenter/viewer permission checks
- [x] Add version create endpoint
- [ ] Add version revert endpoint
- [ ] Add backend tests for CRUD, versions, and permissions

### Done
- [x] FastAPI project scaffold exists
- [x] SQLite connection is set up
- [x] Document CRUD endpoints exist
- [x] Version listing endpoint exists

## Person 3: AI / Collaboration

**Ownership:** `backend/app/services.py`, `backend/app/routers/ai.py`, `backend/app/realtime.py`

### Todo
- [ ] Improve LM Studio request handling and error messages
- [x] Support real and mock AI flows cleanly
- [ ] Expand AI history filtering by document
- [ ] Improve WebSocket message structure
- [ ] Add presence state handling beyond simple broadcast messages
- [ ] Add tests for AI success, AI failure, and collaboration behavior

### Done
- [x] LM Studio integration path exists
- [x] Mock AI mode exists
- [x] AI invoke endpoint exists
- [x] AI history endpoint exists
- [x] Basic WebSocket collaboration room exists

## Shared Milestones

- [x] Frontend can create and open documents from the backend
- [ ] AI request works end-to-end with LM Studio
- [ ] Local auth/role checks are enforced
- [x] Two clients can join the same document room
- [ ] Demo-ready local setup works from README only

## Definition of Done

- [ ] Code is implemented
- [ ] Relevant checks passed
- [ ] PR was reviewed
- [ ] Branch was merged cleanly
- [ ] Docs were updated if needed
