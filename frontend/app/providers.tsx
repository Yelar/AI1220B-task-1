"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/app/components/auth-provider";

export default function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
