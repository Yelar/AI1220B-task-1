"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "./auth-provider";

function navigateTo(url: string, replace: (href: string) => void) {
  if (typeof window !== "undefined" && !window.navigator.userAgent.includes("jsdom")) {
    window.location.replace(url);
    return;
  }

  replace(url);
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== "guest") {
      return;
    }

    const query = typeof window === "undefined" ? "" : window.location.search;
    const next = `${pathname}${query}`;
    navigateTo(`/login?next=${encodeURIComponent(next)}`, router.replace);
  }, [pathname, router, status]);

  if (status !== "authenticated") {
    return (
      <main className="app-shell min-h-screen flex-1 px-4 py-8 sm:px-6">
        <div className="surface-card mx-auto flex w-full max-w-xl flex-col gap-3 rounded-[2rem] p-8 text-center">
          <p className="section-label">Authentication</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            {status === "loading" ? "Checking your session" : "Redirecting to sign in"}
          </h1>
          <p className="text-sm leading-7 text-slate-600">
            {status === "loading"
              ? "The frontend is validating the stored session and preparing protected routes."
              : "Protected pages require an authenticated session."}
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
