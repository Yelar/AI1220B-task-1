import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  url: string;
  private listeners = new Map<string, Set<(event?: { data?: string }) => void>>();

  constructor(url: string) {
    this.url = url;
    queueMicrotask(() => {
      this.dispatch("open");
    });
  }

  addEventListener(type: string, listener: (event?: { data?: string }) => void) {
    const group = this.listeners.get(type) ?? new Set();
    group.add(listener);
    this.listeners.set(type, group);
  }

  removeEventListener(type: string, listener: (event?: { data?: string }) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  send() {}

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatch("close");
  }

  dispatch(type: string, event?: { data?: string }) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

Object.defineProperty(globalThis, "WebSocket", {
  writable: true,
  value: MockWebSocket,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "WebSocket", {
    writable: true,
    value: MockWebSocket,
  });
}

afterEach(() => {
  cleanup();
});
