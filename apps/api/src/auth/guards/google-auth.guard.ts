import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Triggers the passport-google-oauth20 flow. On `GET /api/auth/google` it issues
 * the 302 redirect to Google's consent screen; on the callback it validates the
 * code and attaches the GoogleStrategy profile to `request.user`.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {}
