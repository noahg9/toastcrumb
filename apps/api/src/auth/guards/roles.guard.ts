import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { UserRole } from "../roles";

/**
 * Authorizes a request against the `@Roles(...)` declared on the handler/class
 * (Story 14.1, Epic 14). Runs AFTER `JwtAuthGuard`, which authenticates and sets
 * `request.user = { userId }`:
 *
 *   @UseGuards(JwtAuthGuard, RolesGuard)   // auth first, then roles
 *   @Roles("superadmin")
 *
 * Two deliberate security properties:
 *
 * 1. **Fail-closed.** If a route carries this guard but NO `@Roles()` metadata,
 *    access is DENIED. A guarded route is never accidentally open to everyone
 *    because someone forgot the annotation.
 *
 * 2. **Fresh DB lookup — the JWT `role` claim is NEVER trusted (Decision 2).**
 *    The role is read from the database on every admin request, not from the
 *    token. JWTs here are stateless with a 7-day expiry and no revocation, so
 *    trusting a baked-in claim would let a demoted/compromised admin keep access
 *    until the token expired, and force a freshly-promoted admin to re-login. The
 *    per-request indexed PK lookup is negligible for low-traffic operator tooling.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    // Fail-closed: a guarded route with no @Roles() annotation is denied.
    if (!requiredRoles || requiredRoles.length === 0) {
      throw new ForbiddenException("No role policy on this route");
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authUser = request.user as { userId?: string } | undefined;
    // JwtAuthGuard must run before this guard; without it there is no userId.
    if (!authUser?.userId) {
      throw new ForbiddenException(
        "RolesGuard requires JwtAuthGuard to run first",
      );
    }

    // Fresh DB lookup — authoritative role, not the (UX-only) JWT claim.
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.userId },
      select: { role: true },
    });
    if (!user || !requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException("Insufficient role");
    }

    return true;
  }
}
