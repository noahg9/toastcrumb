"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE, login, mergeAnonymousUser } from "@/lib/api";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token, user } = await login(email, password);
      let prevId: string | null = null;
      let hadJwt = false;
      try {
        prevId = localStorage.getItem("toastcrumb_user_id");
        hadJwt = !!localStorage.getItem("toastcrumb_jwt");
      } catch {
        /* localStorage unavailable (Safari ITP / private mode) */
      }
      try {
        localStorage.setItem("toastcrumb_jwt", token);
        localStorage.setItem("toastcrumb_user_id", user.id);
      } catch {
        /* localStorage unavailable (Safari ITP / private mode) */
      }
      // Story 14.2: behavioral sign-in event. PII-free — method only, never the
      // email. Fired after the id is stored so track() can attribute the flush.
      track("sign_in", { method: "password" }, "auth");
      if (prevId && !hadJwt && prevId !== user.id) {
        try {
          await mergeAnonymousUser(prevId, user.id);
        } catch {
          /* swallow — a failed merge must never fail sign-in (AC 7) */
        }
      }
      setSubmitting(false);
      router.replace("/learn");
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(
        code === "invalid_credentials"
          ? "Incorrect email or password."
          : "Sign in failed. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link
            href="/"
            className="font-display text-2xl font-bold tracking-tight hover:opacity-80 transition-opacity"
            style={{ color: "var(--tc-ink)" }}
          >
            ToastCrumb
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to keep your progress across devices.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full font-bold"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="relative flex items-center">
              <Separator className="flex-1" />
              <span className="mx-3 text-xs text-muted-foreground shrink-0">or</span>
              <Separator className="flex-1" />
            </div>

            <Button variant="outline" className="w-full rounded-full" asChild>
              <a href={`${API_BASE}/auth/google`}>Continue with Google</a>
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          New here?{" "}
          <Link
            href="/auth/register"
            className="font-semibold text-[var(--color-brand-text)] hover:opacity-80 transition-opacity"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
