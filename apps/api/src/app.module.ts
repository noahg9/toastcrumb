import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthController } from "./health/health.controller";
import { UsersModule } from "./users/users.module";
import { ProgressModule } from "./progress/progress.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    ProgressModule,
    ReviewsModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
