import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DocumentEditor from "@/app/components/document-editor";

const {
  ApiError,
  logout,
  getDocument,
  listVersions,
  listAiHistory,
  listUsers,
  listPermissions,
  updateDocument,
} = vi.hoisted(() => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  logout: vi.fn(),
  getDocument: vi.fn(),
  listVersions: vi.fn(),
  listAiHistory: vi.fn(),
  listUsers: vi.fn(),
  listPermissions: vi.fn(),
  updateDocument: vi.fn(),
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
  ApiError,
  createVersion: vi.fn(),
  getDocument,
  invokeAi: vi.fn(),
  listAiHistory,
  listPermissions,
  listUsers,
  listVersions,
  removePermission: vi.fn(),
  revertVersion: vi.fn(),
  upsertPermission: vi.fn(),
  updateDocument,
}));

vi.mock("@/app/lib/config", () => ({
  WS_BASE_URL: "ws://127.0.0.1:8001/ws",
}));

vi.mock("@/app/components/rich-text-editor", async () => {
  const ReactModule = await import("react");

  const MockEditor = ReactModule.forwardRef(function MockEditor(
    props: {
      value: string;
      onChange: (value: string) => void;
      onSelectionChange?: (payload: { plainText: string; selectedText: string }) => void;
      disabled?: boolean;
    },
    ref: React.ForwardedRef<{ runCommand: () => void; replaceSelection: () => void }>
  ) {
    ReactModule.useImperativeHandle(ref, () => ({
      runCommand() {},
      replaceSelection() {},
    }));

    return (
      <textarea
        aria-label="Mock editor"
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.target.value);
          props.onSelectionChange?.({
            plainText: event.target.value,
            selectedText: "Selected copy",
          });
        }}
      />
    );
  });

  return {
    __esModule: true,
    default: MockEditor,
    toolbarCommands: [{ label: "B", action: "bold" }],
  };
});

describe("DocumentEditor", () => {
  beforeEach(() => {
    getDocument.mockReset();
    listVersions.mockReset();
    listAiHistory.mockReset();
    listUsers.mockReset();
    listPermissions.mockReset();
    updateDocument.mockReset();

    getDocument.mockResolvedValue({
      id: 1,
      title: "Spec draft",
      content: "Initial content",
      created_at: "2026-04-18T08:00:00Z",
      updated_at: "2026-04-18T09:00:00Z",
    });
    listVersions.mockResolvedValue([]);
    listAiHistory.mockResolvedValue([]);
    listUsers.mockResolvedValue([]);
    listPermissions.mockRejectedValue(new ApiError("forbidden", 403));
    updateDocument.mockResolvedValue({
      id: 1,
      title: "Spec draft",
      content: "Initial content",
      created_at: "2026-04-18T08:00:00Z",
      updated_at: "2026-04-18T09:00:00Z",
    });
  });

  it("opens the AI assistant panel", async () => {
    render(<DocumentEditor documentId={1} />);

    expect(await screen.findByDisplayValue("Spec draft")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Open AI assistant"));

    expect(await screen.findByText("AI assistant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate suggestion" })).toBeInTheDocument();
  });
});
