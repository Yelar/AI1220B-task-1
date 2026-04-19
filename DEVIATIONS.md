# Architecture Deviations (Assignment 2)

This document records the main differences between the Assignment 1 design in [report.md](/Users/yelarys.yertaiuly/Downloads/swe-task1/AI1220B-task-1/report.md) and the final Assignment 2 implementation.

The point is not to claim the design stayed unchanged. It did not. The goal is to document what changed, why it changed, and whether the result was an improvement or a compromise.

## Summary

| Area | Assignment 1 Position | Final Implementation | Assessment |
|---|---|---|---|
| Authentication | Local demo identities and simple role switching for PoC testing | Real JWT auth with registration, login, refresh, and protected routes | Improvement |
| Roles | `owner`, `editor`, `commenter`, `viewer` | `owner`, `editor`, `viewer` | Compromise to match Assignment 2 baseline |
| AI transport | Non-streaming AI invocation was acceptable for the Assignment 1 PoC | Streaming AI over SSE with progressive frontend rendering and cancellation | Improvement |
| Collaboration model | WebSocket collaboration scaffold, with future room for stronger consistency | Authenticated WebSocket sync with presence and reconnect, but still basic last-write-wins | Compromise |
| AI region coordination | Assignment 1 described pending-region awareness during AI work | Final system keeps suggestion history and review UX, but does not implement full region-level locking/soft-locking | Compromise |
| Data store | Local SQLite, with future path to PostgreSQL | Local SQLite retained | No deviation |
| AI provider | LM Studio via local OpenAI-compatible API | LM Studio via local OpenAI-compatible API | No deviation |

## 1. Authentication and Sessions

**What changed**

Assignment 1 used local demo identities and simple role-aware behavior to keep the PoC easy to run. Assignment 2 now uses:

- password-based registration and login
- bcrypt password hashing
- JWT access tokens
- JWT refresh tokens
- protected API routes
- persisted frontend session handling

**Why it changed**

Assignment 2 explicitly requires real authentication and session handling. The Assignment 1 model was intentionally lightweight, but it was not sufficient for the final implementation requirements.

**Assessment**

Improvement. This is a direct maturity step from the Assignment 1 PoC into a secure implementation while still keeping the system local-first.

## 2. Role Model

**What changed**

Assignment 1 modeled four roles:

- `owner`
- `editor`
- `commenter`
- `viewer`

The final implementation uses:

- `owner`
- `editor`
- `viewer`

**Why it changed**

Assignment 2 requires at least three roles with server-side enforcement. The `commenter` role was removed to keep the final system aligned with the baseline deliverable and to avoid implementing a partial comment workflow with no dedicated commenting UI.

**Assessment**

Compromise. The Assignment 1 role model was richer, but the final implementation focuses on the required baseline and on keeping the permission model coherent end-to-end.

## 3. AI Request Flow

**What changed**

Assignment 1 documented a simple request/response AI flow where the frontend called the backend and waited for the full model response. The final implementation now supports:

- streaming AI responses over SSE
- progressive rendering in the frontend
- user cancellation
- preserved AI history and suggestion status

**Why it changed**

Assignment 2 makes streaming a hard requirement. The earlier flow was acceptable only for the first PoC.

**Assessment**

Improvement. This is a clear upgrade over the Assignment 1 PoC and better matches the intended product experience.

## 4. Collaboration Consistency Model

**What changed**

Assignment 1 positioned the WebSocket layer as a collaboration scaffold and explicitly left room for stronger conflict handling in later iterations. The final implementation provides:

- authenticated WebSocket connections
- presence sync
- reconnect and session resync
- document update broadcasting

It still uses a basic last-write-wins model rather than CRDT or OT conflict resolution.

**Why it changed**

The team prioritized a reliable baseline implementation that satisfies the Assignment 2 requirements without taking on the complexity and risk of a CRDT/OT system late in the cycle.

**Assessment**

Compromise. The final collaboration model is suitable for the assignment demo and local testing, but it is not production-grade concurrent editing under adversarial edits.

## 5. AI Coordination During Collaboration

**What changed**

Assignment 1 described region-level awareness during AI work, including the idea that the frontend could mark a selected region as pending while AI was processing it. The final implementation instead provides:

- streamed suggestion generation
- compare/edit/apply/reject UX
- undo after acceptance
- AI interaction history per document

It does not implement dedicated region-level AI locking or soft-lock indicators for other collaborators.

**Why it changed**

The team focused on the baseline Assignment 2 deliverables: streaming, cancellation, review UX, and history. Region-level coordination was judged lower priority than getting the full end-to-end AI flow working reliably.

**Assessment**

Compromise. The implemented UX is strong enough for the assignment, but it does not fully realize the collaborative AI-awareness idea from Assignment 1.

## 6. Local-First Infrastructure

**What changed**

No material change. The final system still uses:

- Next.js on the frontend
- FastAPI on the backend
- SQLite for local persistence
- LM Studio as the local LLM provider

**Why it stayed the same**

This part of the Assignment 1 design was correct for the course goals: easy local setup, no cloud dependency, and low friction for evaluation.

**Assessment**

No deviation. This remains one of the strongest parts of the original design.

## 7. Practical Consequences

### Improvements

- Stronger security and session handling than the Assignment 1 PoC
- Streaming AI that matches the final assignment requirements
- Better frontend workflow around AI review and document editing
- Authenticated collaboration instead of open document sockets

### Compromises

- No `commenter` role in the final runtime
- No CRDT/OT conflict resolution
- No dedicated region-level AI soft-locking during collaboration

## Final Note

The final system is consistent with the Assignment 1 direction at the architecture level:

- local-first
- FastAPI backend
- Next.js frontend
- SQLite persistence
- LM Studio integration
- document versions
- role-based access
- real-time collaboration

The main differences are the move from a lightweight Assignment 1 PoC to a secure and streamed Assignment 2 implementation, plus a few deliberate scope reductions where the richer Assignment 1 ideas were not worth the added complexity.
