"use client";

import { useState } from "react";

import { useTheme } from "./theme-provider";

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M12 2.8c.52 0 .95.39 1 .9l.17 1.76c.4.12.8.29 1.15.48l1.46-.99a1 1 0 0 1 1.34.14l1.74 1.73c.37.37.43.96.14 1.35l-.98 1.45c.2.37.36.75.48 1.16l1.77.17c.5.05.89.47.89 1v2.45c0 .52-.39.95-.89 1l-1.77.17c-.12.4-.28.8-.48 1.15l.98 1.46a1 1 0 0 1-.14 1.34l-1.74 1.74a1 1 0 0 1-1.34.14l-1.46-.99c-.36.2-.75.36-1.15.48l-.17 1.77a1 1 0 0 1-1 .89H10a1 1 0 0 1-1-.89l-.17-1.77c-.4-.12-.79-.28-1.15-.48l-1.46.99a1 1 0 0 1-1.34-.14L3.14 18.6a1 1 0 0 1-.14-1.34l.99-1.46a5.1 5.1 0 0 1-.48-1.15l-1.77-.17a1 1 0 0 1-.89-1V11a1 1 0 0 1 .89-1l1.77-.17c.12-.4.28-.79.48-1.15L3 7.22a1 1 0 0 1 .14-1.34l1.74-1.73a1 1 0 0 1 1.34-.14l1.46.99c.36-.2.75-.36 1.15-.48l.17-1.77a1 1 0 0 1 1-.89h2Z"
        fill="currentColor"
      />
      <circle cx="12" cy="12" r="3.05" fill="white" />
    </svg>
  );
}

export default function ThemeSettings() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  return (
    <div className="fixed bottom-4 left-4 z-40">
      {open ? (
        <div className="mb-3 w-52 rounded-[1.4rem] border border-[rgba(27,36,48,0.08)] bg-[rgba(255,253,249,0.97)] p-3 shadow-[0_16px_36px_rgba(15,23,42,0.16)]">
          <div className="px-2 pb-2 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-slate-400">
            Theme
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`button-secondary h-10 rounded-full px-4 justify-start ${theme === "light" ? "border-[rgba(49,94,138,0.26)] bg-[rgba(49,94,138,0.08)] text-[#315e8a]" : ""}`}
            >
              Light mode
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`button-secondary h-10 rounded-full px-4 justify-start ${theme === "dark" ? "border-[rgba(49,94,138,0.26)] bg-[rgba(49,94,138,0.08)] text-[#315e8a]" : ""}`}
            >
              Dark mode
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="Theme settings"
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[#111111] text-white shadow-[0_12px_24px_rgba(15,23,42,0.22)]"
      >
        <SettingsIcon />
      </button>
    </div>
  );
}
