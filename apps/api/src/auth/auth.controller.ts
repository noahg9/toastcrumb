import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { GoogleAuthGuard } from "./guards/google-auth.guard";
import type { GoogleProfile } from "./strategies/google.strategy";

// Resolves to /api/auth/* via the global "api" prefix (main.ts).
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @HttpCode(201)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // Empty body — the guard alone triggers Passport's 302 to Google's consent
  // screen (email + profile scopes).
  @UseGuards(GoogleAuthGuard)
  @Get("google")
  googleAuth() {}

  // Google redirects here; the guard validates the code and attaches the
  // GoogleStrategy profile to req.user. We sign the same JWT as login/register
  // and 302 back to the web app with the token (the /auth/callback page that
  // consumes it is Story 7.3). @Res() opts out of Nest serialization so we can
  // redirect. The token is URL-encoded; no user fields are exposed in the URL.
  @UseGuards(GoogleAuthGuard)
  @Get("google/callback")
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const webAppUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";
    try {
      const { token, isNewUser } = await this.auth.signInWithGoogle(
        req.user as GoogleProfile,
      );
      // isNewUser (Story 14.2) lets the callback page emit `register` instead
      // of `sign_in` for a brand-new Google signup. Not PII — a boolean flag.
      res.redirect(
        `${webAppUrl}/auth/callback?token=${encodeURIComponent(token)}&isNewUser=${isNewUser ? "1" : "0"}`,
      );
    } catch {
      res.redirect(`${webAppUrl}/auth/error`);
    }
  }
}
