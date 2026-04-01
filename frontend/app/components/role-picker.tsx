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
        <label className="section-label">{label}</label>
        <span className="pill">
          {selectedRole.label}
        </span>
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as UserRole)}
        className="field-select"
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
