import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { Login } from "../pages/Login";

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Login />;
  return <>{children}</>;
}
