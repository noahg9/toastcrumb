"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AccountLink() {
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

  if (!mounted || !hasJwt) return null;

  return (
    <Button variant="ghost" size="sm" asChild className="shrink-0">
      <Link href="/account">Account</Link>
    </Button>
  );
}
