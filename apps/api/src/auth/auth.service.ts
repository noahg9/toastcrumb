import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, User } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

const SALT_ROUNDS = 10;
// Pre-computed hash used as a constant-time dummy in login when the user does
// not exist or has no passwordHash — ensures bcrypt.compare always runs so
// response time doesn't reveal whether an email is registered.
const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

/** Public-facing user shape — explicit allowlist, never spread/omit. */
export interface SanitizedUser {
  id: string;
  email: string | null;
  name: string | null;
  // Authorization role (Story 14.1). A NON-SECRET, public field (unlike
  // passwordHash/googleId) — surfaced so the web app can gate the admin nav/route
  // (Story 14.4). NEVER the server-side security boundary: RolesGuard re-checks
  // the role via a fresh DB lookup on every admin request.
  role: string;
  xp: number;
  level: number;
  streak: number;
  lastActiveDate: Date | null;
  completedConcepts: string[];
  currentNode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResult {
  token: string;
  user: SanitizedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: { email, passwordHash, name: dto.name ?? null },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("email")
      ) {
        // Generic message — do not leak whether the password matched.
        throw new ConflictException("Email already registered");
      }
      throw err;
    }

    return {
      token: await this.signToken(user.id, user.role),
      user: sanitizeUser(user),
    };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always call bcrypt.compare regardless of whether the user exists — this
    // eliminates the timing oracle that would otherwise reveal whether an email
    // is registered (no-user short-circuit is ~µs; bcrypt is ~100ms).
    const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
    const passwordOk = await bcrypt.compare(dto.password, hashToCheck);

    if (!user || !user.passwordHash || !passwordOk) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return {
      token: await this.signToken(user.id, user.role),
      user: sanitizeUser(user),
    };
  }

  /**
   * Find-or-create / link a user from a Google profile, then sign the same JWT
   * the email/password flow issues. Linking by Google-verified email prevents a
   * duplicate account (and a P2002 crash) when an existing email/password user
   * later signs in with Google — see story 7.2 Dev Notes → Account linking.
   */
  async signInWithGoogle(profile: {
    googleId: string;
    email: string;
    name: string | null;
  }): Promise<AuthResult & { isNewUser: boolean }> {
    const { user, isNewUser } = await this.resolveGoogleUser(profile);
    return {
      token: await this.signToken(user.id, user.role),
      user: sanitizeUser(user),
      isNewUser,
    };
  }

  // isNewUser distinguishes a brand-new Google signup from a returning/linked
  // account (Story 14.2) so the web callback can emit the `register` telemetry
  // event instead of `sign_in` for first-time Google users.
  private async resolveGoogleUser(profile: {
    googleId: string;
    email: string;
    name: string | null;
  }): Promise<{ user: User; isNewUser: boolean }> {
    // 1. Already linked by googleId → use it.
    const byGoogleId = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });
    if (byGoogleId) return { user: byGoogleId, isNewUser: false };

    try {
      // 2. Existing email/password account with the same (verified) email → link.
      const byEmail = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });
      if (byEmail) {
        const linked = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: profile.googleId,
            // Only fill name if the existing row has none — don't clobber it.
            name: byEmail.name ?? profile.name,
          },
        });
        return { user: linked, isNewUser: false };
      }

      // 3. Brand-new Google-only account (passwordHash stays null; game-state
      //    defaults apply via the schema). Anonymous-progress merge is 7.4.
      const created = await this.prisma.user.create({
        data: {
          email: profile.email,
          googleId: profile.googleId,
          name: profile.name,
        },
      });
      return { user: created, isNewUser: true };
    } catch (err) {
      // Concurrent first-login race on googleId/email — re-fetch the winner.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Re-fetch the winner of the concurrent first-login race. Try googleId
        // first; fall back to email in case the P2002 was on the email
        // constraint and the winner was created with a different googleId.
        // Someone else's request created the row, so this request's view is
        // never the "new" one.
        const raced =
          (await this.prisma.user.findUnique({
            where: { googleId: profile.googleId },
          })) ??
          (await this.prisma.user.findUnique({
            where: { email: profile.email },
          }));
        if (raced) return { user: raced, isNewUser: false };
      }
      throw err;
    }
  }

  private signToken(userId: string, role: string): Promise<string> {
    // The `role` claim is a UX HINT ONLY — it lets the web app show/hide the
    // admin nav and route-gate /admin without an extra round-trip (Story 14.1
    // Decision 3). It is NEVER trusted for server-side authorization: RolesGuard
    // ignores this claim and re-reads the role from the DB per admin request
    // (Decision 2), so a stale claim in a still-valid 7-day token can neither
    // grant nor retain admin access after a demotion.
    return this.jwt.signAsync({ sub: userId, role });
  }
}

/**
 * Positive allowlist — explicitly constructs the public shape. New columns on
 * `User` (e.g. passwordHash, googleId) are excluded unless consciously added
 * here, so secrets can never leak by accident.
 */
function sanitizeUser(user: User): SanitizedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    // Consciously allowlisted: role is a public, non-secret field (Story 14.1).
    role: user.role,
    xp: user.xp,
    level: user.level,
    streak: user.streak,
    lastActiveDate: user.lastActiveDate,
    completedConcepts: user.completedConcepts,
    currentNode: user.currentNode,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
