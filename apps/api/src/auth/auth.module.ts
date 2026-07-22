import { Module } from "@nestjs/common";
import { JwtModule, JwtSignOptions } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { GoogleStrategy } from "./strategies/google.strategy";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { GoogleAuthGuard } from "./guards/google-auth.guard";
import { RolesGuard } from "./guards/roles.guard";

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      // Read config from process.env to match the codebase convention
      // (ConfigModule is global but the app reads process.env directly).
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        // Cast: @nestjs/jwt types expiresIn via ms's restrictive StringValue
        // template type, which a runtime env string is valid for (e.g. "7d").
        signOptions: {
          expiresIn: (process.env.JWT_EXPIRATION ??
            "7d") as JwtSignOptions["expiresIn"],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    JwtAuthGuard,
    GoogleAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, JwtStrategy, JwtAuthGuard, GoogleAuthGuard, RolesGuard],
})
export class AuthModule {}
