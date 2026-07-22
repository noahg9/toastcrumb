import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ProgressService } from "./progress.service";

@Controller("users/:userId/progress")
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get()
  list(@Param("userId") userId: string) {
    return this.progress.listForUser(userId);
  }

  @Put(":conceptId")
  upsert(
    @Param("userId") userId: string,
    @Param("conceptId") conceptId: string,
    @Body() body: { completion: number },
  ) {
    return this.progress.upsert(userId, conceptId, body?.completion ?? 0);
  }
}
