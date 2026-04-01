"use client";

import { useAuth } from "@/lib/auth/context";

/**
 * Returns true if the current user has write access.
 * When auth is disabled (no user), everyone has write access.
 */
export function useCanWrite(): boolean {
  const { isAdmin, user } = useAuth();
  // If auth is not configured (no user), allow all writes
  if (!user) return true;
  return isAdmin;
}
