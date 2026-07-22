export function getBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_URL;
  if (!raw) return "http://localhost:3000";
  return raw.replace(/\/$/, "");
}
