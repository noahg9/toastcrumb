import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Bearer-token guard. Exported by AuthModule for later stories to apply via
 * `@UseGuards(JwtAuthGuard)`. Story 7.1 deliberately applies it to NO route.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
