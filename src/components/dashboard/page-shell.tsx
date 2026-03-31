import { ReactNode } from "react";

interface PageShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <div className="space-y-5 p-6 lg:p-8 max-w-[1440px]">
      <div>
        <h1 className="text-heading">{title}</h1>
        {description && (
          <p className="text-caption mt-1">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
