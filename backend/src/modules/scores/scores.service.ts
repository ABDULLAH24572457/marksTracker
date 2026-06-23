import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ScoringCycleStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateScoreDto } from './dto/create-score.dto';
import { UpdateScoreDto } from './dto/update-score.dto';

const scoreInclude = {
  scoringCycle: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  family: {
    select: {
      id: true,
      name: true,
      stage: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  criterion: {
    select: {
      id: true,
      title: true,
      description: true,
      maxScore: true,
      displayOrder: true,
      committeeId: true,
      committee: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  updatedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.ScoreInclude;

type CriterionAccess = {
  id: string;
  committeeId: string;
  maxScore: Prisma.Decimal;
};

@Injectable()
export class ScoresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createScoreDto: CreateScoreDto, user: AuthenticatedUser) {
    const criterion = await this.getCriterion(createScoreDto.criterionId);

    this.assertCommitteeAccess(criterion, user);
    this.assertScoreWithinMaximum(createScoreDto.score, criterion.maxScore);
    await this.ensureFamilyExists(createScoreDto.familyId);
    await this.ensureScoringCycleExists(createScoreDto.scoringCycleId);

    try {
      return await this.prisma.score.create({
        data: {
          scoringCycleId: createScoreDto.scoringCycleId,
          familyId: createScoreDto.familyId,
          criterionId: createScoreDto.criterionId,
          score: createScoreDto.score,
          createdById: user.id,
        },
        include: scoreInclude,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  findAll(user: AuthenticatedUser) {
    return this.prisma.score.findMany({
      where:
        user.role === UserRole.DATA_ENTRY
          ? {
              criterion: {
                committeeId: this.getAssignedCommitteeId(user),
              },
            }
          : undefined,
      include: scoreInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getContext(user: AuthenticatedUser) {
    const committeeId =
      user.role === UserRole.DATA_ENTRY
        ? this.getAssignedCommitteeId(user)
        : undefined;
    const [scoringCycle, families, criteria] = await Promise.all([
      this.prisma.scoringCycle.findFirst({
        where: {
          status: ScoringCycleStatus.ACTIVE,
        },
        select: {
          id: true,
          name: true,
          status: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      this.prisma.family.findMany({
        select: {
          id: true,
          name: true,
          stageId: true,
          stage: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [
          {
            stage: {
              name: 'asc',
            },
          },
          {
            name: 'asc',
          },
        ],
      }),
      this.prisma.criterion.findMany({
        where: committeeId ? { committeeId } : undefined,
        select: {
          id: true,
          title: true,
          description: true,
          maxScore: true,
          displayOrder: true,
          committeeId: true,
          committee: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [
          {
            committee: {
              name: 'asc',
            },
          },
          {
            displayOrder: 'asc',
          },
        ],
      }),
    ]);

    if (!scoringCycle) {
      throw new NotFoundException(
        'No active scoring cycle was found. An administrator must activate a scoring cycle before score entry.',
      );
    }

    return {
      scoringCycle,
      families,
      criteria,
    };
  }

  async reset(user: AuthenticatedUser) {
    const deletedCount = await this.prisma.$transaction(
      async (transaction) => {
        const deletedScores = await transaction.score.deleteMany();

        await transaction.auditLog.create({
          data: {
            userId: user.id,
            action: 'RESET_ALL_SCORES',
            entityType: 'Score',
            oldValue: {
              scoreCount: deletedScores.count,
            },
            newValue: {
              scoreCount: 0,
            },
          },
        });

        return deletedScores.count;
      },
    );

    return {
      message: 'تم تصفير الدرجات بنجاح',
      deletedCount,
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const score = await this.prisma.score.findUnique({
      where: { id },
      include: scoreInclude,
    });

    if (!score) {
      throw new NotFoundException('Score not found.');
    }

    this.assertCommitteeIdAccess(score.criterion.committee.id, user);

    return score;
  }

  async update(
    id: string,
    updateScoreDto: UpdateScoreDto,
    user: AuthenticatedUser,
  ) {
    const existingScore = await this.prisma.score.findUnique({
      where: { id },
      select: {
        id: true,
        scoringCycleId: true,
        familyId: true,
        criterionId: true,
        score: true,
        criterion: {
          select: {
            committeeId: true,
          },
        },
      },
    });

    if (!existingScore) {
      throw new NotFoundException('Score not found.');
    }

    this.assertCommitteeIdAccess(existingScore.criterion.committeeId, user);

    const scoringCycleId =
      updateScoreDto.scoringCycleId ?? existingScore.scoringCycleId;
    const familyId = updateScoreDto.familyId ?? existingScore.familyId;
    const criterionId = updateScoreDto.criterionId ?? existingScore.criterionId;
    const score = updateScoreDto.score ?? existingScore.score.toNumber();
    const criterion = await this.getCriterion(criterionId);

    this.assertCommitteeAccess(criterion, user);
    this.assertScoreWithinMaximum(score, criterion.maxScore);
    await this.ensureFamilyExists(familyId);
    await this.ensureScoringCycleExists(scoringCycleId);

    try {
      return await this.prisma.score.update({
        where: { id },
        data: {
          scoringCycleId,
          familyId,
          criterionId,
          score,
          updatedById: user.id,
        },
        include: scoreInclude,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string, user: AuthenticatedUser) {
    const existingScore = await this.prisma.score.findUnique({
      where: { id },
      select: {
        id: true,
        criterion: {
          select: {
            committeeId: true,
          },
        },
      },
    });

    if (!existingScore) {
      throw new NotFoundException('Score not found.');
    }

    this.assertCommitteeIdAccess(existingScore.criterion.committeeId, user);

    try {
      return await this.prisma.score.delete({
        where: { id },
        include: scoreInclude,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private async getCriterion(criterionId: string): Promise<CriterionAccess> {
    const criterion = await this.prisma.criterion.findUnique({
      where: { id: criterionId },
      select: {
        id: true,
        committeeId: true,
        maxScore: true,
      },
    });

    if (!criterion) {
      throw new BadRequestException('Criterion does not exist.');
    }

    return criterion;
  }

  private async ensureFamilyExists(familyId: string) {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { id: true },
    });

    if (!family) {
      throw new BadRequestException('Family does not exist.');
    }
  }

  private async ensureScoringCycleExists(scoringCycleId: string) {
    const scoringCycle = await this.prisma.scoringCycle.findUnique({
      where: { id: scoringCycleId },
      select: { id: true },
    });

    if (!scoringCycle) {
      throw new BadRequestException('Scoring cycle does not exist.');
    }
  }

  private assertScoreWithinMaximum(
    score: number,
    maximum: Prisma.Decimal,
  ) {
    if (new Prisma.Decimal(score).greaterThan(maximum)) {
      throw new BadRequestException(
        `Score cannot exceed the criterion maximum of ${maximum.toString()}.`,
      );
    }
  }

  private assertCommitteeAccess(
    criterion: Pick<CriterionAccess, 'committeeId'>,
    user: AuthenticatedUser,
  ) {
    this.assertCommitteeIdAccess(criterion.committeeId, user);
  }

  private assertCommitteeIdAccess(
    committeeId: string,
    user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.DATA_ENTRY) {
      return;
    }

    const assignedCommitteeId = this.getAssignedCommitteeId(user);

    if (committeeId !== assignedCommitteeId) {
      throw new ForbiddenException(
        'You cannot access scores from another committee.',
      );
    }
  }

  private getAssignedCommitteeId(user: AuthenticatedUser): string {
    if (!user.committeeId) {
      throw new ForbiddenException(
        'A committee assignment is required to access scores.',
      );
    }

    return user.committeeId;
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'A score already exists for this family and criterion in the scoring cycle.',
        );
      }

      if (error.code === 'P2003') {
        throw new BadRequestException(
          'One or more related score records do not exist.',
        );
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('Score not found.');
      }
    }

    throw error;
  }
}
