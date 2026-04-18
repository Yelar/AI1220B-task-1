# Architecture Deviations (Assignment 2)

This document outlines deviations from the Assignment 1 design.

## 1. Authentication

- Changed from demo `X-User-Id` header to full JWT-based authentication
- Reason: Assignment 2 requires secure auth with tokens
- Impact: Improves security and aligns with backend protection requirements

## 2. Database

- Continued using SQLite instead of moving to PostgreSQL
- Reason: Maintains local-first setup and reduces complexity
- Impact: Suitable for PoC, but not scalable for production

## 3. Collaboration

- Used basic WebSocket broadcast (last-write-wins)
- Did not implement CRDT/OT conflict resolution
- Reason: Simplifies implementation for assignment scope
- Impact: Works for demo, not production-grade collaboration

## 4. AI Integration

- Used LM Studio locally instead of cloud LLM
- Reason: Privacy, offline capability, assignment constraints
- Impact: Performance depends on local hardware

## 5. AI Streaming

- Current implementation returns full response (no streaming yet)
- Reason: Prioritized core functionality first
- Impact: Will be extended to streaming in later stage