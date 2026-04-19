# Team Task Division - Assignment 2

Use this file as the final Assignment 2 work summary for humans and coding agents.

The implementation was completed in the existing `AI1220B-task-1/` repository and merged into `main`. This file now records what was owned, what was delivered, and what process rules were followed.

## Final Status

- [x] Assignment 2 work was built on top of the Assignment 1 codebase
- [x] Final code is merged into `main`
- [x] Frontend, backend, and AI/collaboration work streams were integrated into one system
- [x] Backend tests pass
- [x] Frontend tests pass
- [x] Frontend lint passes
- [x] Frontend production build passes
- [x] Local run script exists
- [x] README and deviations documentation exist

## Implemented Assignment 2 Scope

- [x] JWT registration, login, refresh, and protected routes
- [x] Rich-text editor with auto-save
- [x] Real-time collaboration with authenticated WebSockets
- [x] Streaming AI responses
- [x] Suggestion compare/apply/reject/edit UX
- [x] Backend and frontend tests for the final implementation
- [x] One-command local startup
- [x] Architecture deviation documentation

## Process Rules Used

- Branch from `main`
- Keep each branch scoped to one clear area
- Push branches to the same repo
- Merge through review/integration, not by rewriting from scratch
- Update code, docs, and tests together when contracts change
- Treat `AI1220B-task-1/` as the only code root
- Keep the setup local-first and reviewer-friendly

## Main Work Streams

- Frontend branch: `origin/frontend-document-editor`
- Backend branch: `origin/backend/data` and related auth/document work merged into `main`
- AI/collaboration branch: `ai-collab/streaming-ai`
- Final integration branch: `integration/final-assignment2`

## Frontend / UX Ownership

**Primary ownership**

- `frontend/app/`
- `frontend/app/components/`
- `frontend/app/lib/`

**Delivered**

- [x] Rich-text editor with headings, bold, italic, lists, and code blocks
- [x] Registration and login screens
- [x] Protected routes and persisted session flow
- [x] Auto-save status in the editor
- [x] Version history and restore UI
- [x] Sharing UI for owner/editor/viewer roles
- [x] AI suggestion compare/apply/reject/edit UI
- [x] Progressive rendering of streamed AI output
- [x] Cancel-generation support in the UI
- [x] Presence UI for active collaborators
- [x] Frontend component tests for auth, document flow, and AI suggestion flow

## Backend / Auth / Documents Ownership

**Primary ownership**

- `backend/app/config.py`
- `backend/app/database.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/routers/users.py`
- `backend/app/routers/documents.py`
- `backend/app/main.py`
- `backend/tests/test_documents.py`

**Delivered**

- [x] Replaced demo identity flow with real registration and login
- [x] Added securely hashed passwords
- [x] Added JWT access and refresh tokens
- [x] Protected API endpoints with auth
- [x] Added token refresh flow
- [x] Enforced owner/editor/viewer permissions server-side
- [x] Aligned sharing to Assignment 2 roles
- [x] Finalized version history and restore behavior for the auth model
- [x] Scoped dashboard results to owned/shared documents
- [x] Added backend auth, permissions, CRUD, and version tests
- [x] Added meaningful FastAPI route descriptions and schemas
- [x] Added one-command local startup support

## AI / Collaboration / Streaming Ownership

**Primary ownership**

- `backend/app/services.py`
- `backend/app/realtime.py`
- `backend/app/routers/ai.py`
- `backend/tests/test_ai_and_collab.py`

**Delivered**

- [x] Converted AI generation to true streaming responses
- [x] Implemented token-by-token streaming over SSE
- [x] Added cancel-in-progress generation support
- [x] Preserved stream status clearly on cancellation and failure
- [x] Centralized prompt templates in a prompt module
- [x] Kept LLM provider usage behind one interface
- [x] Implemented multiple AI features for the final demo
- [x] Logged AI input, prompt excerpt, model, response, and status history
- [x] Authenticated WebSocket connections with JWT
- [x] Improved collaboration join, leave, reconnect, and resync flows
- [x] Kept local propagation and reconnect reconciliation working
- [x] Added WebSocket tests for auth and basic exchange
- [x] Added backend AI tests with mocked LLM behavior

## Shared Cross-Cutting Tasks

- [x] Added `DEVIATIONS.md` for Assignment 1 vs Assignment 2 changes
- [x] Kept generated files out of tracked source deliverables
- [x] Updated `.env.example` files to match final required variables
- [x] Verified the live demo flow locally

## Demo Flow Checklist

- [x] Registration and login
- [x] Protected routes
- [x] Document creation with rich-text editing and auto-save
- [x] Sharing with role enforcement
- [x] Real-time collaboration in two windows
- [x] AI assistant with streaming, cancellation, and suggestion UX
- [x] Version restore

## Definition of Done

- [x] Code is merged to `main`
- [x] Relevant tests pass
- [x] Manual demo flow works locally
- [x] README setup is accurate from a clean clone
- [x] Deviation documentation is written
- [x] Each major ownership area has merged code in `main`
