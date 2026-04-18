import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuthScreen from "@/app/components/auth-screen";

const { replace, login, register } = vi.hoisted(() => ({
  replace: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/app/components/auth-provider", () => ({
  useAuth: () => ({
    login,
    register,
    status: "guest",
  }),
}));

describe("AuthScreen", () => {
  beforeEach(() => {
    replace.mockReset();
    login.mockReset();
    register.mockReset();
    window.history.replaceState({}, "", "/login?next=%2F");
  });

  it("submits the login form", async () => {
    login.mockResolvedValue(undefined);

    render(<AuthScreen mode="login" />);

    fireEvent.change(screen.getByPlaceholderText("Email address"), {
      target: { value: "owner@local.test" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "demo12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        email: "owner@local.test",
        password: "demo12345",
      })
    );
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("submits the registration form", async () => {
    register.mockResolvedValue(undefined);
    window.history.replaceState({}, "", "/register?next=%2Fdocuments%2F1");

    render(<AuthScreen mode="register" />);

    fireEvent.change(screen.getByPlaceholderText("Your name"), {
      target: { value: "Abdullah" },
    });
    fireEvent.change(screen.getByPlaceholderText("Email address"), {
      target: { value: "abdullah@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "demo12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        name: "Abdullah",
        email: "abdullah@example.com",
        password: "demo12345",
      })
    );
    expect(replace).toHaveBeenCalledWith("/documents/1");
  });
});
