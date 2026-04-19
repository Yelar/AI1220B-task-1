# Architecture Deviations (Assignment 2)

This document records the main differences between the Assignment 1 design in `assignment-1-archive/report.md` and the final Assignment 2 implementation.

The goal is not to pretend the design stayed unchanged. It did not. The goal is to document what changed, why it changed, and whether the final result should be read as an improvement or a compromise.

## Summary

| Area | Assignment 1 Position | Final Implementation | Assessment |
|---|---|---|---|
| Authentication | Local/demo-oriented identity flow for PoC iteration | Real JWT authentication with registration, login, refresh, and protected routes | Improvement |
| Role model | Four-role model with a richer collaboration concept | Final runtime uses `owner`, `editor`, and `viewer` with full server-side enforcement | Compromise |
| AI transport | Non-streaming or simple request/response flow was acceptable for the PoC | Streaming AI over SSE with progressive rendering and cancellation | Improvement |
| Collaboration transport | WebSocket scaffold with stronger consistency deferred | Authenticated WebSocket sync with presence, reconnect, visual remote selections, and safe merge handling for non-overlapping concurrent edits | Improvement |
| AI collaboration UX | Early design discussed richer region awareness during AI work | Final system focuses on suggestion review, undo, history, and partial acceptance | Compromise |
| Sharing model | Direct user-based sharing was central | Direct sharing retained and extended with share-by-link invitation flows | Improvement |
| Data store | Local SQLite with room for future migration | Local SQLite retained | No deviation |
| AI provider | LM Studio via local OpenAI-compatible API | LM Studio retained, with optional mock mode for evaluation | Improvement |
| Quality verification | Testing expectations were broad and still conceptual | Backend tests, frontend tests, lint, build, and Playwright E2E verification are included | Improvement |

## 1. Authentication and Sessions

### What changed

Assignment 1 used a lightweight local identity model suitable for early UI and architecture validation. Assignment 2 now uses:

- password-based registration and login
- hashed passwords
- JWT access tokens
- JWT refresh tokens
- protected REST routes
- authenticated WebSocket sessions
- persisted frontend session storage with refresh handling

### Why it changed

Assignment 2 explicitly requires real authentication and session handling. The Assignment 1 model was intentionally lightweight and useful for the PoC, but it was not sufficient for the final implementation.

### Assessment

Improvement. This is a direct maturity step from a prototype identity model to a secure implementation that satisfies the brief.

## 2. Role Model and Access Control

### What changed

The Assignment 1 design described a richer collaboration permission model. The final runtime standardizes on:

- `owner`
- `editor`
- `viewer`

The final implementation also enforces permissions on the backend for document access, editing, AI use, versioning, and sharing operations.

### Why it changed

The Assignment 2 brief requires at least three roles with server-side enforcement. The final implementation prioritizes a coherent end-to-end permission model aligned with the rubric rather than keeping extra roles that would require a larger unfinished moderation or commenting workflow.

### Assessment

Compromise. The conceptual design space in Assignment 1 was broader, but the submitted runtime is more coherent, fully enforced, and better aligned with the grading brief.

## 3. AI Request and Streaming Flow

### What changed

Assignment 1 allowed a simpler request/response AI interaction model. The final implementation now provides:

- SSE-based streamed AI output
- progressive rendering in the frontend
- cancellation of in-progress generation
- AI interaction history
- accept, reject, edit-before-apply, undo, and partial acceptance workflows

### Why it changed

Streaming is a hard requirement in Assignment 2, and the final system needed a complete end-to-end AI flow rather than a blocking call with a delayed full response.

### Assessment

Improvement. This is a clear upgrade over the Assignment 1 PoC and closely matches the expected Assignment 2 user experience.

## 4. Collaboration Consistency Model

### What changed

Assignment 1 treated the WebSocket layer as a collaboration scaffold and explicitly left stronger conflict handling for later iterations. The final system now provides:

- authenticated WebSocket sessions
- presence sync
- reconnect and session resynchronization
- live document update propagation
- remote cursor and selection awareness in the editor
- merge assistance for non-overlapping concurrent text changes while preserving the local draft on overlap

The implementation still does not use CRDT or OT.

### Why it changed

The team prioritized a reliable collaboration layer that satisfies the rubric, supports a live demo, and improves safety under common concurrent-edit cases without introducing a late full-scale CRDT/OT rewrite.

### Assessment

Improvement. The final collaboration layer is stronger than a pure last-write-wins snapshot model, even though it intentionally stops short of full CRDT/OT conflict resolution.

## 5. AI Coordination During Collaboration

### What changed

Assignment 1 discussed richer region-aware AI coordination during collaborative editing. The final implementation focuses on:

- suggestion review before application
- edited application
- partial acceptance
- undo after acceptance
- AI interaction history per document

It does not implement explicit region locking or soft-lock banners for other collaborators while an AI request is running.

### Why it changed

The team prioritized the hard Assignment 2 AI deliverables first: streaming, cancellation, review UX, history, and document-safe application behavior.

### Assessment

Compromise. The implemented AI UX is strong and rubric-aligned, but it does not fully realize the richer region-coordination concept from Assignment 1.

## 6. Sharing Model

### What changed

Assignment 1 emphasized direct permission-based sharing between users. The final implementation retains that model and extends it with:

- owner-managed direct sharing by email lookup
- role assignment for `editor` and `viewer`
- revocation of direct permissions
- share-by-link invitation flow
- revocation of invitation links

### Why it changed

Direct sharing remained the baseline requirement, while share-by-link was added to provide a more complete collaboration workflow and satisfy the bonus rubric more strongly.

### Assessment

Improvement. The final sharing model is broader and more practical than the original baseline proposal.

## 7. Local-First Infrastructure

### What changed

No material architectural change. The final system still uses:

- Next.js on the frontend
- FastAPI on the backend
- SQLite for local persistence
- LM Studio as the local LLM provider

The final backend also supports mock AI mode to simplify evaluation when a local model is unavailable.

### Why it stayed largely the same

This part of the Assignment 1 design already matched the course goals well: local setup, low friction for evaluation, and no deployment dependency.

### Assessment

No major deviation. This remains one of the strongest aspects of the original design.

## 8. Testing and Verification

### What changed

Assignment 1 discussed testing goals at a planning level. The final repository now includes concrete verification steps:

- backend `pytest` coverage for auth, permissions, documents, AI, and WebSocket behavior
- frontend component tests with `Vitest`
- frontend lint and production build checks
- Playwright E2E coverage for login through AI suggestion acceptance

### Why it changed

Assignment 2 requires a working submission rather than a design-only artifact, so the repository needed executable verification commands and working automated tests.

### Assessment

Improvement. The final repo has stronger evidence for quality and evaluator reproducibility than the original Assignment 1 plan.

## 9. Completed Bonus Features

The final implementation includes the following bonus work:

- remote cursor and selection tracking rendered in the editor
- share-by-link invitations with configurable permissions and revocation
- partial acceptance of AI suggestions
- Playwright end-to-end test coverage for the login-to-AI-acceptance flow

## 10. Practical Consequences

### Improvements

- Real authentication and session handling
- Streamed AI with cancellation and review UX
- Stronger collaboration behavior than a pure last-write-wins snapshot flow
- Share-by-link support in addition to direct sharing
- Automated verification across backend, frontend, and E2E layers

### Compromises

- The final role system is narrower than the broader design space explored in Assignment 1
- The collaboration layer does not implement CRDT or OT
- Region-level AI locking/soft-locking during collaboration was not prioritized into the final runtime

## Final Note

The final system remains architecturally consistent with the Assignment 1 direction:

- local-first evaluation
- FastAPI backend
- Next.js frontend
- SQLite persistence
- LM Studio integration
- document versions
- role-based access control
- real-time collaboration

The main differences come from maturing the design into a working Assignment 2 implementation: stronger security, streamed AI, richer sharing, stronger collaboration UX, and executable verification for the final submission.
