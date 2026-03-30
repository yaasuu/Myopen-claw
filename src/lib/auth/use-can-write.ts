"use client";

import { useAuth } from "@/lib/auth/context";

/**
 * Returns true if the current user has write access (admin role).
 * Use this to conditionally show/hide write actions.
 */
export function useCanWrite(): boolean {
  const { isAdmin } = useAuth();
  return isAdmin;
}
