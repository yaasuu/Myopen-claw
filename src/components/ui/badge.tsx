import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:outline-[var(--accent)]/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-[var(--bg)] [a]:hover:bg-[var(--accent)]/80",
        secondary:
          "bg-[var(--surface-muted)] text-[var(--text)] [a]:hover:bg-[var(--surface-muted)]/80",
        destructive:
          "bg-[var(--danger)]/10 text-[var(--danger)] focus-visible:ring-destructive/20 dark:bg-[var(--danger)]/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-[var(--danger)]/20",
        outline:
          "border-[var(--border)] text-[var(--text)] [a]:hover:bg-[var(--surface-muted)] [a]:hover:text-[var(--text-muted)]",
        ghost:
          "hover:bg-[var(--surface-muted)] hover:text-[var(--text-muted)] dark:hover:bg-[var(--surface-muted)]/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
