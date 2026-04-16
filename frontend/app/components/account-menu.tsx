"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { AuthUser } from "@/app/lib/types";

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="m7 10 5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function AccountMenu({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const initials = initialsFor(user.name || user.email);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className="button-secondary flex h-11 items-center gap-3 rounded-full px-3.5"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-[0.74rem] font-semibold text-white">
          {initials}
        </span>
        <span className="text-left leading-tight">
          <span className="block text-[0.85rem] font-semibold text-slate-900">{user.name}</span>
        </span>
        <ChevronDownIcon />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-72 rounded-[1.2rem] border border-[rgba(27,36,48,0.08)] bg-[rgba(255,253,249,0.98)] p-3 shadow-[0_18px_36px_rgba(15,23,42,0.12)]"
        >
          <div className="rounded-[1rem] bg-[rgba(244,241,234,0.72)] px-3 py-3">
            <div className="text-sm font-semibold text-slate-900">{user.name}</div>
            <div className="mt-1 text-sm text-slate-500">{user.email}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
            className="button-secondary mt-3 flex h-10 w-full justify-start rounded-full px-4 text-[#9f3d2b] hover:bg-[rgba(159,61,43,0.06)]"
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
