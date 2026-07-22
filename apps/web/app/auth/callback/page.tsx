import { Suspense } from "react";
import { AuthCallbackInner } from "./AuthCallbackInner";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh flex items-center justify-center">
          <p className="font-mono text-sm text-muted-foreground">Signing in…</p>
        </main>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
