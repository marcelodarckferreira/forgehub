import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

const NEXT: Record<string, "light" | "dark" | "system"> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS = {
  light: "Light theme",
  dark: "Dark theme",
  system: "System theme",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = ICONS[theme];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${LABELS[theme]} — click to switch`}
      title={`${LABELS[theme]} — click to switch`}
      onClick={() => setTheme(NEXT[theme])}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
