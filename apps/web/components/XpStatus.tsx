"use client";

import { useEffect, useState } from "react";
import { getStoredUserId, getUser } from "@/lib/api";
import type { User } from "@toastcrumb/types";
import { Badge } from "@/components/ui/badge";

export function XpStatus() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const stored = getStoredUserId();
    if (!stored) return;
    getUser(stored)
      .then(setUser)
      .catch(() => {
        /* silent — graceful degradation */
      });
  }, []);

  if (!user) return null;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Badge variant="secondary" className="font-mono text-[11px] gap-1.5">
        <span className="text-[var(--color-brand-text)]">Lv {user.level}</span>
        <span className="text-muted-foreground">· {user.xp} xp</span>
      </Badge>
      {user.streak >= 1 && (
        <Badge variant="outline" className="font-mono text-[11px]">
          🔥 {user.streak}
        </Badge>
      )}
    </div>
  );
}
