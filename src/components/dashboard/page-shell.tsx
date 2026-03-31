import { ReactNode } from "react";

interface PageShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <div className="space-y-5 p-6 lg:p-8" style={{ maxWidth: "1440px" }}>
      <div>
        <h1 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          {title}
        </h1>
        {description && (
          <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
