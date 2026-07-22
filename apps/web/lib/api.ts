// Client-side API wrappers for the toastcrumb NestJS backend (docs/ARCHITECTURE.md).
// Plain `fetch` — no external HTTP library. This module is browser-only: it reads
// NEXT_PUBLIC_API_URL and never touches `node:fs` (contrast with lib/content.ts,
// which is server-only). Do not cross-import the two.
import type {
  AuthResponse,
  EventInput,
  QuizOutcome,
  ReviewState,
  User,
} from "@toastcrumb/types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

// Returns an Authorization header when a signed-in account's JWT is present in
// localStorage, or an empty object for the anonymous guest. Wrapped in try/catch
// because Safari ITP / Private Browsing can throw on localStorage access. Kept
// module-private — pages never set the Bearer header themselves.
function jwtHeaders(): Record<string, string> {
  let jwt: string | null = null;
  try {
    jwt = localStorage.getItem("toastcrumb_jwt");
  } catch {
    /* localStorage unavailable (private mode) */
  }
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

// localStorage key for the anonymous/signed-in user's id (a cuid). Guests have
// no value here. All reads/writes go through the two helpers below so the key
// name and the Safari-ITP/private-mode guard live in exactly one place.
const USER_ID_KEY = "toastcrumb_user_id";

// Safely read the persisted user id. Returns null for a guest, or when
// localStorage is unavailable (Safari ITP / private mode throws on access) —
// callers treat both the same (first-time visitor).
export function getStoredUserId(): string | null {
  try {
    return localStorage.getItem(USER_ID_KEY);
  } catch {
    return null;
  }
}

// Safely persist the user id. No-op when localStorage is unavailable.
export function setStoredUserId(id: string): void {
  try {
    localStorage.setItem(USER_ID_KEY, id);
  } catch {
    /* localStorage unavailable (private mode) */
  }
}

// Create an anonymous user (no signup). Returns `{ id: string }`; the cuid is
// persisted in localStorage under "toastcrumb_user_id". Intentionally NOT
// authenticated — anonymous user creation must work without a JWT (Story 7.3).
export async function createUser(): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/users`, { method: "POST" });
  if (!res.ok) throw new Error(`createUser failed: ${res.status}`);
  return res.json();
}

// Read the persisted user row (xp, level, …). Throws on a non-ok response so
// the caller can swallow it (graceful degradation — Story 4.2). Sends the
// account JWT when signed in (Story 7.3).
export async function getUser(userId: string): Promise<User> {
  const res = await fetch(`${API_BASE}/users/${userId}`, {
    headers: jwtHeaders(),
  });
  if (!res.ok) throw new Error(`getUser failed: ${res.status}`);
  return res.json();
}

// Persist lesson XP on completion and return the updated user row (new xp +
// level — consumed by Story 4.2 to show the accumulated total / level-up).
// `conceptId` records the concept as completed server-side (Story 4.4); the
// returned row then also carries the updated `completedConcepts` / `currentNode`
// (response-carries-state). Throws on a non-ok response so the caller can
// swallow it (graceful degradation). Sends the account JWT when signed in.
export async function completeLesson(
  userId: string,
  correctQuizzes: number,
  conceptId: string,
): Promise<User> {
  const res = await fetch(`${API_BASE}/users/${userId}/lesson-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...jwtHeaders() },
    body: JSON.stringify({ correctQuizzes, conceptId }),
  });
  if (!res.ok) throw new Error(`completeLesson failed: ${res.status}`);
  return res.json();
}

// Read the spaced-review state for one (user, concept) (Story 9.2). Returns the
// row — or `null` when the concept was never introduced/reviewed (the API
// returns null, not a 404). The review route reads `lastVariantId` from this to
// pick a not-recently-seen variant. Sends the account JWT when signed in.
export async function getReviewState(
  userId: string,
  conceptId: string,
): Promise<ReviewState | null> {
  const res = await fetch(`${API_BASE}/users/${userId}/reviews/${conceptId}`, {
    headers: jwtHeaders(),
  });
  if (!res.ok) throw new Error(`getReviewState failed: ${res.status}`);
  return res.json();
}

// Read the user's currently-due review rows (Story 9.3) — the daily-session
// composer maps each row's `conceptId` (+ `lastVariantId`) to content web-side.
// Returns `[]` when nothing is due (the API returns an array, never a 404).
// Rows serialize with Date → ISO strings, matching the shared ReviewState
// interface (`due: string`, etc.). Sends the account JWT when signed in.
export async function listDueReviews(userId: string): Promise<ReviewState[]> {
  const res = await fetch(`${API_BASE}/users/${userId}/reviews`, {
    headers: jwtHeaders(),
  });
  if (!res.ok) throw new Error(`listDueReviews failed: ${res.status}`);
  return res.json();
}

// Read ALL of the user's review rows (Story 9.6), not just the due subset — the
// skill tree derives per-concept mastery tiers (learning/reviewing/durable) from
// every completed concept's live FSRS strength via `lib/mastery.ts`. Hits the
// same collection route with `?scope=all`; `listDueReviews` (the session
// composer's read) is unchanged. Returns `[]` when the user has no rows yet.
export async function getAllReviews(userId: string): Promise<ReviewState[]> {
  const res = await fetch(`${API_BASE}/users/${userId}/reviews?scope=all`, {
    headers: jwtHeaders(),
  });
  if (!res.ok) throw new Error(`getAllReviews failed: ${res.status}`);
  return res.json();
}

// Mark today's daily session complete (Story 9.3) — a streak-only credit that
// keeps a reviews-only day's streak alive. Awards NO XP and writes NO
// completion server-side; same-day idempotent. Returns the updated user row so
// the done screen can show the streak. No body (id is a path param). Throws on
// a non-ok response so the caller can swallow it. Sends the account JWT.
export async function completeSession(userId: string): Promise<User> {
  const res = await fetch(`${API_BASE}/users/${userId}/session-complete`, {
    method: "POST",
    headers: jwtHeaders(),
  });
  if (!res.ok) throw new Error(`completeSession failed: ${res.status}`);
  return res.json();
}

// Record the variant just served as a review so rotation advances even if the
// review is abandoned (record-on-serve, Story 9.2). Writes only `lastVariantId`
// server-side — no XP/streak/Progress/FSRS grade (crediting → 9.3, grading →
// 9.5). Sends the account JWT when signed in.
export async function recordReviewVariant(
  userId: string,
  conceptId: string,
  variantId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${userId}/reviews/${conceptId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...jwtHeaders() },
    body: JSON.stringify({ lastVariantId: variantId }),
  });
  if (!res.ok) throw new Error(`recordReviewVariant failed: ${res.status}`);
}

// Grade an in-session review's recall, feeding it back to the FSRS scheduler
// (Story 9.5). Only SessionPlayer's in-session ReviewStep calls this —
// /review/[conceptId] extra practice stays permanently ungraded. Mints no
// XP/streak/Progress; returns the updated ReviewState row. Sends the account
// JWT when signed in.
export async function recordReview(
  userId: string,
  conceptId: string,
  correctCount: number,
  totalCount: number,
): Promise<ReviewState> {
  const res = await fetch(`${API_BASE}/users/${userId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...jwtHeaders() },
    body: JSON.stringify({ conceptId, correctCount, totalCount }),
  });
  if (!res.ok) throw new Error(`recordReview failed: ${res.status}`);
  return res.json();
}

// Record per-question difficulty telemetry (Story 10.5) — fire-and-forget from
// the instrumented surfaces (lesson / in-session review / daily). Writes only
// QuizOutcome rows server-side; mints NO XP/streak/Progress/FSRS grade. Every
// caller invokes it with `.catch(console.error)` so a telemetry failure never
// affects the learner's scoring, grade, or navigation. No-op on an empty batch.
// Sends the account JWT when signed in.
export async function recordQuizOutcomes(
  userId: string,
  outcomes: QuizOutcome[],
): Promise<void> {
  if (outcomes.length === 0) return;
  const res = await fetch(`${API_BASE}/users/${userId}/quiz-outcomes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...jwtHeaders() },
    body: JSON.stringify({ outcomes }),
  });
  if (!res.ok) throw new Error(`recordQuizOutcomes failed: ${res.status}`);
}

// Ingest a batch of behavioral events (Story 14.2) — fire-and-forget from the
// web `track()` client (lib/analytics.ts), the behavioral sibling of
// `recordQuizOutcomes`. Writes only Event rows server-side; mints NO
// XP/streak/Progress/FSRS grade. Like the other wrappers it THROWS on a non-ok
// response — analytics.ts wraps its flush call in `.catch(() => {})` so a
// telemetry failure never affects the learner. `keepalive: true` lets an
// unload-time flush (visibilitychange→hidden / pagehide) complete after the
// page starts unloading. No-op on an empty batch. Sends the account JWT when
// signed in. (Ingest is unauthenticated server-side, but sending the header is
// harmless and consistent with every other wrapper.)
export async function recordEvents(
  userId: string,
  events: EventInput[],
  keepalive = false,
): Promise<void> {
  if (events.length === 0) return;
  const res = await fetch(`${API_BASE}/users/${userId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...jwtHeaders() },
    body: JSON.stringify({ events }),
    keepalive,
  });
  if (!res.ok) throw new Error(`recordEvents failed: ${res.status}`);
}

// Fold an anonymous guest's state into the just-signed-in account (Story 7.4).
// Called from the auth success handlers after the account JWT has been stored,
// so `jwtHeaders()` carries the account's Bearer token. No body — the ids are
// path params. Throws on a non-ok response so the caller can swallow it (a
// failed merge must never block sign-in — Story 7.4 AC 7).
export async function mergeAnonymousUser(
  anonId: string,
  accountId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/users/${anonId}/merge-into/${accountId}`,
    { method: "POST", headers: jwtHeaders() },
  );
  if (!res.ok) throw new Error(`merge failed: ${res.status}`);
}

// Sign in with email/password (Story 7.3). Maps API status codes to stable
// string error messages the sign-in page discriminates on for its copy:
//   401 → "invalid_credentials"
export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) throw new Error("invalid_credentials");
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return res.json();
}

// Register a new email/password account (Story 7.3). Maps API status codes to
// stable string error messages the register page discriminates on:
//   409 → "email_taken"   400 → "validation_error"
export async function register(
  email: string,
  password: string,
  name?: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (res.status === 409) throw new Error("email_taken");
  if (res.status === 400) throw new Error("validation_error");
  if (!res.ok) throw new Error(`register failed: ${res.status}`);
  return res.json();
}
