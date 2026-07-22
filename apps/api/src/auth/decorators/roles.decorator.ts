import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "../roles";

/**
 * Metadata key `RolesGuard` reads to learn which roles may access a handler.
 * Exported so the guard and the decorator agree on the exact string.
 */
export const ROLES_KEY = "roles";

/**
 * Declares the role(s) allowed to reach a route (Story 14.1). Pair with
 * `@UseGuards(JwtAuthGuard, RolesGuard)` — auth first (populates req.user), then
 * roles. A guarded route with NO `@Roles()` is denied by default (RolesGuard is
 * fail-closed), so annotate every guarded admin route explicitly.
 *
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles("superadmin")
 *   @Get("something") ...
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
