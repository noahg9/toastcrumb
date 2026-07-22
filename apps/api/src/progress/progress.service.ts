import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string) {
    return this.prisma.progress.findMany({ where: { userId } });
  }

  /**
   * Upsert the granular Progress row for a (user, concept). Manages the
   * Progress table ONLY — the denormalized User fields (`completedConcepts`,
   * `currentNode`) are owned by `UsersService.awardLessonXp`, the single writer
   * of completion state (Story 4.4). This service no longer mutates the User
   * row, which removes both the duplicate-`push` bug and the divergence between
   * the two stores (deferred-work.md "two divergent sources of truth").
   */
  upsert(userId: string, conceptId: string, completion: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(completion)));

    return this.prisma.progress.upsert({
      where: { userId_conceptId: { userId, conceptId } },
      create: { userId, conceptId, completion: clamped },
      update: { completion: clamped, lastAccessed: new Date() },
    });
  }
}
