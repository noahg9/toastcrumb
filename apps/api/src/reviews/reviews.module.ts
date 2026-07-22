import { Module } from "@nestjs/common";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";

/**
 * Spaced-review scheduling (Story 9.1) + variant-serving controller (Story 9.2).
 * ReviewsController exposes read/record of the last-served variant; the review
 * scheduler is still also consumed by other modules (UsersModule seeds a
 * schedule on concept introduction); the grading endpoint arrives in Story 9.5.
 * Exports ReviewsService so UsersModule can inject it. PrismaService is
 * available via the @Global PrismaModule.
 */
@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
