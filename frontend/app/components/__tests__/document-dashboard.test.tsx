import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DocumentDashboard from "@/app/components/document-dashboard";

const { push, logout, listDocuments } = vi.hoisted(() => ({
  push: vi.fn(),
  logout: vi.fn(),
  listDocuments: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/app/components/auth-provider", () => ({
  useAuth: () => ({
    logout,
    session: {
      user: {
        id: 1,
        name: "Abdullah",
        email: "abdullah@example.com",
      },
    },
  }),
}));

vi.mock("@/app/lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  listDocuments,
}));

describe("DocumentDashboard", () => {
  beforeEach(() => {
    listDocuments.mockReset();
    listDocuments.mockResolvedValue([
      {
        id: 3,
        title: "Weekly Notes",
        content: "Sprint notes and follow ups",
        created_at: "2026-04-18T08:00:00Z",
        updated_at: "2026-04-18T09:00:00Z",
      },
    ]);
  });

  it("loads and filters recent documents", async () => {
    render(<DocumentDashboard />);

    expect(await screen.findByText("Weekly Notes")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search recent documents"), {
      target: { value: "other" },
    });

    await waitFor(() =>
      expect(screen.queryByText("Weekly Notes")).not.toBeInTheDocument()
    );
  });
});
