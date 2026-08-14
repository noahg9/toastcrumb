import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { getBaseUrl } from "@/lib/base-url";
import { PageViewTracker } from "./PageViewTracker";

// Bitter = warm slab serif (titles, headings) — cozy and sturdy, fits the toast
// theme. Inter = clean body face. Exposed as CSS variables; base text uses Inter.
//
// Self-hosted, NOT next/font/google. The Google loader fetches the .woff2 files
// from fonts.gstatic.com during `next build`, which makes every deploy depend on
// Google answering: a build failed with
//   NextFontError: Failed to fetch `Bitter` from Google Fonts.
//   > Build failed because of webpack errors
// while the identical commit built fine three minutes later. A deploy must not be
// able to fail for a reason that has nothing to do with the code, so the files
// live in the repo (./fonts, ~80 KB for both) and the build touches no network.
//
// These are the LATIN subset of each variable font, matching the `subsets:
// ["latin"]` the Google loader was configured with — the weight axis is
// continuous, so one file covers every weight the design uses. To refresh them,
// re-download the latin @font-face src from
// https://fonts.googleapis.com/css2?family=Bitter:wght@400..800 (and Inter) with
// a modern browser User-Agent, or the API serves .ttf instead of .woff2.
const display = localFont({
  src: "./fonts/bitter-latin-var.woff2",
  variable: "--font-display",
  weight: "400 800",
  display: "swap",
});
const sans = localFont({
  src: "./fonts/inter-latin-var.woff2",
  variable: "--font-sans",
  weight: "100 900",
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
