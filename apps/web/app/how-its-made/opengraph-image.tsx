import { OG_CONTENT_TYPE, OG_SIZE, renderDailyOg } from "@/lib/og-daily";

// Static branded card — no day math, no fs — but kept on nodejs for parity with
// the other daily image routes.
export const runtime = "nodejs";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "How a ToastCrumb lesson gets made — drafted by AI, judged by a stronger model, kept only if a human agrees.";

export default function Image() {
  return renderDailyOg({
    eyebrow: "TOASTCRUMB",
    heading: "How it's made",
    tagline: "AI drafts. A human decides what's good enough.",
  });
}
