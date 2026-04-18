"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/app/components/auth-provider";
import ThemeSettings from "@/app/components/theme-settings";
import { ThemeProvider } from "@/app/components/theme-provider";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        {children}
        <ThemeSettings />
      </AuthProvider>
    </ThemeProvider>
  );
}
