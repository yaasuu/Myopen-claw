import { ReactNode } from "react";

interface PageShellProps {
  title?: string;
  description?: string;
  children: ReactNode;
}

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <div className="p-5 lg:p-6" style={{ maxWidth: "1440px" }}>
      {title && (
        <div className="mb-5">
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            {title}
          </h1>
          {description && (
            <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>
              {description}
            </p>
          )}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
