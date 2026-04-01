"use client";

import type { UserRole } from "@/app/lib/types";
import { roleOptions } from "@/app/lib/types";

type RolePickerProps = {
  value: UserRole;
  onChange: (role: UserRole) => void;
  label?: string;
};

export default function RolePicker({
  value,
  onChange,
  label = "Local role",
}: RolePickerProps) {
  const selectedRole =
    roleOptions.find((option) => option.value === value) ?? roleOptions[0];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
          {label}
        </label>
        <span className="rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-600">
          {selectedRole.label}
        </span>
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as UserRole)}
        className="w-full rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-sm text-slate-900 shadow-sm"
      >
        {roleOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="text-sm leading-6 text-slate-600">{selectedRole.description}</p>
    </div>
  );
}
