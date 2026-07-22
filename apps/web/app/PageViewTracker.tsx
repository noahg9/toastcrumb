"use client";

// App-wide page_view emitter (Story 14.2). The root layout is a server
// component with no client provider or route-change hook to extend, so this
// small client component is mounted once in the layout's <body> and fires a
// `page_view` event on every client-side route change.
//
// Uses `usePathname()` (NOT the full URL) on purpose: it excludes the query
// string, so a sensitive param like the OAuth `?token=...` on /auth/callback
// never lands in the PII-free `props`. Fire-and-forget via track() — never
// throws, never affects rendering or navigation.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";

export function PageViewTracker() {
  const pathname = usePathname();
  // Guards against React StrictMode's dev-mode double-invoke (mirrors the
  // one-shot-effect guard used elsewhere, e.g. SessionPlayer's `startedRef`) —
  // without it, every route change would double-fire `page_view` in dev.
  const firedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname || firedForRef.current === pathname) return;
    firedForRef.current = pathname;
    track("page_view", { path: pathname }, "app");
  }, [pathname]);
  return null;
}
