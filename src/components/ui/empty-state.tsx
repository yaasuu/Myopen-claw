import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/50 bg-muted/30 mb-4">
        <Icon className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <h3 className="text-sm font-semibold mb-1.5" style={{ color: "var(--text)" }}>{title}</h3>
      <p className="text-xs text-muted-foreground max-w-xs mb-5 leading-relaxed">{message}</p>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
