"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStoredUserId } from "@/lib/api";

// A returning user (an anonymous or signed-in id is already stored) gets a
// "Continue learning" affordance inviting them back into the skill tree, rather
// than being auto-redirected away from the marketing landing. First-time
// visitors (no stored id) render nothing.
//
// Whether a visitor is returning can only be known on the client (localStorage),
// so this renders nothing on the server and until mount. It is positioned
// `fixed` on purpose: injecting it after hydration must not reflow the landing
// page (a banner in the document flow would shove the hero down — visible CLS).
export function ReturningUserBanner() {
  const [isReturning, setIsReturning] = useState(false);

  useEffect(() => {
    setIsReturning(getStoredUserId() != null);
  }, []);

  if (!isReturning) return null;

  return (
    <Link
      href="/learn"
      className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-1.5 px-5 py-3 rounded-full text-sm font-semibold shadow-lg transition-opacity hover:opacity-90 active:scale-[0.98]"
      style={{ background: "var(--color-brand)", color: "#3d2200" }}
    >
      Continue learning →
    </Link>
  );
}
