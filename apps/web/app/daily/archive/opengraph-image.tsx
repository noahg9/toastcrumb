import { OG_CONTENT_TYPE, OG_SIZE, renderDailyOg } from "@/lib/og-daily";

// Static branded card — no day math, no fs — but kept on nodejs for parity with
// the other daily image routes.
export const runtime = "nodejs";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "ToastCrumb Daily Archive — catch up on any day you missed";

export default function Image() {
  return renderDailyOg({
    eyebrow: "TOASTCRUMB",
    heading: "Daily Archive",
    tagline: "Catch up on any day you missed.",
  });
}
