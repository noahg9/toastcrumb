import type { Metadata } from "next";
import { MapShell } from "@/components/MapShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <MapShell>{children}</MapShell>;
}
