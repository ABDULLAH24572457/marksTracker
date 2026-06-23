import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ScoringCycleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class ScoringCyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  async archiveCurrent(user: AuthenticatedUser) {
    const snapshot =
      await this.reportsService.createFinalResultsSnapshot(user);

    return {
      message:
        'Current final results were archived successfully. Scores were not deleted.',
      snapshot,
    };
  }

  async resetCurrent(user: AuthenticatedUser) {
    const scoringCycle = await this.getActiveScoringCycle();
    const latestArchive = await this.prisma.scoreArchive.findFirst({
      where: {
        scoringCycleId: scoringCycle.id,
      },
      select: {
        id: true,
        snapshotVersion: true,
        archivedAt: true,
      },
      orderBy: {
        snapshotVersion: 'desc',
      },
    });

    if (!latestArchive) {
      throw new ConflictException(
        'Current scores cannot be reset until final results are archived.',
      );
    }

    const result = await this.prisma.$transaction(
      async (transaction) => {
        const deletedScores = await transaction.score.deleteMany({
          where: {
            scoringCycleId: scoringCycle.id,
          },
        });

        await transaction.auditLog.create({
          data: {
            userId: user.id,
            action: 'RESET_CURRENT_SCORING_CYCLE',
            entityType: 'ScoringCycle',
            entityId: scoringCycle.id,
            oldValue: {
              scoreCount: deletedScores.count,
            },
            newValue: {
              scoreCount: 0,
              preservedArchiveId: latestArchive.id,
              preservedSnapshotVersion:
                latestArchive.snapshotVersion,
            },
          },
        });

        return deletedScores;
      },
    );

    return {
      message:
        'Current scores were reset successfully. Users, committees, criteria, families, and archives were preserved.',
      scoringCycle: {
        id: scoringCycle.id,
        name: scoringCycle.name,
      },
      deletedScoreCount: result.count,
      preservedArchive: latestArchive,
    };
  }

  private async getActiveScoringCycle() {
    const scoringCycle = await this.prisma.scoringCycle.findFirst({
      where: {
        status: ScoringCycleStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!scoringCycle) {
      throw new NotFoundException('No active scoring cycle was found.');
    }

    return scoringCycle;
  }
}
