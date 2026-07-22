// apps/web/lib/og-daily.tsx — SERVER ONLY (satori render, not the DOM).
//
// One shared builder for every daily-surface Open Graph image (Story 8.5). The
// `opengraph-image.tsx` route files (today / dated / archive) do the server-side
// day math (via lib/daily.ts) and pass plain primitives in here, so this module
// stays pure JSX + `next/og` and imports no server-only day logic itself.
//
// The JSX below is rendered by satori (via ImageResponse), NOT the DOM: flexbox
// only, inline styles only, no Tailwind classes, no DOM APIs. Colors are the
// brand hexes from globals.css, inlined. The renderer's built-in font is used
// (no network fetch at render time, which would fail the route).
import { ImageResponse } from "next/og";

/** Social-card canonical dimensions — re-exported by every image route. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

// Inlined from globals.css design tokens. The OG card commits to a single
// (dark) look — it renders once server-side and is not theme-aware.
const INK = "#0e1520";
const TEXT = "#e6edf3";
const MUTED = "#8b98a5";
const BRAND = "#ffb454";

export interface DailyOgOptions {
  /** Small uppercase kicker, e.g. "TOASTCRUMB DAILY". */
  eyebrow: string;
  /** Hero line, e.g. "Daily #42" or "Daily Archive". */
  heading: string;
  /** Optional secondary line, e.g. the human date. */
  subheading?: string;
  /** Optional spoiler-free concept topic chip (NEVER the answer/explanation). */
  concept?: string;
  /** Bottom hook line. */
  tagline: string;
  /**
   * Cache-Control override. next/og's file-convention routes default to a
   * year-long `immutable` header regardless of the route's `dynamic`/`revalidate`
   * config, which is wrong for a render whose content depends on the CURRENT day
   * (e.g. the today/future/malformed fallback card) — a CDN/crawler that caches
   * that URL "today" would keep serving it long after the day moves on. Callers
   * whose render is genuinely day-invariant (a resolved past day, the archive
   * card) may omit this to keep the framework default.
   */
  cacheControl?: string;
}

/**
 * Build a 1200×630 branded, spoiler-free daily OG card. Never pass the
 * question, options, correct answer, or explanation — only the day identity,
 * date, and (optionally) the concept topic (public per Story 8.4 AC 8).
 */
export function renderDailyOg({
  eyebrow,
  heading,
  subheading,
  concept,
  tagline,
  cacheControl,
}: DailyOgOptions): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: INK,
          color: TEXT,
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand accent strip */}
        <div style={{ display: "flex", height: 14, background: BRAND }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "72px 80px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                letterSpacing: 6,
                color: BRAND,
                fontWeight: 700,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 96,
                fontWeight: 800,
                marginTop: 24,
                lineHeight: 1.05,
              }}
            >
              {heading}
            </div>
            {subheading ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 34,
                  color: MUTED,
                  marginTop: 16,
                }}
              >
                {subheading}
              </div>
            ) : null}
            {concept ? (
              <div
                style={{
                  display: "flex",
                  alignSelf: "flex-start",
                  marginTop: 36,
                  padding: "12px 26px",
                  fontSize: 30,
                  fontWeight: 600,
                  color: BRAND,
                  background: "rgba(255,180,84,0.12)",
                  border: "1px solid rgba(255,180,84,0.4)",
                  borderRadius: 999,
                }}
              >
                {concept}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  display: "flex",
                  width: 28,
                  height: 28,
                  background: BRAND,
                  borderRadius: 8,
                  marginRight: 14,
                }}
              />
              <div style={{ display: "flex", fontSize: 32, fontWeight: 800 }}>
                ToastCrumb
              </div>
            </div>
            <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
              {tagline}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      headers: cacheControl ? { "Cache-Control": cacheControl } : undefined,
    },
  );
}
