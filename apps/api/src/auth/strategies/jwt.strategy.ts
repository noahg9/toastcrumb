import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

/**
 * Shape of the signed JWT payload (see AuthService.signToken).
 *
 * NOTE: the signed token ALSO carries a `role` claim (Story 14.1), deliberately
 * omitted here and never read by `validate` below. The `role` claim is a UX hint
 * for the web app only — NEVER trust it for authorization. Do not add `role` to
 * this interface and gate access on `payload.role`: JWTs here are stateless with
 * a 7-day expiry and no revocation, so a baked-in claim would let a demoted admin
 * keep access until the token expired. Authorization is `RolesGuard`'s job, and
 * it re-reads the role fresh from the DB on every admin request.
 */
interface JwtPayload {
  sub: string;
}

/**
 * Verifies the bearer token and attaches `{ userId }` to `request.user`.
 *
 * Stateless by design — no DB lookup on `validate` (see story 7.1 Dev Notes →
 * "Stateless JWT tradeoff"). A token stays valid until it expires even if the
 * user is deleted; the 7-day default expiry bounds that window.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // main.ts fails fast at boot if JWT_SECRET is unset, so this is defined.
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  validate(payload: JwtPayload) {
    return { userId: payload.sub };
  }
}
