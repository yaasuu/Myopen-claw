"use client";

import { useTheme } from "@/lib/theme/provider";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Monitor } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const next = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 rounded-lg p-0 hover-surface focus-ring"
      onClick={next}
      title={`Theme: ${label}`}
    >
      <Icon className="h-[16px] w-[16px]" style={{ color: "var(--text-quiet)" }} />
    </Button>
  );
}
