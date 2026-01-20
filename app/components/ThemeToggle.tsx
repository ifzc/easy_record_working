"use client";

import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "easy-record-theme";

const preferenceLabels: Record<ThemePreference, string> = {
  system: "跟随系统",
  light: "明亮模式",
  dark: "暗黑模式",
};

const cycleOrder: ThemePreference[] = ["system", "light", "dark"];

type ThemeToggleProps = {
  className?: string;
};

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" ry="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </svg>
  );
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
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

  function handleToggle() {
    const currentIndex = cycleOrder.indexOf(preference);
    const next = cycleOrder[(currentIndex + 1) % cycleOrder.length];
    setPreference(next);
    applyPreference(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  const label = preferenceLabels[preference];
  const icon =
    preference === "light" ? (
      <SunIcon className="h-4 w-4" />
    ) : preference === "dark" ? (
      <MoonIcon className="h-4 w-4" />
    ) : (
      <MonitorIcon className="h-4 w-4" />
    );

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--border)] text-[color:var(--muted-foreground)] transition hover:text-foreground",
        className,
      )}
      aria-label={`主题模式：${label}`}
      title={label}
    >
      {icon}
    </button>
  );
}
