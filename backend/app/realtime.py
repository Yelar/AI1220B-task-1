from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, document_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms[document_id].add(websocket)

    def disconnect(self, document_id: str, websocket: WebSocket) -> None:
        room = self._rooms[document_id]
        room.discard(websocket)
        if not room:
            self._rooms.pop(document_id, None)

    async def broadcast(self, document_id: str, payload: dict) -> None:
        for websocket in list(self._rooms.get(document_id, set())):
            await websocket.send_json(payload)


manager = ConnectionManager()
