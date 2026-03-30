"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export type UserRole = "admin" | "viewer";

interface AuthContextType {
  user: User | null;
  role: UserRole;
  loading: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: "viewer",
  loading: true,
  signOut: async () => {},
  isAdmin: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>("viewer");
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    if (user) {
      // Role from user metadata, default to viewer
      const userRole = (user.user_metadata?.role as UserRole) ?? "viewer";
      setRole(userRole === "admin" ? "admin" : "viewer");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadUser();

    const supabase = getSupabase();
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => subscription.unsubscribe();
  }, [loadUser]);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setRole("viewer");
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut, isAdmin: role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}
