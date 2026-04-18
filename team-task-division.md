# Team Task Division - Assignment 2

Use this file as the shared work board for humans and coding agents.

The codebase already contains the Assignment 1 PoC. Assignment 2 work must extend the existing repo in `AI1220B-task-1/`, not start a new project.

## Current Starting Point

- [x] Repo root is `AI1220B-task-1/`
- [x] Frontend stack is `Next.js` with React and TypeScript
- [x] Backend stack is `FastAPI`
- [x] Local persistence already exists
- [x] Document CRUD already exists
- [x] Basic versioning already exists
- [x] Basic sharing/permissions already exist
- [x] Basic AI integration already exists
- [x] Basic WebSocket collaboration already exists

## What Assignment 2 Adds

- [ ] JWT registration, login, refresh, and protected routes
- [ ] Rich-text editor with auto-save
- [ ] Real-time collaboration with authenticated WebSockets
- [ ] Streaming AI responses
- [ ] Suggestion compare/apply/reject/edit UX
- [ ] Backend and frontend tests for the final implementation
- [ ] One-command local startup
- [ ] Architecture deviation documentation

## Working Rules

- [ ] Always branch from latest `main`
- [ ] One branch per task or tightly related task set
- [ ] Push your branch to the same repo: `AI1220B-task-1`
- [ ] Open a PR before merging to `main`
- [ ] Do not merge your own PR without review
- [ ] Do not silently replace the stack or rewrite from scratch
- [ ] If you change API contracts, update code, docs, and tests together
- [ ] If you deviate from Assignment 1 design, document it in `README.md` or `DEVIATIONS.md`

## Branch Naming

- [ ] Use `frontend/<short-task>`
- [ ] Use `backend/<short-task>`
- [ ] Use `ai-collab/<short-task>`
- [ ] Example: `frontend/rich-text-editor`
- [ ] Example: `backend/jwt-auth`
- [ ] Example: `ai-collab/streaming-suggestions`

## PR Checklist

- [ ] Branch is up to date with `main`
- [ ] PR changes one clear area of the system
- [ ] No unrelated files are included
- [ ] Relevant tests were run
- [ ] README or deviations doc was updated if behavior changed
- [ ] Manual test notes are written in the PR description

## Coding Agent Rules

- [ ] Treat `AI1220B-task-1/` as the only code root
- [ ] Build on top of the current codebase instead of replacing it
- [ ] Keep local-first setup easy for the reviewer
- [ ] Do not commit secrets, `.env`, database files, `.venv`, `.next`, or `node_modules`
- [ ] Respect ownership boundaries unless the task explicitly spans multiple areas

## Person 1: Frontend / UX

**Primary ownership**

- `frontend/app/`
- `frontend/app/components/`
- `frontend/app/lib/`

**Main goal**

- Deliver the full client-side product flow for Assignment 2.

### Todo

- [x] Replace plain text editing with a rich-text editor that supports headings, bold, italic, lists, and code blocks
- [x] Add registration and login screens with protected-route handling
- [ ] Persist session across refreshes and handle token expiry gracefully
- [x] Add auto-save status in the editor
- [x] Build version history and restore UI
- [x] Build sharing UI for owner/editor/viewer assignment
- [x] Build AI suggestion compare/apply/reject/edit UI
- [ ] Show streamed AI output progressively in the UI
- [ ] Add cancel-generation support in the UI
- [x] Add presence UI for active collaborators
- [ ] Add frontend component tests for auth flow, document flow, and AI suggestion flow

### Notes

- Session persistence is implemented on the frontend, but token-expiry handling still needs full end-to-end verification with the final backend auth flow.
- AI progressive output and cancellation exist in the frontend UI, but final completion depends on real backend streaming behavior.
- Frontend component tests were added, but the suite still needs cleanup to remove the current unhandled WebSocket test error.

### Suggested branches

- [ ] `frontend/auth-ui`
- [ ] `frontend/rich-text-editor`
- [ ] `frontend/ai-suggestion-ux`
- [ ] `frontend/component-tests`

## Person 2: Backend / Auth / Documents

**Primary ownership**

- `backend/app/config.py`
- `backend/app/database.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/routers/users.py`
- `backend/app/routers/documents.py`
- `backend/app/main.py`
- `backend/tests/test_documents.py`

**Main goal**

- Deliver secure API foundations and document lifecycle features.

### Todo

- [ ] Replace demo identity flow with real registration and login
- [ ] Add securely hashed passwords
- [ ] Add JWT access tokens and refresh tokens
- [ ] Protect all API endpoints with auth
- [ ] Add token refresh flow and logout/session cleanup behavior
- [ ] Enforce owner/editor/viewer permissions server-side on every relevant route
- [ ] Align sharing to Assignment 2 roles: owner, editor, viewer
- [ ] Finalize version history and restore behavior for the real auth model
- [ ] Ensure dashboard returns only owned/shared documents for the authenticated user
- [ ] Add backend unit and integration tests for auth, permissions, CRUD, and version restore
- [ ] Add meaningful FastAPI route descriptions and schemas for API docs
- [ ] Add `run.sh` or `Makefile` support for one-command local startup

### Suggested branches

- [ ] `backend/jwt-auth`
- [ ] `backend/permissions-hardening`
- [ ] `backend/versioning-auth`
- [ ] `backend/run-script-and-docs`

## Person 3: AI / Collaboration / Streaming

**Primary ownership**

- `backend/app/services.py`
- `backend/app/realtime.py`
- `backend/app/routers/ai.py`
- `backend/tests/test_ai_and_collab.py`

**Main goal**

- Deliver the hard real-time and AI features required for Assignment 2.

### Todo

- [ ] Convert AI generation to true streaming responses
- [ ] Support token-by-token streaming over SSE or WebSocket
- [ ] Add cancel-in-progress generation support
- [ ] Preserve or clearly discard partial output on stream failure
- [ ] Keep prompt templates configurable in one prompt module or config area
- [ ] Make LLM provider usage swappable behind one interface
- [ ] Implement at least two strong AI features for the final demo
- [ ] Ensure AI history logs input, prompt, model, response, and accept/reject state
- [ ] Authenticate WebSocket connections with JWT
- [ ] Improve collaboration session join, leave, reconnect, and resync flows
- [ ] Ensure reasonable local propagation latency and state reconciliation on reconnect
- [ ] Add WebSocket tests for auth and basic message exchange
- [ ] Add backend AI tests with mocked LLM streaming behavior

### Suggested branches

- [ ] `ai-collab/streaming-ai`
- [ ] `ai-collab/ws-auth`
- [ ] `ai-collab/reconnect-sync`
- [ ] `ai-collab/ai-history-and-prompts`

## Shared Cross-Cutting Tasks

- [ ] Add `DEVIATIONS.md` or a dedicated README section for Assignment 1 vs Assignment 2 changes
- [ ] Clean `.gitignore` if generated files are still tracked
- [ ] Make sure `.env.example` files match the final required variables
- [ ] Confirm the live demo flow works exactly in this order:
- [ ] Registration and login
- [ ] Protected routes
- [ ] Document creation with rich-text editing and auto-save
- [ ] Sharing with role enforcement
- [ ] Real-time collaboration in two windows
- [ ] AI assistant with streaming, cancellation, and suggestion UX
- [ ] Version restore

## Integration Order

- [ ] Step 1: Backend auth foundation lands first
- [ ] Step 2: Frontend auth/session flow is wired to backend JWT
- [ ] Step 3: Rich-text editor replaces plain editor
- [ ] Step 4: Streaming AI backend and frontend are integrated together
- [ ] Step 5: Authenticated WebSocket collaboration is finalized
- [ ] Step 6: Tests, run script, README, and deviations doc are finalized

## Definition of Done

- [ ] Code is merged to `main`
- [ ] Relevant tests pass
- [ ] Manual demo flow works locally
- [ ] README setup is accurate from a clean clone
- [ ] Deviation documentation is written
- [ ] Each teammate has merged code in their owned area
