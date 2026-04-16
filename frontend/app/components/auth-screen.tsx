"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { useAuth } from "./auth-provider";

function AppLogo() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#111111] shadow-[0_10px_20px_rgba(15,23,42,0.16)]">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-white">
        <path d="M12 5.5 18.2 16H5.8L12 5.5Z" />
      </svg>
    </div>
  );
}

export default function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { login, register, seedCredentials, status } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState(mode === "login" ? seedCredentials.email : "");
  const [password, setPassword] = useState(mode === "login" ? seedCredentials.password : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next =
    typeof window === "undefined"
      ? "/"
      : new URLSearchParams(window.location.search).get("next") || "/";

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(next);
    }
  }, [next, router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await register({ name, email, password });
      }
      router.replace(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell min-h-screen flex-1 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <section className="surface-card rounded-[2rem] p-8 sm:p-10">
          <div className="mx-auto max-w-md">
            <div className="mb-8 flex items-center gap-4">
              <AppLogo />
              <div>
                <p className="section-label">Document workspace</p>
                <h1 className="text-[2rem] font-semibold tracking-tight text-slate-900">
                  {mode === "login" ? "Sign in" : "Create account"}
                </h1>
              </div>
            </div>

            <p className="section-label">{mode === "login" ? "Login" : "Register"}</p>
            <h2 className="mt-2 text-[2rem] font-semibold tracking-tight text-slate-900">
              {mode === "login" ? "Sign in to continue" : "Create your account"}
            </h2>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {mode === "register" ? (
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  className="field"
                  required
                />
              ) : null}

              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email address"
                type="email"
                className="field"
                required
              />

              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
                className="field"
                required
                minLength={8}
              />

              <button type="submit" disabled={submitting} className="button-primary h-12 w-full rounded-full">
                {submitting
                  ? mode === "login"
                    ? "Signing in..."
                    : "Creating account..."
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>

            {error ? <div className="notice notice-error mt-4">{error}</div> : null}

            <div className="mt-5 text-sm text-slate-600">
              {mode === "login" ? (
                <>
                  Need an account?{" "}
                  <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-semibold text-[#315e8a]">
                    Register here
                  </Link>
                </>
              ) : (
                <>
                  Already registered?{" "}
                  <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-[#315e8a]">
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
