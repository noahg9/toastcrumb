"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Landing-page "Sign in" link, styled to match the landing header.
// Hidden once a JWT is present so signed-in users don't see it.
export function LandingSignIn() {
  const [mounted, setMounted] = useState(false);
  const [hasJwt, setHasJwt] = useState(false);

  useEffect(() => {
    let jwt: string | null = null;
    try {
      jwt = localStorage.getItem("toastcrumb_jwt");
    } catch {
      /* localStorage unavailable (private mode) */
    }
    setHasJwt(!!jwt);
    setMounted(true);
  }, []);

  if (!mounted || hasJwt) return null;

  return (
    <Link
      href="/auth/sign-in"
      className="text-sm hidden sm:block transition-opacity hover:opacity-70"
      style={{ color: "var(--color-fg-muted)" }}
    >
      Sign in
    </Link>
  );
}
