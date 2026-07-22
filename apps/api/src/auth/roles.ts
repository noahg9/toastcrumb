// Authorization roles (Story 14.1, Epic 14) — the single source of truth for
// the valid values of `User.role`.
//
// A validated string set, NOT a Postgres enum — mirrors the codebase's existing
// "enum-ish string" convention (`QUIZ_SURFACES` in users.controller.ts; the
// `QuizOutcome.surface` column). Adding a role later is a one-line change here
// with no DB migration.
//
// The only elevated value this epic uses is "superadmin"; "user" is the default
// every account starts at (schema default). Application code validates against
// this set — e.g. the `role:set` promotion script and `@Roles()`.

export const USER_ROLES = ["user", "superadmin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Runtime membership check for an unknown string (used by the role script). */
export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}
