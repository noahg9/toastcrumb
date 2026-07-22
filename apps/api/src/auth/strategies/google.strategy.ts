import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-google-oauth20";
import type { Profile, VerifyCallback } from "passport-google-oauth20";

/** Plain profile shape passed to AuthService.signInWithGoogle (no DB access here). */
export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string | null;
}

/**
 * Kicks off / consumes the Google OAuth2 flow. `validate` only extracts a plain
 * profile — find-or-create / link / token signing all happen in AuthService so
 * this strategy stays DB-free (mirrors JwtStrategy's stateless validate).
 *
 * Config is read from process.env to match 7.1's convention (ConfigModule is
 * global but the codebase reads process.env directly). main.ts fails fast if
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are unset.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor() {
    super({
      // main.ts fails fast at boot if these are unset, so they are defined here
      // (matches JwtStrategy's `secretOrKey as string` pattern from 7.1).
      clientID: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ??
        "http://localhost:4000/api/auth/google/callback",
      scope: ["email", "profile"],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value?.trim().toLowerCase();
    if (!email) {
      done(null, false, { message: "Google account has no email" });
      return;
    }

    const result: GoogleProfile = {
      googleId: profile.id,
      email,
      name: profile.displayName ?? null,
    };
    done(null, result);
  }
}
