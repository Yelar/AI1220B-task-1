## Frontend local setup

Install dependencies, add the local API env file, and start the dev server:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Expected backend services:

- REST API at `http://127.0.0.1:8000/api`
- WebSocket room at `ws://127.0.0.1:8000/ws/documents/:id`

## Implemented frontend scope

- Document dashboard with create, list, search, and open flows
- Document editor page with title/content save flow
- AI assistant panel for rewrite, summarize, translate, and restructure requests
- Version list, snapshot creation, and owner-only revert controls
- Sharing, permissions, and export actions
- Realtime connection status, presence list, and reconnect handling
- Role-aware owner, editor, commenter, and viewer UI modes

## Notes

- The backend exposes local demo users, document permissions, version routes, export routes, and AI history routes.
- The frontend still keeps a local role picker so the team can preview owner, editor, commenter, and viewer states quickly during the demo.
