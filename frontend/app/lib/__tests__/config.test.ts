import { afterEach, describe, expect, it, vi } from "vitest";

describe("config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("appends /api when the base URL omits it", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://127.0.0.1:8000");

    const { API_BASE_URL } = await import("../config");

    expect(API_BASE_URL).toBe("http://127.0.0.1:8000/api");
  });

  it("keeps /api when it is already present", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://127.0.0.1:8000/api");

    const { API_BASE_URL } = await import("../config");

    expect(API_BASE_URL).toBe("http://127.0.0.1:8000/api");
  });
});
