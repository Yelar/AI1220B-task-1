# Frontend

This Next.js frontend delivers the Assignment 2 user experience for authentication, document editing, AI assistance, sharing, and collaboration.

## Implemented Frontend Scope

- Registration and login screens
- Persisted authenticated session flow
- Document dashboard with create, list, search, open, and delete
- Rich-text editor with headings, bold, italic, lists, and code blocks
- Auto-save status feedback
- Version history and restore UI
- Sharing UI for `owner`, `editor`, and `viewer`
- Share-by-link invitation and redemption UI
- AI assistant with streamed output, cancel, review, edit, apply, partially apply, reject, and undo
- AI history panel per document
- Collaboration presence, connection-state, and remote selection UI

## Local Setup

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

Expected backend services:

- REST API at `http://127.0.0.1:8000/api`
- WebSocket endpoint at `ws://127.0.0.1:8000/ws/documents/:id`

## Optional Environment Variables

The frontend works with local defaults without a `.env.local` file.

If needed, create `frontend/.env.local` manually and set:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api
NEXT_PUBLIC_WS_BASE_URL=ws://127.0.0.1:8000/ws
NEXT_PUBLIC_AUTH_MODE=local
```

## Key UX Behaviors

### Authentication

- Login and registration call the backend auth routes
- Access tokens are attached to API requests
- Expired access tokens are refreshed automatically when possible

### Documents

- The dashboard lists documents the current user owns or can access
- The editor autosaves changes and shows save state
- Version history can be browsed and restored from the UI

### Sharing

- Owners can share documents by email lookup
- Owners can assign `editor` or `viewer`
- Owners can revoke access
- Owners can create and revoke invite links
- Invite links can be redeemed into document access
- The frontend respects server-side permission outcomes

### AI assistant

- AI responses stream progressively into the UI
- Users can cancel generation in progress
- Suggestions are reviewed before application
- Suggestions can be edited before applying
- Users can partially apply a suggestion
- Users can reject a suggestion or undo the last apply
- Per-document AI history is displayed in the side panel

### Collaboration

- Document sessions connect through authenticated WebSockets
- Live updates propagate to other connected clients
- Presence and collaborator activity are shown in the side panel
- Remote cursor and selection markers are rendered in the editor
- The editor handles reconnect and document resync
- The collaboration flow attempts safe merge handling for common non-overlapping concurrent edits

## Tests

Frontend component tests use `Vitest` and React Testing Library.

Run them with:

```bash
cd frontend
npm install
npm test
```

Additional verification:

```bash
cd frontend
npx playwright install chromium
npm run lint
npx next build --webpack
npm run test:e2e
```

Current test coverage includes:

- auth screen flow
- dashboard loading/filtering
- AI assistant panel rendering
- config normalization
- collaboration merge helper behavior
- Playwright login-to-AI-acceptance flow

## Notes

- The frontend is aligned with the final Assignment 2 backend, not the earlier Assignment 1 PoC.
- Permissions are enforced on the server; the frontend reflects those results in the UI.
- The collaboration UX includes presence, remote selections, reconnect sync, and merge handling for common non-overlapping concurrent edits without claiming CRDT/OT support.
