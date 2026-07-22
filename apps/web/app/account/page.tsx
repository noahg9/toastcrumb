"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getStoredUserId, getUser } from "@/lib/api";
import type { User } from "@toastcrumb/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { MapShell } from "@/components/MapShell";

export default function AccountPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let jwt: string | null = null;
    try {
      jwt = localStorage.getItem("toastcrumb_jwt");
    } catch {
      /* localStorage unavailable (private mode) */
    }
    const userId = getStoredUserId();
    if (!jwt || !userId) {
      router.replace("/");
      return;
    }
    setMounted(true);
    getUser(userId)
      .then(setUser)
      .catch(() => {
        router.replace("/");
      });
  }, [router]);

  function signOut() {
    try {
      localStorage.removeItem("toastcrumb_jwt");
      localStorage.removeItem("toastcrumb_user_id");
    } catch {
      /* localStorage unavailable (private mode) */
    }
    window.location.assign("/");
  }

  if (!mounted || !user) return null;

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : (user.email?.[0]?.toUpperCase() ?? "?");

  return (
    <MapShell>
      <main className="relative mx-auto max-w-sm px-5 py-12">
        <Link
          href="/learn"
          className="mb-8 inline-block font-mono text-xs tracking-wide hover:opacity-80 transition-opacity"
          style={{ color: "var(--tc-ink-mute)" }}
        >
          ← back to the map
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <Avatar className="h-14 w-14">
            <AvatarFallback
              className="text-base font-bold"
              style={{
                background: "var(--color-brand-bg)",
                color: "var(--color-brand-text)",
              }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight" style={{ color: "var(--tc-ink)" }}>
              {user.name ?? "Your account"}
            </h1>
            {user.email && (
              <p className="text-sm" style={{ color: "var(--tc-ink-mute)" }}>{user.email}</p>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <dl className="space-y-0 text-sm">
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted-foreground">XP</dt>
                <dd className="font-mono font-semibold">{user.xp}</dd>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted-foreground">Level</dt>
                <dd>
                  <Badge variant="secondary" className="font-mono">
                    Lv {user.level}
                  </Badge>
                </dd>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted-foreground">Streak</dt>
                <dd className="font-mono font-semibold">
                  {user.streak >= 1 ? `🔥 ${user.streak}` : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          onClick={signOut}
          className="mt-6 w-full rounded-full"
        >
          Sign out
        </Button>
      </main>
    </MapShell>
  );
}
