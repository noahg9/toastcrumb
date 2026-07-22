// First-party behavioral event capture (Story 14.2, Epic 14).
//
// `track(name, props?, surface?)` buffers an event in memory and flushes the
// buffer to `POST /users/:id/events` on a short interval and on page unload.
// This is the browser-side twin of lib/api.ts's `recordQuizOutcomes` idiom:
// best-effort, fire-and-forget, and — the load-bearing guarantee — it NEVER
// throws and NEVER affects XP / streak / FSRS / Progress / navigation (the
// Story 10.5 telemetry boundary). Every failure is swallowed.
//
// PII discipline (contract): `props` carries ids / indices / booleans only —
// never free-text answers, emails, or names. Enforced at the call sites, not here.
//
// Not a React module — a plain singleton buffer shared across the tab. Safe to
// import from any client component; all browser-API access is guarded so an
// accidental server-side import is inert.
import { MAX_EVENTS_BATCH, type EventInput, type EventName } from "@toastcrumb/types";
import { getStoredUserId, recordEvents } from "./api";

// Per-tab page-session id so Story 14.3 can compute sessions / session length.
// Minted once per page-session and kept in sessionStorage (cleared when the tab
// closes — exactly the "session" grain we want). Guarded like lib/api.ts's
// localStorage helpers: Safari ITP / private mode can throw on access.
const SESSION_ID_KEY = "toastcrumb_session_id";

function getSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      // No crypto dependency needed — a random+time id is unique enough per tab.
      id = `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return undefined; // storage unavailable — events still send, just un-sessioned
  }
}

// Flush cadence and safety bounds.
const FLUSH_INTERVAL_MS = 5_000;
// Cap the in-memory buffer so a learner who never bootstraps a userId (events
// can't be sent without one) can't grow it unbounded; oldest events drop first.
const MAX_BUFFER = 500;

let buffer: EventInput[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

function scheduleFlush(): void {
  if (flushTimer !== null || typeof window === "undefined") return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

// Send chunks (up to MAX_EVENTS_BATCH each) if a userId exists. Events buffered
// before the anonymous user is bootstrapped simply wait — they flush on the
// next tick once an id is present. `keepalive` lets an unload flush finish in
// flight: on the unload path we drain the ENTIRE buffer now (every chunk
// keepalive), rather than sending one chunk and scheduling a plain, non-keepalive
// retry for the rest — that retry fires after FLUSH_INTERVAL_MS, by which point
// the tab has typically already gone and the request would never complete.
function flush(keepalive = false): void {
  try {
    const userId = getStoredUserId();
    if (!userId) return; // no owner yet — keep buffered for a later flush
    if (keepalive) {
      while (buffer.length > 0) {
        const batch = buffer.splice(0, MAX_EVENTS_BATCH);
        // recordEvents throws on non-ok; swallow here so telemetry never surfaces.
        recordEvents(userId, batch, true).catch(() => {});
      }
      return;
    }
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, MAX_EVENTS_BATCH);
    recordEvents(userId, batch, false).catch(() => {});
    // More than one chunk buffered — drain the rest on the next interval.
    if (buffer.length > 0) scheduleFlush();
  } catch {
    /* never throw from telemetry */
  }
}

// Bind unload flushes once, lazily on first track(). `visibilitychange`→hidden
// is the reliable "page going away" signal on mobile (pagehide/unload are not
// always fired); `pagehide` covers bfcache/desktop. Both flush with keepalive.
function bindUnloadListeners(): void {
  if (listenersBound || typeof document === "undefined") return;
  listenersBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
}

/**
 * Record a behavioral event (Story 14.2). Fire-and-forget: buffers in memory
 * and flushes on an interval / on unload. Never throws. `props` must be
 * PII-free (ids / indices / booleans). `surface` names the emitting surface
 * ("lesson" | "session" | "daily" | "auth" | "app").
 */
export function track(
  name: EventName,
  props?: Record<string, unknown>,
  surface?: string,
): void {
  try {
    if (typeof window === "undefined") return; // no-op during SSR
    bindUnloadListeners();
    buffer.push({
      name,
      props: props ?? undefined,
      surface: surface ?? undefined,
      sessionId: getSessionId(),
    });
    if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
    scheduleFlush();
  } catch {
    /* never throw from telemetry */
  }
}
