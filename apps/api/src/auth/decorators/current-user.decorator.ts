import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** What `JwtAuthGuard` (via JwtStrategy.validate) attaches to `request.user`. */
export interface CurrentUserPayload {
  userId: string;
}

/**
 * Injects the authenticated `{ userId }` (set by `JwtAuthGuard`) into a handler
 * param (Story 14.1) — a small convenience for Story 14.3's admin controllers:
 *
 *   @Get("me") whoAmI(@CurrentUser() user: CurrentUserPayload) { ... }
 *
 * Only meaningful behind `JwtAuthGuard`; without it `request.user` is undefined.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as CurrentUserPayload | undefined;
  },
);
