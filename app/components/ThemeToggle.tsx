"use client";

import { useEffect, useState } from "react";

type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "easy-record-theme";

const options: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "明亮模式" },
  { value: "dark", label: "暗黑模式" },
];

export default function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: ThemePreference =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";

    applyPreference(initial);
    setPreference(initial);
  }, []);

  function applyPreference(next: ThemePreference) {
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
      return;
    }

    document.documentElement.dataset.theme = next;
  }

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as ThemePreference;
    setPreference(next);
    applyPreference(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
      <span className="sr-only">主题模式</span>
      <select
        value={preference}
        onChange={handleChange}
        className="rounded-full border border-[color:var(--border)] bg-transparent px-3 py-1 text-xs font-medium text-[color:var(--muted-foreground)] transition hover:text-foreground"
        aria-label="主题模式"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
