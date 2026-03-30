import { ReactNode } from "react";

interface PageShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-[1400px]">
      <div>
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="page-description">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
