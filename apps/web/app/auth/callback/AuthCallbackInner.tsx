"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { mergeAnonymousUser } from "@/lib/api";
import { track } from "@/lib/analytics";

function userIdFromToken(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed jwt");
  const payload = JSON.parse(
    atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
  );
  const userId = payload.sub as string | undefined;
  if (!userId) throw new Error("no sub");
  return userId;
}

export function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    void (async () => {
      const token = params.get("token");
      if (!token) {
        router.replace("/auth/error");
        return;
      }
      let userId: string;
      try {
        userId = userIdFromToken(token);
      } catch {
        router.replace("/auth/error");
        return;
      }
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
        localStorage.setItem("toastcrumb_user_id", userId);
      } catch {
        /* localStorage unavailable (Safari ITP / private mode) */
      }
      try {
        history.replaceState(null, "", "/auth/callback");
      } catch {
        /* history API unavailable */
      }
      // Story 14.2: behavioral sign-in/register via Google OAuth. PII-free —
      // method only. isNewUser (set by the API's googleCallback) distinguishes
      // a brand-new Google signup from a returning/linked account so the OAuth
      // channel isn't undercounted in `register`.
      const isNewUser = params.get("isNewUser") === "1";
      track(isNewUser ? "register" : "sign_in", { method: "google" }, "auth");
      if (prevId && !hadJwt && prevId !== userId) {
        try {
          await mergeAnonymousUser(prevId, userId);
        } catch {
          /* swallow — a failed merge must never fail sign-in */
        }
      }
      router.replace("/learn");
    })();
  }, [params, router]);

  return (
    <main className="min-h-dvh flex items-center justify-center">
      <p className="font-mono text-sm text-muted-foreground">Signing in…</p>
    </main>
  );
}
