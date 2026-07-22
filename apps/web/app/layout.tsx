import type { Metadata, Viewport } from "next";
import { Bitter, Inter } from "next/font/google";
import "./globals.css";
import { getBaseUrl } from "@/lib/base-url";
import { PageViewTracker } from "./PageViewTracker";

// Bitter = warm slab serif (titles, headings) — cozy and sturdy, fits the toast
// theme. Inter = clean body face. Exposed as CSS variables; base text uses Inter.
const display = Bitter({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: {
    default: "ToastCrumb",
    template: "%s | ToastCrumb",
  },
  description:
    "Build software engineering intuition one concept at a time — lessons drafted by AI, kept only after a stronger model and a human editorial gate approve them.",
  keywords: [
    "software engineering",
    "learn to code",
    "engineering intuition",
    "daily learning",
    "micro-learning",
    "developer education",
  ],
  authors: [{ name: "ToastCrumb" }],
  openGraph: {
    title: "ToastCrumb",
    type: "website",
    siteName: "ToastCrumb",
  },
  twitter: {
    card: "summary",
    title: "ToastCrumb",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f6f9",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh antialiased">
        <PageViewTracker />
        {children}
      </body>
    </html>
  );
}
