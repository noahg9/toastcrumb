import { Module } from "@nestjs/common";
import { ProgressModule } from "../progress/progress.module";
import { ReviewsModule } from "../reviews/reviews.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [ProgressModule, ReviewsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
